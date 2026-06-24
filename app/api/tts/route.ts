import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// Чете ключ от средата или директно от .env.local (заобикаля празни env vars)
function getKey(...names: string[]): string {
  for (const name of names) {
    const v = process.env[name];
    if (v && v.length > 10) return v;
  }
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const name of names) {
      const m = content.match(new RegExp(`^${name}=(.+)$`, "m"));
      if (m) return m[1].trim();
    }
  } catch { /* ignore */ }
  return "";
}

const MODEL = "gemini-2.5-flash-preview-tts";
const VOICE = "Schedar"; // мъжки, спокоен (от рецептата)

// Опакова суров PCM (16-bit mono) в WAV буфер с 44-байтов хедър
function pcmToWav(pcm: Buffer, rate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);      // PCM
  header.writeUInt16LE(1, 22);      // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); // byte rate (mono, 16-bit)
  header.writeUInt16LE(2, 32);      // block align
  header.writeUInt16LE(16, 34);     // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

interface InlineData { data?: string; mimeType?: string }

async function geminiTTS(text: string, key: string): Promise<InlineData | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ВАЖНО: само текстът — никакви стилови инструкции (иначе връща текст вместо аудио)
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
      }),
    }
  );
  if (!res.ok) return null;
  const json = await res.json();
  const part = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  return part?.data ? part : null;
}

export async function POST(req: NextRequest) {
  await connection();

  const { text } = await req.json();
  if (!text || typeof text !== "string")
    return NextResponse.json({ error: "Missing text" }, { status: 400 });

  const key = getKey("GOOGLE_API_KEY", "GEMINI_API_KEY");
  if (!key)
    return NextResponse.json({ error: "Missing GOOGLE_API_KEY" }, { status: 500 });

  // Един повторен опит при празен отговор (от рецептата)
  let part = await geminiTTS(text, key);
  if (!part) part = await geminiTTS(text, key);
  if (!part?.data) {
    return NextResponse.json({ error: "TTS returned no audio" }, { status: 502 });
  }

  const rate = parseInt((part.mimeType?.match(/rate=(\d+)/) ?? [])[1] ?? "24000", 10);
  const pcm = Buffer.from(part.data, "base64");
  const wav = pcmToWav(pcm, rate);

  return new NextResponse(new Uint8Array(wav), {
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store",
    },
  });
}
