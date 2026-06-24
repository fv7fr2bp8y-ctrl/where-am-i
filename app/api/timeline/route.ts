import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

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

  const { place, lang = "bg" } = await req.json();
  if (!place || typeof place !== "string")
    return NextResponse.json({ error: "Missing place" }, { status: 400 });

  const anthropicKey = getKey("ANTHROPIC_API_KEY");
  const openaiKey = getKey("OPENAI_API_KEY");
  if (!anthropicKey || !openaiKey)
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
- "prompt": a detailed, vivid ENGLISH image-generation prompt describing how this exact location looked at that time — architecture, people, clothing, atmosphere, historically accurate. Photorealistic or period-appropriate illustration style.

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

  // 2. Генерираме изображение за всяка епоха паралелно
  const images = await Promise.all(
    eras.slice(0, 3).map(async (era) => {
      try {
        const res = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt: era.prompt,
            n: 1,
            size: "1024x1024",
            quality: "low", // по-бързо и евтино
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error("gpt-image-1 error:", err);
          return { ...era, image: null, error: "image_failed" };
        }
        const data = await res.json();
        const b64 = data.data?.[0]?.b64_json ?? null;
        return { year: era.year, caption: era.caption, image: b64 };
      } catch (e) {
        console.error("image gen exception:", e);
        return { ...era, image: null, error: "exception" };
      }
    })
  );

  return NextResponse.json({ eras: images });
}

export const maxDuration = 120;
