"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import Splash from "./components/Splash";
import {
  PinIcon, LandmarkIcon, FoodIcon, SparkleIcon, ClockIcon,
  CameraIcon, SpeakerIcon, GlobeIcon, CompassIcon, RefreshIcon,
  WarningIcon, ChevronIcon,
} from "./components/Icons";
import { UI, type LangCode, type UIStrings } from "./i18n";

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
// Празен WAV — за „отключване" на звука при първото докосване (mobile autoplay)
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

// Един преизползван аудио елемент. Веднъж отключен с жест, свири и програмно.
let audioEl: HTMLAudioElement | null = null;
let lastUrl: string | null = null;
function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audioEl) audioEl = new Audio();
  return audioEl;
}
function unlockAudio() {
  const a = ensureAudio();
  if (!a) return;
  try {
    a.src = SILENT_WAV;
    a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
  } catch { /* ignore */ }
}

function stopSpeaking() {
  if (audioEl) { audioEl.pause(); }
  if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = null; }
  if (typeof window !== "undefined" && "speechSynthesis" in window)
    window.speechSynthesis.cancel();
}

// Резервен браузърен глас — само когато Gemini е недостъпен (за да има винаги звук)
function browserSpeak(text: string, ttsLang: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = window.speechSynthesis.getVoices().find((x) => x.lang.startsWith(ttsLang.slice(0, 2)));
  if (v) u.voice = v;
  u.lang = ttsLang;
  u.rate = 0.97;
  window.speechSynthesis.speak(u);
}

// Първо Gemini (висококачествен). При претоварване → браузърен резерв.
async function speakText(text: string, ttsLang: string): Promise<boolean> {
  const a = ensureAudio();
  stopSpeaking();
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok && a) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      lastUrl = url;
      a.src = url;
      a.onended = () => { if (lastUrl === url) { URL.revokeObjectURL(url); lastUrl = null; } };
      await a.play();
      return true;
    }
  } catch { /* пада към браузърния глас */ }

  // Gemini недостъпен (rate-limit) → поне браузърен глас
  browserSpeak(text, ttsLang);
  return false;
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

// Заглавия и икони за тематичните плочки
const TOPIC_TITLE: Record<string, (t: UIStrings) => string> = {
  history: (t) => t.catHistory,
  food: (t) => t.catFood,
  facts: (t) => t.catFacts,
  eras: (t) => t.catEras,
};
const TOPIC_ICON: Record<string, (p: { className?: string; style?: React.CSSProperties }) => React.ReactElement> = {
  history: LandmarkIcon,
  food: FoodIcon,
  facts: SparkleIcon,
  eras: ClockIcon,
};

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
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const t = UI[lang.code as LangCode];

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("wai-history");
      if (stored) setHistory(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Отключваме звука при първото докосване (иначе мобилните блокират autoplay)
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchend", unlock);
      window.removeEventListener("click", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("touchend", unlock, { once: true });
    window.addEventListener("click", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchend", unlock);
      window.removeEventListener("click", unlock);
    };
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
    // Чете показания текст (краткия отговор/разказа); ако няма — адреса
    const clean = content
      .replace(/[#*]/g, "")
      .replace(/^[-•]\s*/gm, "")
      .replace(/\p{Extended_Pictographic}/gu, "")
      .trim();
    const text = clean || address;
    if (!text) return;
    setSpeaking(true);
    await speakText(text, lang.tts);
    setSpeaking(false);
  }, [content, address, lang]);

  // Изтегля разказа за дадени координати на конкретен език (споделено от explore, смяна на език и плочките)
  async function streamGuide(lat: number, lon: number, l: Lang, speak: boolean, topic?: string) {
    setContent("");
    setStatus("loading");
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, lang: l.code, topic }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error("API error");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let headerParsed = false;
      let buffer = "";
      let parsedAddress = "";
      let fullContent = "";

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
                // При пълен разказ четем адреса; при тематичен — ще прочетем съдържанието накрая
                if (speak && !topic) setTimeout(() => speakText(parsedAddress, l.tts), 300);
              } catch { /* ignore */ }
              const rest = buffer.slice(newlineIdx + 1);
              if (rest) { setContent(rest); fullContent += rest; }
              headerParsed = true;
              buffer = "";
            }
          }
        } else {
          fullContent += chunk;
          setContent((prev) => prev + chunk);
        }
      }

      setStatus("done");
      if (parsedAddress) saveVisit(parsedAddress, lat, lon);
      // Глас за тематичните отговори — чете самото съдържание
      if (speak && topic && fullContent.trim()) {
        speakText(fullContent.replace(/^- /gm, "").trim(), l.tts);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(t.errGeneric);
      setStatus("error");
    }
  }

  function explore() {
    setError("");
    setAddress("");
    setCoords(null);
    setPhotoDesc("");
    setTimeline([]);
    setActiveTopic(null);
    setStatus("locating");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setCoords({ lat, lon });
        streamGuide(lat, lon, lang, true);
      },
      () => {
        setError(t.errGeo);
        setStatus("error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Плочките — кратък фокусиран отговор за избрана тема
  function runCategory(cat: string) {
    setError("");
    setAddress("");
    setCoords(null);
    setPhotoDesc("");
    setTimeline([]);
    setActiveTopic(cat);
    setStatus("locating");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setCoords({ lat, lon });
        if (cat === "voice") {
          streamGuide(lat, lon, lang, true, "intro");
        } else if (cat === "photo") {
          // показваме картата/адреса, после отваряме камерата
          streamGuide(lat, lon, lang, false, "intro").then(() => photoRef.current?.click());
        } else {
          streamGuide(lat, lon, lang, false, cat); // history / food / facts / eras
        }
      },
      () => {
        setError(t.errGeo);
        setStatus("error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Смяна на език — ако вече има резултат, презарежда на новия език (същата тема)
  function changeLang(l: Lang) {
    setLang(l);
    if (coords && (status === "done" || status === "loading")) {
      setTimeline([]); // старите снимки/надписи са на другия език
      const topic = activeTopic && activeTopic !== "photo" ? activeTopic : undefined;
      streamGuide(coords.lat, coords.lon, l, false, topic);
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
        body: JSON.stringify({ place: address, lang: lang.code, lat: coords?.lat, lon: coords?.lon }),
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
    setActiveTopic(null);
  }

  const busy = status === "locating" || status === "loading";

  return (
    <div className="bg-app">
      <Splash />
      <div className="relative z-10 mx-auto w-full max-w-xl px-5 pb-16 pt-7">

        {/* ── Header ── */}
        <header className="flex items-center justify-between fade-in">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>{t.subtitle}</p>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--ink)" }}>
              Placetale
            </h1>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/generated/logo.png" alt="Placetale" className="logo-badge h-12 w-12 rounded-2xl shadow-md" />
        </header>

        {/* ── Language selector (нативен select — надежден на всеки телефон) ── */}
        <div className="relative mt-5 fade-in">
          <div className="card flex items-center gap-3 px-4 py-3.5">
            <GlobeIcon className="h-5 w-5" style={{ color: "var(--blue)" }} />
            <span className="flex-1 text-sm font-semibold" style={{ color: "var(--ink)" }}>
              <span className="mr-1.5">{lang.flag}</span>{lang.name}
            </span>
            <ChevronIcon className="h-5 w-5" style={{ color: "var(--muted)" }} />
          </div>
          <select
            value={lang.code}
            onChange={(e) => {
              const next = LANGS.find((l) => l.code === e.target.value);
              if (next) changeLang(next);
            }}
            aria-label={t.statLang}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.name}
              </option>
            ))}
          </select>
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
                <h2 className="text-xl font-bold text-white">{t.heroTitle}</h2>
                <p className="mx-auto mt-1 max-w-xs text-sm text-white/80">
                  {t.heroSub}
                </p>
                <button
                  onClick={explore}
                  className="mt-5 w-full rounded-2xl bg-white px-6 py-3.5 text-base font-bold transition-transform active:scale-[0.98]"
                  style={{ color: "var(--blue-d)" }}
                >
                  {t.cta}
                </button>
              </div>
            </div>

            {/* Category tiles */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { Icon: LandmarkIcon, label: t.catHistory, cat: "history" },
                { Icon: FoodIcon, label: t.catFood, cat: "food" },
                { Icon: SparkleIcon, label: t.catFacts, cat: "facts" },
                { Icon: ClockIcon, label: t.catEras, cat: "eras" },
                { Icon: CameraIcon, label: t.catPhoto, cat: "photo" },
                { Icon: SpeakerIcon, label: t.catVoice, cat: "voice" },
              ].map(({ Icon, label, cat }) => (
                <button
                  key={label}
                  onClick={() => runCategory(cat)}
                  className="tile flex flex-col items-center gap-3 px-2 py-7"
                >
                  <Icon className="h-14 w-14" style={{ color: "var(--blue)" }} />
                  <span className="text-sm font-semibold" style={{ color: "var(--slate)" }}>{label}</span>
                </button>
              ))}
            </div>

            {/* History toggle */}
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory((p) => !p)}
                className="mt-6 block w-full text-center text-sm font-semibold"
                style={{ color: "var(--blue-d)" }}
              >
                {showHistory ? `▲ ${t.hideHistory}` : `▼ ${t.prevVisits(history.length)}`}
              </button>
            )}

            {/* History panel */}
            {showHistory && history.length > 0 && (
              <div className="card mt-4 p-5 fade-in">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-bold" style={{ color: "var(--ink)" }}>
                    <GlobeIcon className="h-5 w-5" style={{ color: "var(--blue)" }} /> {t.diary}
                  </h3>
                  <button onClick={clearHistory} className="text-xs font-semibold" style={{ color: "var(--blue-d)" }}>{t.clear}</button>
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
            <p className="text-[15px] font-medium" style={{ color: "var(--slate)" }}>{t.locating}</p>
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
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>{t.statLat}</span>
                </div>
                <div className="stat">
                  <CompassIcon className="h-5 w-5" style={{ color: "var(--blue)" }} />
                  <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>{coords.lon.toFixed(4)}</span>
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>{t.statLon}</span>
                </div>
                <div className="stat">
                  <span className="text-base leading-none">{lang.flag}</span>
                  <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>{lang.label}</span>
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>{t.statLang}</span>
                </div>
              </div>
            </div>

            {/* Claude guide */}
            <div className="card p-6">
              {activeTopic && TOPIC_TITLE[activeTopic] && (
                <h3 className="mb-3 flex items-center gap-2 text-lg font-bold" style={{ color: "var(--ink)" }}>
                  {(() => { const I = TOPIC_ICON[activeTopic]; return I ? <I className="h-5 w-5" style={{ color: "var(--blue)" }} /> : null; })()}
                  {TOPIC_TITLE[activeTopic](t)}
                </h3>
              )}
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
                  <CameraIcon className="h-5 w-5" /> {t.photoBtn}
                </button>
                <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
                <button onClick={loadTimeline} disabled={timelineLoading} className="btn-soft flex items-center justify-center gap-2 px-4 py-3.5 text-sm disabled:opacity-50">
                  <ClockIcon className="h-5 w-5" /> {t.erasBtn}
                </button>
                <button onClick={reset} className="btn-primary col-span-2 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold">
                  <RefreshIcon className="h-5 w-5" /> {t.newPlace}
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
                  {t.timelineLoading}
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
                  <ClockIcon className="h-5 w-5" style={{ color: "var(--blue)" }} /> {t.timelineTitle}
                </h3>
                {timeline.map((era, i) => (
                  <div key={i} className="card overflow-hidden">
                    {era.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={era.image.startsWith("http") ? era.image : `data:image/png;base64,${era.image}`}
                        alt={era.year}
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center text-sm" style={{ color: "var(--muted)", background: "var(--bg-2)" }}>
                        {t.imgFailed}
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
                  {t.timelineDisclaimer}
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
                <p className="text-sm" style={{ color: "var(--slate)" }}>{t.photoLoading}</p>
              </div>
            )}
            {photoDesc && !photoLoading && (
              <div className="card p-5 fade-in">
                <h3 className="mb-2 flex items-center gap-2 text-base font-bold" style={{ color: "var(--blue-d)" }}>
                  <CameraIcon className="h-5 w-5" /> {t.photoTitle}
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
              {t.retry}
            </button>
          </div>
        )}

        {/* footer */}
        {!busy && (
          <p className="mt-12 text-center text-xs" style={{ color: "var(--muted)" }}>
            {t.footer}
          </p>
        )}
      </div>
    </div>
  );
}
