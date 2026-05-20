import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// Чете API ключа директно от .env.local, заобикаляйки системната среда
// (Нужно когато parent процесът е задал ANTHROPIC_API_KEY="" празен)
function readApiKeyFromEnvFile(): string {
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {/* файлът не съществува */}
  return "";
}

function getApiKey(): string {
  const fromProcess = process.env.ANTHROPIC_API_KEY;
  if (fromProcess && fromProcess.length > 10) return fromProcess;
  return readApiKeyFromEnvFile();
}

interface GeocodeResult {
  display_name: string;
  address: {
    road?: string;
    house_number?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    country?: string;
  };
}

async function reverseGeocode(
  lat: number,
  lon: number
): Promise<{ full: string; short: string }> {
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
  const short = parts.join(", ") || data.display_name;
  return { full: data.display_name ?? `${lat}, ${lon}`, short };
}

export async function POST(req: NextRequest) {
  // Next.js 16: connection() гарантира четене на env vars по runtime
  await connection();

  const { lat, lon } = await req.json();

  if (typeof lat !== "number" || typeof lon !== "number") {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
  }
  const client = new Anthropic({ apiKey });

  const { full: place, short: shortAddress } = await reverseGeocode(lat, lon);

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Намирам се на следното място: ${place} (координати: ${lat.toFixed(5)}, ${lon.toFixed(5)}).

Разкажи ми за това място на български език в следния формат:

## 📍 Къде си

Кратко описание на точното местоположение (1-2 изречения).

## 🏛️ История

Интересна история за района или близкото населено място (3-4 изречения).

## ✨ Интересни факти

3 интересни факта за района, всеки на нов ред с тире (-).

## 🍽️ Места за хранене наблизо

Препоръчай 3-4 типа заведения или конкретни места (ако знаеш), подходящи за района. Ако не знаеш конкретни заведения, препоръчай типичната местна кухня и какво да търси човекът.

Бъди топъл, ангажиращ и информативен. Пиши сякаш си местен водач.`,
      },
    ],
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      // First chunk: address as JSON header line
      controller.enqueue(
        encoder.encode(`\x00${JSON.stringify({ address: shortAddress })}\n`)
      );
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
