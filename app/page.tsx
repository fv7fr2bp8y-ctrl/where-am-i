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

function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if (typeof window !== "undefined" && "speechSynthesis" in window)
    window.speechSynthesis.cancel();
}

// Резервен браузърен глас (когато ElevenLabs не е наличен)
function browserSpeak(text: string, ttsLang: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang.startsWith(ttsLang.slice(0, 2)));
  if (voice) utter.voice = voice;
  utter.lang = ttsLang;
  utter.rate = 0.95;
  window.speechSynthesis.speak(utter);
}

async function speakText(text: string, ttsLang: string) {
  stopSpeaking();

  // Първо опитваме висококачествения ElevenLabs глас
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      currentAudio = new Audio(url);
      currentAudio.onended = () => URL.revokeObjectURL(url);
      await currentAudio.play();
      return;
    }
  } catch {
    /* пада към браузърния глас по-долу */
  }

  // Резервен вариант — браузърният глас (винаги има звук)
  browserSpeak(text, ttsLang);
}

// Рендира **удебелен** текст в рамките на ред
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return (
        <strong key={j} style={{ color: "var(--espresso)" }}>
          {part.slice(2, -2)}
        </strong>
      );
    return part;
  });
}

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## "))
          return (
            <h2 key={i} className="guide-h text-xl mt-6 mb-2 first:mt-0">
              {renderInline(line.replace("## ", ""))}
            </h2>
          );
        if (line.startsWith("- ") || line.startsWith("• "))
          return (
            <p
              key={i}
              className="pl-3 border-l-2 ml-0.5 py-1 text-[15px] leading-relaxed"
              style={{ borderColor: "var(--amber)", color: "var(--ink)" }}
            >
              {renderInline(line.slice(2))}
            </p>
          );
        if (line.trim() === "") return <div key={i} className="h-1.5" />;
        return (
          <p key={i} className="text-[15px] leading-relaxed" style={{ color: "var(--ink)" }}>
            {renderInline(line)}
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
    await speakText(address, lang.tts);
    setSpeaking(false);
  }, [address, lang]);

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
                    setTimeout(() => speakText(parsedAddress, lang.tts), 300);
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
    stopSpeaking();
    setStatus("idle");
    setContent("");
    setCoords(null);
    setAddress("");
    setSpeaking(false);
    setPhotoDesc("");
    setTimeline([]);
    setTimelineLoading(false);
  }

  const busy = status === "locating" || status === "loading";

  return (
    <div className="bg-app">
      <div className="relative z-10 mx-auto w-full max-w-xl px-5 pb-16 pt-7">

        {/* ── Header ── */}
        <header className="text-center fade-in">
          <div className="text-5xl mb-2 floaty inline-block">🧭</div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight" style={{ color: "var(--espresso)" }}>
            Where am I?
          </h1>
          <p className="mt-1.5 text-[15px]" style={{ color: "var(--muted)" }}>
            Твоят джобен пътеводител из мястото, на което си
          </p>
        </header>

        {/* ── Language selector ── */}
        <div className="mt-6 flex justify-center gap-1.5 fade-in">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l)}
              className={`chip px-3 py-2 text-sm font-medium ${lang.code === l.code ? "chip-active" : ""}`}
            >
              <span className="mr-1">{l.flag}</span>{l.label}
            </button>
          ))}
        </div>

        {/* ── IDLE hero ── */}
        {status === "idle" && (
          <div className="mt-10 text-center fade-in">
            <div className="relative inline-flex">
              <span className="absolute inset-0 rounded-2xl ping-slow" style={{ background: "var(--terracotta)" }} />
              <button
                onClick={explore}
                className="btn-primary relative px-9 py-4 text-lg font-semibold"
              >
                📍 Открий къде съм
              </button>
            </div>

            {/* Feature hints */}
            <div className="mt-9 grid grid-cols-3 gap-3 fade-in">
              {[
                { icon: "🏛️", label: "История" },
                { icon: "🍽️", label: "Хранене" },
                { icon: "🕰️", label: "През вековете" },
              ].map((f) => (
                <div key={f.label} className="card flex flex-col items-center gap-1.5 px-2 py-4">
                  <span className="text-2xl">{f.icon}</span>
                  <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>{f.label}</span>
                </div>
              ))}
            </div>

            {/* History toggle */}
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory((p) => !p)}
                className="mt-7 text-sm font-medium transition-colors"
                style={{ color: "var(--muted)" }}
              >
                {showHistory ? "▲ Скрий" : "▼"} {history.length} предишни посещения
              </button>
            )}
          </div>
        )}

        {/* ── History panel ── */}
        {showHistory && history.length > 0 && status === "idle" && (
          <div className="card mt-4 p-5 fade-in">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-bold" style={{ color: "var(--espresso)" }}>
                🗺️ Дневник на пътешествията
              </h3>
              <button onClick={clearHistory} className="text-xs font-medium" style={{ color: "var(--terracotta)" }}>
                изчисти
              </button>
            </div>
            <div className="space-y-0.5">
              {history.map((v) => (
                <div key={v.id} className="flex items-start gap-3 border-b py-2.5 last:border-0" style={{ borderColor: "var(--border)" }}>
                  <span className="mt-0.5">📍</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm" style={{ color: "var(--ink)" }}>{v.address}</p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{v.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── LOCATING ── */}
        {status === "locating" && (
          <div className="mt-14 text-center fade-in">
            <div className="mb-4 inline-block text-5xl floaty">📡</div>
            <p className="text-[15px]" style={{ color: "var(--muted)" }}>Засичам къде си…</p>
          </div>
        )}

        {/* ── MAP + CONTENT ── */}
        {(status === "loading" || status === "done") && coords && (
          <div className="mt-6 space-y-4 fade-in">

            {/* Map */}
            <div className="card overflow-hidden p-1.5">
              <div className="overflow-hidden rounded-[1.1rem]">
                <Map lat={coords.lat} lon={coords.lon} address={address} />
              </div>
            </div>

            {/* Address bar */}
            {address ? (
              <div className="card flex items-center gap-3 px-4 py-3.5">
                <span className="text-base">📍</span>
                <span className="flex-1 truncate text-sm font-medium" style={{ color: "var(--ink)" }}>{address}</span>
                <button
                  onClick={handleSpeak}
                  title="Чети на глас"
                  className={`flex-shrink-0 text-xl transition-transform ${speaking ? "animate-pulse" : "hover:scale-110"}`}
                >
                  🔊
                </button>
              </div>
            ) : (
              <div className="card h-14 skeleton" />
            )}

            {/* Claude guide */}
            <div className="card p-6">
              {content ? (
                <MarkdownText text={content} />
              ) : (
                <div className="space-y-3">
                  <div className="skeleton h-5 w-1/3" />
                  <div className="skeleton h-4 w-full" />
                  <div className="skeleton h-4 w-5/6" />
                </div>
              )}
              {status === "loading" && content && (
                <div className="mt-4 h-1 w-full shimmer rounded-full" />
              )}
            </div>

            {/* Actions when done */}
            {status === "done" && (
              <div className="grid grid-cols-2 gap-2.5 fade-in">
                <button
                  onClick={() => photoRef.current?.click()}
                  className="btn-soft px-4 py-3 text-sm font-medium"
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
                <button
                  onClick={loadTimeline}
                  disabled={timelineLoading}
                  className="btn-soft px-4 py-3 text-sm font-medium disabled:opacity-50"
                >
                  🕰️ През историята
                </button>
                <button
                  onClick={reset}
                  className="btn-soft col-span-2 px-4 py-3 text-sm font-medium"
                >
                  🔄 Ново място
                </button>
              </div>
            )}

            {/* Timeline loading */}
            {timelineLoading && (
              <div className="card p-6 text-center fade-in">
                <div className="mb-3 inline-block text-3xl floaty">🕰️</div>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Claude избира епохи и рисува как е изглеждало мястото…
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="skeleton aspect-square" />
                  <div className="skeleton aspect-square" />
                  <div className="skeleton aspect-square" />
                </div>
              </div>
            )}

            {/* Timeline gallery */}
            {timeline.length > 0 && !timelineLoading && (
              <div className="space-y-4 fade-in">
                <h3 className="text-center font-display text-lg font-bold" style={{ color: "var(--espresso)" }}>
                  🕰️ Мястото през историята
                </h3>
                {timeline.map((era, i) => (
                  <div key={i} className="card overflow-hidden">
                    {era.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`data:image/png;base64,${era.image}`}
                        alt={era.year}
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center text-sm" style={{ color: "var(--muted)", background: "var(--cream-2)" }}>
                        🖼️ Изображението не успя да се генерира
                      </div>
                    )}
                    <div className="p-5">
                      <span className="mb-2 inline-block rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(194,96,60,0.12)", color: "var(--terracotta-d)" }}>
                        {era.year}
                      </span>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--ink)" }}>{era.caption}</p>
                    </div>
                  </div>
                ))}
                <p className="text-center text-xs" style={{ color: "var(--muted)" }}>
                  ⚠️ AI художествени възстановки, не реални снимки
                </p>
              </div>
            )}

            {/* Photo description */}
            {photoLoading && (
              <div className="card p-5 text-center fade-in">
                <div className="mb-2 inline-block text-2xl animate-spin">🔍</div>
                <p className="text-sm" style={{ color: "var(--muted)" }}>Claude разглежда снимката…</p>
              </div>
            )}
            {photoDesc && !photoLoading && (
              <div className="card p-5 fade-in">
                <h3 className="mb-2 font-display text-base font-bold" style={{ color: "var(--terracotta-d)" }}>
                  📸 Claude вижда
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--ink)" }}>{photoDesc}</p>
              </div>
            )}
          </div>
        )}

        {/* ── ERROR ── */}
        {status === "error" && (
          <div className="mt-10 space-y-4 text-center fade-in">
            <div className="card p-7">
              <div className="mb-3 text-3xl">⚠️</div>
              <p className="text-sm" style={{ color: "var(--ink)" }}>{error}</p>
            </div>
            <button onClick={reset} className="btn-soft px-7 py-3 text-sm font-medium">
              Опитай отново
            </button>
          </div>
        )}

        {/* footer */}
        {!busy && (
          <p className="mt-12 text-center text-xs" style={{ color: "var(--muted)" }}>
            Създадено с Claude · карти от OpenStreetMap
          </p>
        )}
      </div>
    </div>
  );
}
