import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

function getElevenLabsKey(): string {
  const fromProcess = process.env.ELEVENLABS_API_KEY;
  if (fromProcess && fromProcess.length > 5) return fromProcess;
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const match = content.match(/^ELEVENLABS_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch { /* ignore */ }
  return "";
}

// Най-добрият мултиезичен глас на ElevenLabs
// "Charlotte" — топъл, естествен, поддържа BG/EN/DE/FR/ES
const VOICE_ID = "XB0fDUnXU5powFXDhCwa";
const MODEL_ID = "eleven_multilingual_v2";

export async function POST(req: NextRequest) {
  await connection();

  const { text } = await req.json();
  if (!text || typeof text !== "string")
    return NextResponse.json({ error: "Missing text" }, { status: 400 });

  const apiKey = getElevenLabsKey();
  if (!apiKey)
    return NextResponse.json({ error: "Missing ELEVENLABS_API_KEY" }, { status: 500 });

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("ElevenLabs error:", err);
    return NextResponse.json({ error: "TTS failed" }, { status: 500 });
  }

  const audioBuffer = await res.arrayBuffer();

  return new NextResponse(audioBuffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
