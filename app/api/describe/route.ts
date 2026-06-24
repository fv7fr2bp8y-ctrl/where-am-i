import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

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

const LANG_DESCRIBE: Record<string, string> = {
  bg: "Опиши какво виждаш на тази снимка на български. Сподели интересни детайли за архитектурата, природата или обстановката. Бъди кратък и ангажиращ (3-5 изречения).",
  en: "Describe what you see in this photo in English. Share interesting details about the architecture, nature or surroundings. Be brief and engaging (3-5 sentences).",
  de: "Beschreibe, was du auf diesem Foto siehst, auf Deutsch. Teile interessante Details mit (3-5 Sätze).",
  fr: "Décris ce que tu vois sur cette photo en français. Partage des détails intéressants (3-5 phrases).",
  es: "Describe lo que ves en esta foto en español. Comparte detalles interesantes (3-5 oraciones).",
};

export async function POST(req: NextRequest) {
  await connection();

  const { base64, mediaType, lang = "bg" } = await req.json();
  if (!base64 || !mediaType)
    return NextResponse.json({ error: "Missing image data" }, { status: 400 });

  const apiKey = getApiKey();
  if (!apiKey)
    return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

  const client = new Anthropic({ apiKey });
  const prompt = LANG_DESCRIBE[lang] ?? LANG_DESCRIBE.bg;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: prompt },
      ],
    }],
  });

  const text = msg.content.find((b) => b.type === "text");
  return NextResponse.json({ description: text?.type === "text" ? text.text : "" });
}
