import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// Заобикаля празния ANTHROPIC_API_KEY от Claude Code среда
function getApiKey(): string {
  const fromProcess = process.env.ANTHROPIC_API_KEY;
  if (fromProcess && fromProcess.length > 10) return fromProcess;
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch { /* ignore */ }
  return "";
}

interface GeocodeResult {
  display_name: string;
  address: {
    road?: string; house_number?: string; suburb?: string;
    city?: string; town?: string; village?: string;
    county?: string; country?: string;
  };
}

async function reverseGeocode(lat: number, lon: number): Promise<{ full: string; short: string }> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=bg`,
    { headers: { "User-Agent": "WhereAmI/1.0" } }
  );
  const data: GeocodeResult = await res.json();
  const a = data.address ?? {};
  const parts = [
    a.road && a.house_number ? `${a.road} ${a.house_number}` : a.road,
    a.suburb,
    a.city ?? a.town ?? a.village ?? a.county,
    a.country,
  ].filter(Boolean);
  return { full: data.display_name ?? `${lat}, ${lon}`, short: parts.join(", ") || data.display_name };
}

const LANG_PROMPTS: Record<string, { name: string; prompt: string }> = {
  bg: { name: "български", prompt: "Пиши на български. Бъди топъл и ангажиращ, сякаш си местен водач." },
  en: { name: "English",   prompt: "Write in English. Be warm and engaging, like a local guide." },
  de: { name: "Deutsch",   prompt: "Schreibe auf Deutsch. Sei warm und informativ, wie ein lokaler Reiseführer." },
  fr: { name: "français",  prompt: "Écris en français. Sois chaleureux et informatif, comme un guide local." },
  es: { name: "español",   prompt: "Escribe en español. Sé cálido e informativo, como un guía local." },
};

export async function POST(req: NextRequest) {
  await connection();
  const { lat, lon, lang = "bg" } = await req.json();

  if (typeof lat !== "number" || typeof lon !== "number")
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });

  const apiKey = getApiKey();
  if (!apiKey)
    return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

  const client = new Anthropic({ apiKey });
  const { full: place, short: shortAddress } = await reverseGeocode(lat, lon);
  const lp = LANG_PROMPTS[lang] ?? LANG_PROMPTS.bg;

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `I am at: ${place} (${lat.toFixed(5)}, ${lon.toFixed(5)}).

${lp.prompt}

Use this exact structure, but TRANSLATE the section headings into the target language (keep the emoji and the "## " prefix):

## 📍 [heading: "Where I am"]

Short description of the exact location (1-2 sentences).

## 🏛️ [heading: "History"]

Interesting history of the area (3-4 sentences).

## ✨ [heading: "Fun facts"]

3 interesting facts, each on a new line starting with "-".

## 🍽️ [heading: "Where to eat"]

Recommend 3-4 types of restaurants or specific places suitable for this area.

IMPORTANT: All text including the headings must be written in the target language.`,
    }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`\x00${JSON.stringify({ address: shortAddress })}\n`));
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta")
          controller.enqueue(encoder.encode(chunk.delta.text));
      }
      controller.close();
    },
  });

  return new NextResponse(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked" },
  });
}
