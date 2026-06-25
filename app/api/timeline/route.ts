import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { gridKey, getTimeline, setTimeline, uploadImage, blobEnabled } from "../../lib/cache";

function getKey(name: string): string {
  const fromProcess = process.env[name];
  if (fromProcess && fromProcess.length > 10) return fromProcess;
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const match = content.match(new RegExp(`^${name}=(.+)$`, "m"));
    if (match) return match[1].trim();
  } catch { /* ignore */ }
  return "";
}

interface Era {
  year: string;   // напр. "около 100 г." / "1900" / "1944"
  caption: string; // кратко описание на езика на потребителя
  prompt: string;  // подробен визуален prompt на английски за image модела
}

const CAPTION_LANG: Record<string, string> = {
  bg: "български", en: "English", de: "Deutsch", fr: "français", es: "español",
};

export async function POST(req: NextRequest) {
  await connection();

  const { place, lang = "bg", lat, lon } = await req.json();
  if (!place || typeof place !== "string")
    return NextResponse.json({ error: "Missing place" }, { status: 400 });

  // Кеш ключ по координати (ако са подадени)
  const hasCoords = typeof lat === "number" && typeof lon === "number";
  const cacheKey = hasCoords ? `timeline:${lang}:${gridKey(lat, lon)}` : null;

  // 0) Кеш хит
  if (cacheKey) {
    const cached = await getTimeline(cacheKey);
    if (cached) return NextResponse.json({ eras: cached, cache: "HIT" });
  }

  const anthropicKey = getKey("ANTHROPIC_API_KEY");
  const googleKey = getKey("GOOGLE_API_KEY") || getKey("GEMINI_API_KEY");
  if (!anthropicKey || !googleKey)
    return NextResponse.json({ error: "Missing API keys" }, { status: 500 });

  // 1. Claude избира 3 ключови епохи + пише image prompt-ове
  const client = new Anthropic({ apiKey: anthropicKey });
  const captionLang = CAPTION_LANG[lang] ?? "български";

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `For the location "${place}", pick 3 important moments in its history (different eras — e.g. ancient, medieval/Ottoman, early 20th century, WWII, etc., whatever fits this specific place).

For each, return:
- "year": a short label of the period (in ${captionLang})
- "caption": one sentence describing what was happening there then (in ${captionLang})
- "prompt": a detailed, vivid ENGLISH image-generation prompt describing how this exact location looked at that time — architecture, people, clothing, atmosphere, historically accurate. Describe it as a REALISTIC PHOTOGRAPH: specify camera feel (e.g. "documentary photograph", "vintage photo", "cinematic wide shot"), natural lighting, realistic textures and depth of field. Avoid cartoon/illustration look.

Respond ONLY with a JSON array of 3 objects, no other text. Example:
[{"year":"...","caption":"...","prompt":"..."}]`,
    }],
  });

  const textBlock = msg.content.find((b) => b.type === "text");
  const raw = textBlock?.type === "text" ? textBlock.text : "[]";
  let eras: Era[];
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    eras = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    return NextResponse.json({ error: "Failed to parse eras" }, { status: 500 });
  }

  // 2. Генерираме изображение за всяка епоха през Google Gemini (Nano Banana)
  const images = await Promise.all(
    eras.slice(0, 3).map((era) => generateImage(era, googleKey))
  );

  // 3. Качваме снимките в Blob и кешираме метаданните (само ако Blob е наличен)
  if (cacheKey && blobEnabled()) {
    const uploaded = await Promise.all(
      images.map(async (e, i) => {
        if (!e.image) return e;
        const url = await uploadImage(`${cacheKey.replace(/:/g, "_")}_${i}.png`, e.image);
        return { year: e.year, caption: e.caption, image: url ?? e.image };
      })
    );
    // Кешираме само ако всички снимки са качени като URL-и (малки метаданни)
    const allUrls = uploaded.every((e) => e.image && e.image.startsWith("http"));
    if (allUrls) {
      await setTimeline(cacheKey, uploaded);
      return NextResponse.json({ eras: uploaded, cache: "MISS" });
    }
    return NextResponse.json({ eras: uploaded, cache: "SKIP" });
  }

  return NextResponse.json({ eras: images, cache: "OFF" });
}

const IMAGE_MODEL = "gemini-2.5-flash-image";

const REALISM = " — ultra-realistic photograph, photorealistic, highly detailed, natural lighting, realistic textures, sharp focus, cinematic depth of field, true-to-life colors, 4k, NOT a cartoon, NOT an illustration.";

async function geminiImageOnce(prompt: string, key: string): Promise<string | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt + REALISM }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    }
  );
  if (!res.ok) return null;
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
  return img?.inlineData?.data ?? null;
}

async function generateImage(era: Era, key: string) {
  try {
    // Един повторен опит при празен отговор (free tier може да троттлне)
    let b64 = await geminiImageOnce(era.prompt, key);
    if (!b64) b64 = await geminiImageOnce(era.prompt, key);
    return { year: era.year, caption: era.caption, image: b64 };
  } catch (e) {
    console.error("gemini image error:", e);
    return { year: era.year, caption: era.caption, image: null };
  }
}

export const maxDuration = 120;
