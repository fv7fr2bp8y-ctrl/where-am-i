"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";

const Map = dynamic(() => import("./components/Map"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────
type Status = "idle" | "locating" | "loading" | "done" | "error";

interface Visit {
  id: string;
  date: string;
  address: string;
  lat: number;
  lon: number;
}

interface Lang {
  code: string;
  flag: string;
  label: string;
  tts: string;
}

interface TimelineEra {
  year: string;
  caption: string;
  image: string | null;
}

const LANGS: Lang[] = [
  { code: "bg", flag: "🇧🇬", label: "БГ", tts: "bg-BG" },
  { code: "en", flag: "🇬🇧", label: "EN", tts: "en-GB" },
  { code: "de", flag: "🇩🇪", label: "DE", tts: "de-DE" },
  { code: "fr", flag: "🇫🇷", label: "FR", tts: "fr-FR" },
  { code: "es", flag: "🇪🇸", label: "ES", tts: "es-ES" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
let currentAudio: HTMLAudioElement | null = null;

async function speakText(text: string) {
  // Спираме предишния звук
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("TTS failed");

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.play();
    currentAudio.onended = () => URL.revokeObjectURL(url);
  } catch (e) {
    console.error("TTS error:", e);
  }
}

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## "))
          return (
            <h2 key={i} className="text-lg font-semibold mt-5 mb-1 text-indigo-300 tracking-wide">
              {line.replace("## ", "")}
            </h2>
          );
        if (line.startsWith("- "))
          return (
            <p key={i} className="text-slate-300 pl-3 border-l-2 border-indigo-800 ml-1 py-0.5 text-sm">
              {line.slice(2)}
            </p>
          );
        if (line.trim() === "") return <div key={i} className="h-2" />;
        return (
          <p key={i} className="text-slate-300 leading-relaxed text-sm">
            {line}
          </p>
        );
      })}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [address, setAddress] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [lang, setLang] = useState<Lang>(LANGS[0]);
  const [history, setHistory] = useState<Visit[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [photoDesc, setPhotoDesc] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEra[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("wai-history");
      if (stored) setHistory(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  function saveVisit(addr: string, lat: number, lon: number) {
    const visit: Visit = {
      id: Date.now().toString(),
      date: new Date().toLocaleString("bg-BG"),
      address: addr,
      lat,
      lon,
    };
    setHistory((prev) => {
      const next = [visit, ...prev].slice(0, 20);
      localStorage.setItem("wai-history", JSON.stringify(next));
      return next;
    });
  }

  function clearHistory() {
    setHistory([]);
    localStorage.removeItem("wai-history");
  }

  const handleSpeak = useCallback(async () => {
    if (!address) return;
    setSpeaking(true);
    await speakText(address);
    setSpeaking(false);
  }, [address]);

  async function explore() {
    setContent("");
    setError("");
    setAddress("");
    setCoords(null);
    setPhotoDesc("");
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
            body: JSON.stringify({ lat, lon, lang: lang.code }),
            signal: abortRef.current.signal,
          });

          if (!res.ok) throw new Error("API error");

          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let headerParsed = false;
          let buffer = "";
          let parsedAddress = "";

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
                    const meta = JSON.parse(buffer.slice(nullIdx + 1, newlineIdx));
                    parsedAddress = meta.address ?? "";
                    setAddress(parsedAddress);
                    setTimeout(() => speakText(parsedAddress), 300);
                  } catch { /* ignore */ }
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
          if (parsedAddress) saveVisit(parsedAddress, lat, lon);
        } catch (e: unknown) {
          if (e instanceof Error && e.name === "AbortError") return;
          setError("Нещо се обърка. Провери ANTHROPIC_API_KEY.");
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

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    setPhotoDesc("");

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp";
      try {
        const res = await fetch("/api/describe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64, mediaType, lang: lang.code }),
        });
        const data = await res.json();
        setPhotoDesc(data.description ?? "");
      } catch {
        setPhotoDesc("Не успях да анализирам снимката.");
      }
      setPhotoLoading(false);
    };
    reader.readAsDataURL(file);
  }

  async function loadTimeline() {
    if (!address) return;
    setTimelineLoading(true);
    setTimeline([]);
    try {
      const res = await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place: address, lang: lang.code }),
      });
      const data = await res.json();
      setTimeline(data.eras ?? []);
    } catch {
      /* ignore */
    }
    setTimelineLoading(false);
  }

  function reset() {
    abortRef.current?.abort();
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    setStatus("idle");
    setContent("");
    setCoords(null);
    setAddress("");
    setSpeaking(false);
    setPhotoDesc("");
    setTimeline([]);
    setTimelineLoading(false);
  }

  return (
    <div className="bg-app relative">
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="text-center fade-in">
          <div className="text-5xl mb-2 drop-shadow-lg">🌍</div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            Where am I?
          </h1>
          <p className="text-slate-500 text-sm">История, факти и хранене наблизо</p>
        </div>

        {/* ── Language selector ── */}
        <div className="flex justify-center gap-2 fade-in">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                lang.code === l.code
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/50"
                  : "glass text-slate-400 hover:text-white"
              }`}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>

        {/* ── IDLE ── */}
        {status === "idle" && (
          <div className="text-center fade-in space-y-3">
            <div className="relative inline-flex">
              <div className="absolute inset-0 rounded-2xl bg-indigo-500 ping-slow" />
              <button
                onClick={explore}
                className="relative bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all font-semibold text-base px-10 py-4 rounded-2xl shadow-xl shadow-indigo-900/60"
              >
                📍 Открий къде съм
              </button>
            </div>

            {/* History toggle */}
            {history.length > 0 && (
              <div>
                <button
                  onClick={() => setShowHistory((p) => !p)}
                  className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
                >
                  {showHistory ? "▲" : "▼"} {history.length} предишни посещения
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── History panel ── */}
        {showHistory && history.length > 0 && (
          <div className="glass p-4 space-y-2 fade-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-300">🗺️ История на посещенията</h3>
              <button onClick={clearHistory} className="text-xs text-red-400 hover:text-red-300">изчисти</button>
            </div>
            {history.map((v) => (
              <div key={v.id} className="flex gap-3 items-start py-2 border-b border-white/5 last:border-0">
                <div className="text-indigo-400 mt-0.5">📍</div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300 text-xs truncate">{v.address}</p>
                  <p className="text-slate-600 text-xs mt-0.5">{v.date}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── LOCATING ── */}
        {status === "locating" && (
          <div className="text-center py-10 fade-in">
            <div className="text-5xl animate-bounce mb-3">📡</div>
            <p className="text-slate-400 text-sm">Засичам GPS...</p>
          </div>
        )}

        {/* ── MAP + CONTENT ── */}
        {(status === "loading" || status === "done") && coords && (
          <div className="space-y-4 fade-in">

            {/* Map */}
            <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
              <Map lat={coords.lat} lon={coords.lon} address={address} />
            </div>

            {/* Address bar */}
            {address && (
              <div className="glass flex items-center gap-3 px-4 py-3">
                <span className="text-slate-400 text-sm flex-1 truncate">📍 {address}</span>
                <button
                  onClick={handleSpeak}
                  title="Чети на глас"
                  className={`flex-shrink-0 text-lg transition-all ${speaking ? "animate-pulse text-indigo-400" : "text-slate-500 hover:text-indigo-400"}`}
                >
                  🔊
                </button>
              </div>
            )}

            {/* Claude content */}
            <div className="glass p-5">
              <MarkdownText text={content} />
              {status === "loading" && (
                <div className="mt-3 h-0.5 w-full shimmer rounded-full" />
              )}
            </div>

            {/* Actions when done */}
            {status === "done" && (
              <div className="flex flex-wrap gap-2 justify-center pt-1 fade-in">
                {/* Photo button */}
                <button
                  onClick={() => photoRef.current?.click()}
                  className="glass text-slate-300 hover:text-white px-5 py-2 rounded-xl text-sm transition-all hover:border-indigo-500/50"
                >
                  📸 Снимай мястото
                </button>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhoto}
                />
                {/* Timeline button */}
                <button
                  onClick={loadTimeline}
                  disabled={timelineLoading}
                  className="glass text-slate-300 hover:text-white px-5 py-2 rounded-xl text-sm transition-all hover:border-indigo-500/50 disabled:opacity-50"
                >
                  🕰️ Виж през историята
                </button>
                <button
                  onClick={reset}
                  className="glass text-slate-400 hover:text-white px-5 py-2 rounded-xl text-sm transition-all"
                >
                  🔄 Ново място
                </button>
              </div>
            )}

            {/* Timeline loading */}
            {timelineLoading && (
              <div className="glass p-6 text-center fade-in">
                <div className="text-3xl mb-3 animate-pulse">🕰️</div>
                <p className="text-slate-400 text-sm">
                  Claude избира исторически епохи и рисува как е изглеждало мястото...
                </p>
                <div className="mt-3 h-0.5 w-full shimmer rounded-full" />
              </div>
            )}

            {/* Timeline gallery */}
            {timeline.length > 0 && !timelineLoading && (
              <div className="space-y-4 fade-in">
                <h3 className="text-center text-indigo-400 font-semibold text-sm">
                  🕰️ Мястото през историята
                </h3>
                {timeline.map((era, i) => (
                  <div key={i} className="glass overflow-hidden">
                    {era.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`data:image/png;base64,${era.image}`}
                        alt={era.year}
                        className="w-full aspect-square object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center text-slate-600 text-sm bg-slate-800/50">
                        🖼️ Изображението не успя да се генерира
                      </div>
                    )}
                    <div className="p-4">
                      <div className="inline-block bg-indigo-600/30 text-indigo-300 text-xs font-semibold px-2.5 py-1 rounded-lg mb-2">
                        {era.year}
                      </div>
                      <p className="text-slate-300 text-sm leading-relaxed">{era.caption}</p>
                    </div>
                  </div>
                ))}
                <p className="text-center text-slate-600 text-xs">
                  ⚠️ AI художествени възстановки, не реални снимки
                </p>
              </div>
            )}

            {/* Photo description */}
            {photoLoading && (
              <div className="glass p-4 text-center fade-in">
                <div className="text-2xl animate-spin mb-2">🔍</div>
                <p className="text-slate-400 text-sm">Claude анализира снимката...</p>
              </div>
            )}
            {photoDesc && !photoLoading && (
              <div className="glass p-4 fade-in">
                <h3 className="text-indigo-400 font-semibold text-sm mb-2">📸 Claude вижда:</h3>
                <p className="text-slate-300 text-sm leading-relaxed">{photoDesc}</p>
              </div>
            )}
          </div>
        )}

        {/* ── ERROR ── */}
        {status === "error" && (
          <div className="text-center space-y-4 fade-in">
            <div className="glass border-red-900/50 p-6">
              <div className="text-3xl mb-3">⚠️</div>
              <p className="text-red-400 text-sm">{error}</p>
            </div>
            <button
              onClick={reset}
              className="glass text-slate-400 hover:text-white px-6 py-2 rounded-xl text-sm transition-colors"
            >
              Опитай отново
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
