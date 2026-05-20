"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";

// Leaflet изисква window — зареждаме го само в браузъра
const Map = dynamic(() => import("./components/Map"), { ssr: false });

type Status = "idle" | "locating" | "loading" | "done" | "error";

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <h2 key={i} className="text-xl font-bold mt-6 mb-2 text-white">
              {line.replace("## ", "")}
            </h2>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <p key={i} className="text-slate-300 pl-4">{line}</p>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return (
          <p key={i} className="text-slate-300 leading-relaxed">{line}</p>
        );
      })}
    </div>
  );
}

function speakAddress(address: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(address);

  // Намираме български глас ако има, иначе използваме първия наличен
  const voices = window.speechSynthesis.getVoices();
  const bgVoice = voices.find((v) => v.lang.startsWith("bg"));
  if (bgVoice) utter.voice = bgVoice;
  utter.lang = bgVoice ? "bg-BG" : "en-US";
  utter.rate = 0.95;

  window.speechSynthesis.speak(utter);
}

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [address, setAddress] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleSpeak = useCallback(() => {
    if (!address) return;
    setSpeaking(true);
    speakAddress(address);
    setTimeout(() => setSpeaking(false), 3500);
  }, [address]);

  async function explore() {
    setContent("");
    setError("");
    setAddress("");
    setCoords(null);
    setStatus("locating");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setCoords({ lat, lon });
        setStatus("loading");

        abortRef.current = new AbortController();

        try {
          const res = await fetch("/api/explore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lon }),
            signal: abortRef.current.signal,
          });

          if (!res.ok) throw new Error("API error");

          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let headerParsed = false;
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });

            if (!headerParsed) {
              buffer += chunk;
              const nullIdx = buffer.indexOf("\x00");
              if (nullIdx !== -1) {
                const newlineIdx = buffer.indexOf("\n", nullIdx);
                if (newlineIdx !== -1) {
                  try {
                    const jsonStr = buffer.slice(nullIdx + 1, newlineIdx);
                    const meta = JSON.parse(jsonStr);
                    setAddress(meta.address ?? "");
                    // Автоматично чети адреса веднага
                    setTimeout(() => speakAddress(meta.address ?? ""), 300);
                  } catch {/* ignore parse errors */}
                  // Остатъкът след header-а е реалното съдържание
                  const rest = buffer.slice(newlineIdx + 1);
                  if (rest) setContent(rest);
                  headerParsed = true;
                  buffer = "";
                }
              }
            } else {
              setContent((prev) => prev + chunk);
            }
          }

          setStatus("done");
        } catch (e: unknown) {
          if (e instanceof Error && e.name === "AbortError") return;
          setError("Нещо се обърка. Провери ANTHROPIC_API_KEY в .env.local");
          setStatus("error");
        }
      },
      () => {
        setError("Не можах да открия местоположението. Разреши GPS достъп.");
        setStatus("error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function reset() {
    abortRef.current?.abort();
    window.speechSynthesis?.cancel();
    setStatus("idle");
    setContent("");
    setCoords(null);
    setAddress("");
    setSpeaking(false);
  }

  return (
    <main className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-2xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🌍</div>
          <h1 className="text-4xl font-bold mb-1">Where am I?</h1>
          <p className="text-slate-400">История, факти и хранене наблизо</p>
        </div>

        {/* IDLE */}
        {status === "idle" && (
          <div className="text-center">
            <button
              onClick={explore}
              className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all font-semibold text-lg px-10 py-4 rounded-2xl shadow-lg shadow-indigo-900/50"
            >
              📍 Открий къде съм
            </button>
          </div>
        )}

        {/* LOCATING */}
        {status === "locating" && (
          <div className="text-center py-10">
            <div className="text-5xl animate-bounce mb-4">📡</div>
            <p className="text-slate-300">Засичам GPS...</p>
          </div>
        )}

        {/* MAP + ADDRESS + CONTENT */}
        {(status === "loading" || status === "done") && coords && (
          <div className="space-y-4">

            {/* Карта */}
            <div className="overflow-hidden rounded-2xl border border-slate-700 shadow-xl">
              <Map lat={coords.lat} lon={coords.lon} address={address} />
            </div>

            {/* Адрес + бутон за глас */}
            {address && (
              <div className="flex items-center gap-3 bg-slate-800 rounded-xl px-4 py-3 border border-slate-700">
                <span className="text-slate-400 text-sm flex-1">📍 {address}</span>
                <button
                  onClick={handleSpeak}
                  title="Чети адреса на глас"
                  className={`flex-shrink-0 text-xl transition-transform ${
                    speaking ? "animate-pulse scale-110" : "hover:scale-110"
                  }`}
                >
                  🔊
                </button>
              </div>
            )}

            {/* Разказ на Claude */}
            <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl">
              <MarkdownText text={content} />
              {status === "loading" && (
                <span className="inline-block w-2 h-4 bg-indigo-400 animate-pulse ml-1 rounded-sm align-middle" />
              )}
            </div>

            {status === "done" && (
              <div className="text-center pt-2">
                <button
                  onClick={reset}
                  className="text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 transition-colors px-6 py-2 rounded-xl text-sm"
                >
                  🔄 Ново местоположение
                </button>
              </div>
            )}
          </div>
        )}

        {/* ERROR */}
        {status === "error" && (
          <div className="text-center space-y-4">
            <div className="bg-red-900/40 border border-red-700 rounded-2xl p-6">
              <div className="text-3xl mb-3">⚠️</div>
              <p className="text-red-300">{error}</p>
            </div>
            <button
              onClick={reset}
              className="text-slate-400 hover:text-white border border-slate-600 hover:border-slate-400 transition-colors px-6 py-2 rounded-xl text-sm"
            >
              Опитай отново
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
