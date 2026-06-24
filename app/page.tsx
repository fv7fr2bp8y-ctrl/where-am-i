"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import Splash from "./components/Splash";
import {
  PinIcon, LandmarkIcon, FoodIcon, SparkleIcon, ClockIcon,
  CameraIcon, SpeakerIcon, GlobeIcon, CompassIcon, RefreshIcon,
  WarningIcon, ChevronIcon, CheckIcon,
} from "./components/Icons";

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
  name: string;
  tts: string;
}

interface TimelineEra {
  year: string;
  caption: string;
  image: string | null;
}

const LANGS: Lang[] = [
  { code: "bg", flag: "🇧🇬", label: "БГ", name: "Български", tts: "bg-BG" },
  { code: "en", flag: "🇬🇧", label: "EN", name: "English", tts: "en-GB" },
  { code: "de", flag: "🇩🇪", label: "DE", name: "Deutsch", tts: "de-DE" },
  { code: "fr", flag: "🇫🇷", label: "FR", name: "Français", tts: "fr-FR" },
  { code: "es", flag: "🇪🇸", label: "ES", name: "Español", tts: "es-ES" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
let currentAudio: HTMLAudioElement | null = null;

function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}

// Само висококачественият Gemini глас. Без роботски браузърен резерв.
// Връща true при успех, false ако гласът не е наличен (напр. временно зает).
async function speakText(text: string, _ttsLang: string): Promise<boolean> {
  stopSpeaking();
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.onended = () => URL.revokeObjectURL(url);
    await currentAudio.play();
    return true;
  } catch {
    return false;
  }
}

// Рендира **удебелен** текст в рамките на ред
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return (
        <strong key={j} style={{ color: "var(--ink)" }}>
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
            <h2 key={i} className="guide-h text-lg mt-6 mb-2 first:mt-0">
              {renderInline(line.replace("## ", ""))}
            </h2>
          );
        if (line.startsWith("- ") || line.startsWith("• "))
          return (
            <p
              key={i}
              className="pl-3 border-l-2 ml-0.5 py-1 text-[15px] leading-relaxed"
              style={{ borderColor: "var(--blue)", color: "var(--slate)" }}
            >
              {renderInline(line.slice(2))}
            </p>
          );
        if (line.trim() === "") return <div key={i} className="h-1.5" />;
        return (
          <p key={i} className="text-[15px] leading-relaxed" style={{ color: "var(--slate)" }}>
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
  const [langOpen, setLangOpen] = useState(false);
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

  // Изтегля разказа за дадени координати на конкретен език (споделено от explore и смяна на език)
  async function streamGuide(lat: number, lon: number, l: Lang, speak: boolean) {
    setContent("");
    setStatus("loading");
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, lang: l.code }),
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
                if (speak) setTimeout(() => speakText(parsedAddress, l.tts), 300);
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
  }

  function explore() {
    setError("");
    setAddress("");
    setCoords(null);
    setPhotoDesc("");
    setTimeline([]);
    setStatus("locating");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setCoords({ lat, lon });
        streamGuide(lat, lon, lang, true);
      },
      () => {
        setError("Не можах да открия местоположението. Разреши GPS достъп.");
        setStatus("error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Смяна на език — ако вече има резултат, презарежда разказа на новия език
  function changeLang(l: Lang) {
    setLang(l);
    setLangOpen(false);
    if (coords && (status === "done" || status === "loading")) {
      setTimeline([]); // старите снимки/надписи са на другия език
      setPhotoDesc("");
      streamGuide(coords.lat, coords.lon, l, true);
    }
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
      <Splash />
      <div className="relative z-10 mx-auto w-full max-w-xl px-5 pb-16 pt-7">

        {/* ── Header ── */}
        <header className="flex items-center justify-between fade-in">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>Накъде днес?</p>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--ink)" }}>
              Where am I?
            </h1>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/generated/logo.png" alt="Where am I" className="logo-badge h-12 w-12 rounded-2xl shadow-md" />
        </header>

        {/* ── Language dropdown ── */}
        <div className="relative z-40 mt-5 fade-in">
          <button
            onClick={() => setLangOpen((o) => !o)}
            className="card flex w-full items-center gap-3 px-4 py-3"
          >
            <GlobeIcon className="h-5 w-5" style={{ color: "var(--blue)" }} />
            <span className="flex-1 text-left text-sm font-semibold" style={{ color: "var(--ink)" }}>
              <span className="mr-1.5">{lang.flag}</span>{lang.name}
            </span>
            <ChevronIcon className={`h-5 w-5 transition-transform ${langOpen ? "rotate-180" : ""}`} style={{ color: "var(--muted)" }} />
          </button>

          {langOpen && (
            <>
              {/* клик извън менюто го затваря */}
              <div className="fixed inset-0 z-20" onClick={() => setLangOpen(false)} />
              <div className="card absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden p-1.5 fade-in">
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => changeLang(l)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors"
                    style={lang.code === l.code
                      ? { background: "var(--blue-soft)", color: "var(--blue-d)", fontWeight: 600 }
                      : { color: "var(--slate)" }}
                  >
                    <span className="text-base">{l.flag}</span>
                    <span className="flex-1">{l.name}</span>
                    {lang.code === l.code && <CheckIcon className="h-4 w-4" style={{ color: "var(--blue)" }} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── IDLE hero ── */}
        {status === "idle" && (
          <div className="mt-5 fade-in">
            {/* Hero CTA card */}
            <div className="card relative overflow-hidden p-6 text-center"
                 style={{ background: "linear-gradient(135deg, var(--blue) 0%, var(--blue-d) 100%)" }}>
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full" style={{ background: "rgba(255,255,255,0.10)" }} />
              <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
              <div className="relative">
                <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl floaty"
                     style={{ background: "rgba(255,255,255,0.18)" }}>
                  <PinIcon className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">Какво се крие около теб?</h2>
                <p className="mx-auto mt-1 max-w-xs text-sm text-white/80">
                  История, интересни факти и къде да хапнеш — само с едно докосване.
                </p>
                <button
                  onClick={explore}
                  className="mt-5 w-full rounded-2xl bg-white px-6 py-3.5 text-base font-bold transition-transform active:scale-[0.98]"
                  style={{ color: "var(--blue-d)" }}
                >
                  Открий къде съм
                </button>
              </div>
            </div>

            {/* Category tiles */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { Icon: LandmarkIcon, label: "История" },
                { Icon: FoodIcon, label: "Хранене" },
                { Icon: SparkleIcon, label: "Факти" },
                { Icon: ClockIcon, label: "През вековете" },
                { Icon: CameraIcon, label: "Снимка" },
                { Icon: SpeakerIcon, label: "Глас" },
              ].map(({ Icon, label }) => (
                <div key={label} className="tile flex flex-col items-center gap-3 px-2 py-7">
                  <Icon className="h-14 w-14" style={{ color: "var(--blue)" }} />
                  <span className="text-xs font-semibold" style={{ color: "var(--slate)" }}>{label}</span>
                </div>
              ))}
            </div>

            {/* History toggle */}
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory((p) => !p)}
                className="mt-6 block w-full text-center text-sm font-semibold"
                style={{ color: "var(--blue-d)" }}
              >
                {showHistory ? "▲ Скрий историята" : `▼ ${history.length} предишни посещения`}
              </button>
            )}

            {/* History panel */}
            {showHistory && history.length > 0 && (
              <div className="card mt-4 p-5 fade-in">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-bold" style={{ color: "var(--ink)" }}>
                    <GlobeIcon className="h-5 w-5" style={{ color: "var(--blue)" }} /> Дневник
                  </h3>
                  <button onClick={clearHistory} className="text-xs font-semibold" style={{ color: "var(--blue-d)" }}>изчисти</button>
                </div>
                <div className="space-y-0.5">
                  {history.map((v) => (
                    <div key={v.id} className="flex items-start gap-3 border-b py-2.5 last:border-0" style={{ borderColor: "var(--line)" }}>
                      <PinIcon className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: "var(--blue)" }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium" style={{ color: "var(--ink)" }}>{v.address}</p>
                        <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{v.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── LOCATING ── */}
        {status === "locating" && (
          <div className="mt-16 text-center fade-in">
            <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 rounded-full ping-slow" style={{ background: "var(--blue)" }} />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full"
                    style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>
                <CompassIcon className="h-8 w-8" />
              </span>
            </div>
            <p className="text-[15px] font-medium" style={{ color: "var(--slate)" }}>Засичам къде си…</p>
          </div>
        )}

        {/* ── MAP + DETAIL ── */}
        {(status === "loading" || status === "done") && coords && (
          <div className="mt-5 space-y-4 fade-in">

            {/* Map (hero) */}
            <div className="card overflow-hidden p-1.5">
              <div className="overflow-hidden rounded-[1.1rem]">
                <Map lat={coords.lat} lon={coords.lon} address={address} />
              </div>
            </div>

            {/* Detail card: title + stats */}
            <div className="card p-5">
              {address ? (
                <div className="flex items-start gap-2">
                  <PinIcon className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: "var(--blue)" }} />
                  <h2 className="flex-1 text-base font-bold leading-snug" style={{ color: "var(--ink)" }}>{address}</h2>
                  <button
                    onClick={handleSpeak}
                    title="Чети на глас"
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-transform ${speaking ? "animate-pulse" : "active:scale-90"}`}
                    style={{ background: "var(--blue-soft)", color: "var(--blue)" }}
                  >
                    <SpeakerIcon className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div className="skeleton h-6 w-2/3" />
              )}

              {/* Stat chips */}
              <div className="mt-4 flex rounded-2xl border" style={{ borderColor: "var(--line)" }}>
                <div className="stat">
                  <GlobeIcon className="h-5 w-5" style={{ color: "var(--blue)" }} />
                  <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>{coords.lat.toFixed(4)}</span>
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>Ширина</span>
                </div>
                <div className="stat">
                  <CompassIcon className="h-5 w-5" style={{ color: "var(--blue)" }} />
                  <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>{coords.lon.toFixed(4)}</span>
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>Дължина</span>
                </div>
                <div className="stat">
                  <span className="text-base leading-none">{lang.flag}</span>
                  <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>{lang.label}</span>
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>Език</span>
                </div>
              </div>
            </div>

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
                <button onClick={() => photoRef.current?.click()} className="btn-soft flex items-center justify-center gap-2 px-4 py-3.5 text-sm">
                  <CameraIcon className="h-5 w-5" /> Снимай мястото
                </button>
                <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
                <button onClick={loadTimeline} disabled={timelineLoading} className="btn-soft flex items-center justify-center gap-2 px-4 py-3.5 text-sm disabled:opacity-50">
                  <ClockIcon className="h-5 w-5" /> През историята
                </button>
                <button onClick={reset} className="btn-primary col-span-2 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold">
                  <RefreshIcon className="h-5 w-5" /> Открий ново място
                </button>
              </div>
            )}

            {/* Timeline loading */}
            {timelineLoading && (
              <div className="card p-6 text-center fade-in">
                <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl floaty"
                     style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>
                  <ClockIcon className="h-6 w-6" />
                </div>
                <p className="text-sm" style={{ color: "var(--slate)" }}>
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
                <h3 className="flex items-center justify-center gap-2 text-center text-lg font-bold" style={{ color: "var(--ink)" }}>
                  <ClockIcon className="h-5 w-5" style={{ color: "var(--blue)" }} /> Мястото през историята
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
                      <div className="flex aspect-square w-full items-center justify-center text-sm" style={{ color: "var(--muted)", background: "var(--bg-2)" }}>
                        Изображението не успя да се генерира
                      </div>
                    )}
                    <div className="p-5">
                      <span className="mb-2 inline-block rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--blue-soft)", color: "var(--blue-d)" }}>
                        {era.year}
                      </span>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--slate)" }}>{era.caption}</p>
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
                <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-2xl animate-pulse"
                     style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>
                  <CameraIcon className="h-6 w-6" />
                </div>
                <p className="text-sm" style={{ color: "var(--slate)" }}>Claude разглежда снимката…</p>
              </div>
            )}
            {photoDesc && !photoLoading && (
              <div className="card p-5 fade-in">
                <h3 className="mb-2 flex items-center gap-2 text-base font-bold" style={{ color: "var(--blue-d)" }}>
                  <CameraIcon className="h-5 w-5" /> Claude вижда
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--slate)" }}>{photoDesc}</p>
              </div>
            )}
          </div>
        )}

        {/* ── ERROR ── */}
        {status === "error" && (
          <div className="mt-10 space-y-4 text-center fade-in">
            <div className="card p-7">
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl"
                   style={{ background: "#fdeaea", color: "#d64545" }}>
                <WarningIcon className="h-6 w-6" />
              </div>
              <p className="text-sm" style={{ color: "var(--slate)" }}>{error}</p>
            </div>
            <button onClick={reset} className="btn-soft px-7 py-3 text-sm">
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
