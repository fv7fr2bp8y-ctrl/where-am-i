"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Splash from "./components/Splash";
import {
  PinIcon, LandmarkIcon, FoodIcon, SparkleIcon, ClockIcon,
  CameraIcon, SpeakerIcon, GlobeIcon, CompassIcon, RefreshIcon,
  WarningIcon, ChevronIcon,
} from "./components/Icons";
import { UI, type LangCode, type UIStrings } from "./i18n";

const Map = dynamic(() => import("./components/Map"), { ssr: false });

type Status = "idle" | "locating" | "loading" | "done" | "error";

interface Visit { id: string; date: string; address: string; lat: number; lon: number; }
interface Lang { code: string; flag: string; label: string; name: string; tts: string; }
interface TimelineEra { year: string; caption: string; image: string | null; }

const LANGS: Lang[] = [
  { code: "bg", flag: "🇧🇬", label: "БГ", name: "Български", tts: "bg-BG" },
  { code: "en", flag: "🇬🇧", label: "EN", name: "English",   tts: "en-GB" },
  { code: "de", flag: "🇩🇪", label: "DE", name: "Deutsch",   tts: "de-DE" },
  { code: "fr", flag: "🇫🇷", label: "FR", name: "Français",  tts: "fr-FR" },
  { code: "es", flag: "🇪🇸", label: "ES", name: "Español",   tts: "es-ES" },
];

const DEFAULT_COORDS = { lat: 42.6977, lon: 23.3219 }; // Sofia fallback

// ── Audio helpers ─────────────────────────────────────────────────────────────
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
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
  try { a.src = SILENT_WAV; a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {}); } catch {}
}
function stopSpeaking() {
  if (audioEl) audioEl.pause();
  if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = null; }
  if (typeof window !== "undefined" && "speechSynthesis" in window)
    window.speechSynthesis.cancel();
}
function browserSpeak(text: string, ttsLang: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = window.speechSynthesis.getVoices().find((x) => x.lang.startsWith(ttsLang.slice(0, 2)));
  if (v) u.voice = v;
  u.lang = ttsLang; u.rate = 0.97;
  window.speechSynthesis.speak(u);
}
async function speakText(text: string, ttsLang: string): Promise<boolean> {
  const a = ensureAudio();
  stopSpeaking();
  try {
    const res = await fetch("/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok && a) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      lastUrl = url; a.src = url;
      a.onended = () => { if (lastUrl === url) { URL.revokeObjectURL(url); lastUrl = null; } };
      await a.play(); return true;
    }
  } catch {}
  browserSpeak(text, ttsLang);
  return false;
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={j} style={{ color: "var(--ink)" }}>{part.slice(2, -2)}</strong>;
    return part;
  });
}
function MarkdownText({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## "))
          return <h2 key={i} className="guide-h text-sm mt-5 mb-1 first:mt-0">{renderInline(line.replace("## ", ""))}</h2>;
        if (line.startsWith("- ") || line.startsWith("• "))
          return (
            <p key={i} className="pl-3 border-l-2 py-0.5 text-[13px] leading-relaxed"
               style={{ borderColor: "var(--blue)", color: "var(--slate)" }}>
              {renderInline(line.slice(2))}
            </p>
          );
        if (line.trim() === "") return <div key={i} className="h-1.5" />;
        return <p key={i} className="text-[13px] leading-relaxed" style={{ color: "var(--slate)" }}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

// ── Category definitions ──────────────────────────────────────────────────────
const CATEGORIES = [
  { cat: "history", Icon: LandmarkIcon, label: (t: UIStrings) => t.catHistory },
  { cat: "food",    Icon: FoodIcon,     label: (t: UIStrings) => t.catFood    },
  { cat: "facts",   Icon: SparkleIcon,  label: (t: UIStrings) => t.catFacts   },
  { cat: "eras",    Icon: ClockIcon,    label: (t: UIStrings) => t.catEras    },
  { cat: "photo",   Icon: CameraIcon,   label: (t: UIStrings) => t.catPhoto   },
  { cat: "voice",   Icon: SpeakerIcon,  label: (t: UIStrings) => t.catVoice   },
];

// ── Flip card for timeline ────────────────────────────────────────────────────
function EraCard({ era, flipped, onFlip }: { era: TimelineEra; flipped: boolean; onFlip: () => void }) {
  return (
    <div className="era-card" onClick={onFlip}>
      <div className={`era-card-inner${flipped ? " flipped" : ""}`}>
        <div className="era-face era-front">
          {era.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={era.image.startsWith("http") ? era.image : `data:image/png;base64,${era.image}`}
              alt={era.year}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center",
                          justifyContent: "center", color: "var(--muted)", fontSize: "0.75rem" }}>
              —
            </div>
          )}
          <div className="era-year-chip">{era.year}</div>
          <div className="era-flip-hint">↻ tap</div>
        </div>
        <div className="era-face era-back">
          <span className="era-year-back">{era.year}</span>
          <p className="era-caption">{era.caption}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Home() {
  const [status,         setStatus]         = useState<Status>("idle");
  const [content,        setContent]        = useState("");
  const [error,          setError]          = useState("");
  const [coords,         setCoords]         = useState<{ lat: number; lon: number } | null>(null);
  const [mapCoords,      setMapCoords]      = useState(DEFAULT_COORDS);
  const [address,        setAddress]        = useState("");
  const [speaking,       setSpeaking]       = useState(false);
  const [lang,           setLang]           = useState<Lang>(LANGS[0]);
  const [history,        setHistory]        = useState<Visit[]>([]);
  const [showHistory,    setShowHistory]    = useState(false);
  const [photoDesc,      setPhotoDesc]      = useState("");
  const [photoLoading,   setPhotoLoading]   = useState(false);
  const [timeline,       setTimeline]       = useState<TimelineEra[]>([]);
  const [timelineLoading,setTimelineLoading]= useState(false);
  const [activeTopic,    setActiveTopic]    = useState<string | null>(null);
  const [flippedCards,   setFlippedCards]   = useState<Set<number>>(new Set());

  const abortRef = useRef<AbortController | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const t         = UI[lang.code as LangCode];
  const busy      = status === "locating" || status === "loading";
  const sheetOpen = status === "loading" || status === "done" || status === "error";
  const mapZoom   = useMemo(() => (coords ? 15 : 13), [coords]);

  // Load persisted history + last-known coords
  useEffect(() => {
    try {
      const stored = localStorage.getItem("wai-history");
      if (stored) {
        const h: Visit[] = JSON.parse(stored);
        setHistory(h);
        if (h.length > 0) setMapCoords({ lat: h[0].lat, lon: h[0].lon });
      }
    } catch {}
  }, []);

  // Keep map centered on real coords when obtained
  useEffect(() => { if (coords) setMapCoords(coords); }, [coords]);

  // Unlock audio on first gesture (mobile autoplay policy)
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("touchend",   unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchend",   unlock);
    };
  }, []);

  function saveVisit(addr: string, lat: number, lon: number) {
    const visit: Visit = {
      id: Date.now().toString(),
      date: new Date().toLocaleString("bg-BG"),
      address: addr, lat, lon,
    };
    setHistory((prev) => {
      const next = [visit, ...prev].slice(0, 20);
      localStorage.setItem("wai-history", JSON.stringify(next));
      return next;
    });
  }
  function clearHistory() {
    setHistory([]); localStorage.removeItem("wai-history");
  }

  const handleSpeak = useCallback(async () => {
    const clean = content
      .replace(/[#*]/g, "").replace(/^[-•]\s*/gm, "")
      .replace(/\p{Extended_Pictographic}/gu, "").trim();
    const text = clean || address;
    if (!text) return;
    setSpeaking(true);
    await speakText(text, lang.tts);
    setSpeaking(false);
  }, [content, address, lang]);

  async function streamGuide(lat: number, lon: number, l: Lang, speak: boolean, topic?: string) {
    setContent(""); setStatus("loading");
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const res = await fetch("/api/explore", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, lang: l.code, topic }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error("API error");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let headerParsed = false, buffer = "", parsedAddress = "", fullContent = "";

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
                parsedAddress = meta.address ?? ""; setAddress(parsedAddress);
                if (speak && !topic) setTimeout(() => speakText(parsedAddress, l.tts), 300);
              } catch {}
              const rest = buffer.slice(newlineIdx + 1);
              if (rest) { setContent(rest); fullContent += rest; }
              headerParsed = true; buffer = "";
            }
          }
        } else {
          fullContent += chunk; setContent((prev) => prev + chunk);
        }
      }
      setStatus("done");
      if (parsedAddress) saveVisit(parsedAddress, lat, lon);
      if (speak && topic && fullContent.trim())
        speakText(fullContent.replace(/^- /gm, "").trim(), l.tts);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(t.errGeneric); setStatus("error");
    }
  }

  function explore() {
    setError(""); setAddress(""); setCoords(null);
    setPhotoDesc(""); setTimeline([]); setActiveTopic(null); setFlippedCards(new Set());
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        setCoords({ lat, lon });
        streamGuide(lat, lon, lang, true);
      },
      () => { setError(t.errGeo); setStatus("error"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function runCategory(cat: string) {
    if (cat === activeTopic && status === "done") return;
    setError(""); setContent(""); setPhotoDesc(""); setTimeline([]); setFlippedCards(new Set());
    setActiveTopic(cat);

    const doFetch = (lat: number, lon: number) => {
      setCoords({ lat, lon });
      if (cat === "voice")
        streamGuide(lat, lon, lang, true, "intro");
      else if (cat === "photo")
        streamGuide(lat, lon, lang, false, "intro").then(() => photoRef.current?.click());
      else
        streamGuide(lat, lon, lang, false, cat);
    };

    if (coords) {
      doFetch(coords.lat, coords.lon);
    } else {
      setStatus("locating");
      navigator.geolocation.getCurrentPosition(
        (pos) => doFetch(pos.coords.latitude, pos.coords.longitude),
        () => { setError(t.errGeo); setStatus("error"); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }

  function changeLang(l: Lang) {
    setLang(l);
    if (coords && (status === "done" || status === "loading")) {
      setTimeline([]);
      const topic = activeTopic && activeTopic !== "photo" ? activeTopic : undefined;
      streamGuide(coords.lat, coords.lon, l, false, topic);
    }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true); setPhotoDesc("");
    const reader = new FileReader();
    reader.onload = async () => {
      const base64  = (reader.result as string).split(",")[1];
      const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp";
      try {
        const res = await fetch("/api/describe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ base64, mediaType, lang: lang.code }),
        });
        const data = await res.json();
        setPhotoDesc(data.description ?? "");
      } catch { setPhotoDesc("Не успях да анализирам снимката."); }
      setPhotoLoading(false);
    };
    reader.readAsDataURL(file);
  }

  async function loadTimeline() {
    if (!address) return;
    setTimelineLoading(true); setTimeline([]);
    try {
      const res = await fetch("/api/timeline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place: address, lang: lang.code, lat: coords?.lat, lon: coords?.lon }),
      });
      const data = await res.json();
      setTimeline(data.eras ?? []);
    } catch {}
    setTimelineLoading(false);
  }

  function reset() {
    abortRef.current?.abort(); stopSpeaking();
    setStatus("idle"); setContent(""); setCoords(null); setAddress("");
    setSpeaking(false); setPhotoDesc(""); setTimeline([]);
    setTimelineLoading(false); setActiveTopic(null); setFlippedCards(new Set()); setError("");
  }

  function toggleFlip(i: number) {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <Splash />

      {/* Full-screen map */}
      <div className="map-layer">
        <Map lat={mapCoords.lat} lon={mapCoords.lon} address={address} pulsing={busy} zoom={mapZoom} />
      </div>

      {/* Gradient overlay */}
      <div className={`map-overlay${sheetOpen ? " overlay-light" : ""}`} />

      {/* ── Top bar ── */}
      <header className="top-bar">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/generated/logo.png" alt="Placetale" className="h-9 w-9 rounded-xl shadow logo-badge" />
          <span className="text-base font-extrabold tracking-tight" style={{ color: "var(--ink)" }}>
            Placetale
          </span>
        </div>

        {/* Language selector */}
        <div className="relative">
          <div className="lang-pill">
            <span>{lang.flag}</span>
            <span className="text-xs font-semibold" style={{ color: "var(--slate)" }}>{lang.label}</span>
            <ChevronIcon className="h-3.5 w-3.5" style={{ color: "var(--muted)" }} />
          </div>
          <select
            value={lang.code}
            onChange={(e) => { const next = LANGS.find((l) => l.code === e.target.value); if (next) changeLang(next); }}
            aria-label={t.statLang}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
            ))}
          </select>
        </div>
      </header>

      {/* ── Floating bottom (idle + locating) ── */}
      {!sheetOpen && (
        <div className="floating-bottom fade-in">
          {status === "idle" && (
            <>
              <div className="chips-row">
                {CATEGORIES.map(({ cat, Icon, label }) => (
                  <button key={cat} onClick={() => runCategory(cat)} className="cat-chip">
                    <Icon className="h-4 w-4" />
                    <span>{label(t)}</span>
                  </button>
                ))}
              </div>
              <button onClick={explore} className="cta-pill">{t.cta}</button>
              {history.length > 0 && (
                <button onClick={() => setShowHistory((p) => !p)} className="history-link">
                  {showHistory ? `▲ ${t.hideHistory}` : `▼ ${t.prevVisits(history.length)}`}
                </button>
              )}
              {showHistory && (
                <div className="history-panel fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>
                      <GlobeIcon className="inline h-3.5 w-3.5 mr-1" style={{ color: "var(--blue)" }} />
                      {t.diary}
                    </span>
                    <button onClick={clearHistory} className="text-xs font-semibold" style={{ color: "var(--blue-d)" }}>
                      {t.clear}
                    </button>
                  </div>
                  {history.slice(0, 5).map((v) => (
                    <div key={v.id} className="flex items-center gap-2 py-1.5 border-b last:border-0"
                         style={{ borderColor: "var(--line)" }}>
                      <PinIcon className="h-3 w-3 flex-shrink-0" style={{ color: "var(--blue)" }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium" style={{ color: "var(--ink)" }}>{v.address}</p>
                        <p className="text-[10px]" style={{ color: "var(--muted)" }}>{v.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {status === "locating" && (
            <div className="locating-pill">
              <CompassIcon className="h-5 w-5 animate-spin" style={{ color: "var(--blue)" }} />
              <span>{t.locating}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Bottom sheet ── */}
      <div className={`bottom-sheet${sheetOpen ? " sheet-open" : ""}`}>
        <div className="sheet-handle" />

        {/* Sheet header: address + chips */}
        <div className="sheet-header">
          {address ? (
            <div className="address-bar">
              <PinIcon className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "var(--blue)" }} />
              <span className="flex-1 text-sm font-semibold leading-snug" style={{ color: "var(--ink)" }}>
                {address}
              </span>
              <button
                onClick={handleSpeak}
                title="Чети на глас"
                className={`speak-btn${speaking ? " speaking" : ""}`}
              >
                <SpeakerIcon className="h-4 w-4" />
              </button>
            </div>
          ) : status === "loading" && (
            <div className="skeleton h-4 w-2/3 mt-2 mb-1" />
          )}

          {/* Category chips inside sheet */}
          <div className="chips-row">
            {CATEGORIES.map(({ cat, Icon, label }) => (
              <button
                key={cat}
                onClick={() => runCategory(cat)}
                disabled={busy}
                className={`cat-chip${activeTopic === cat ? " cat-chip-active" : ""}`}
              >
                <Icon className="h-4 w-4" />
                <span>{label(t)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="sheet-scroll">

          {/* Skeleton while loading */}
          {status === "loading" && !content && (
            <div className="space-y-2.5 pt-1">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-5/6" />
              <div className="skeleton h-4 w-4/5" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-3/4" />
            </div>
          )}

          {/* Guide text */}
          {content && (
            <div className="pt-0.5">
              <MarkdownText text={content} />
              {status === "loading" && (
                <div className="mt-3 h-0.5 w-full shimmer rounded-full" />
              )}
            </div>
          )}

          {/* Timeline loading skeletons */}
          {timelineLoading && (
            <div className="pt-4 fade-in">
              <div className="timeline-h-scroll">
                <div className="skeleton era-card-skeleton" />
                <div className="skeleton era-card-skeleton" />
                <div className="skeleton era-card-skeleton" />
              </div>
            </div>
          )}

          {/* Timeline horizontal scroll */}
          {timeline.length > 0 && !timelineLoading && (
            <div className="pt-4 fade-in">
              <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: "var(--muted)" }}>
                {t.timelineTitle.toUpperCase()}
              </p>
              <div className="timeline-h-scroll">
                {timeline.map((era, i) => (
                  <EraCard key={i} era={era} flipped={flippedCards.has(i)} onFlip={() => toggleFlip(i)} />
                ))}
              </div>
              <p className="text-[10px] text-center mt-1" style={{ color: "var(--muted)" }}>
                {t.timelineDisclaimer}
              </p>
            </div>
          )}

          {/* Photo loading */}
          {photoLoading && (
            <div className="flex items-center gap-3 py-4 fade-in">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center animate-pulse"
                   style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>
                <CameraIcon className="h-5 w-5" />
              </div>
              <p className="text-sm" style={{ color: "var(--slate)" }}>{t.photoLoading}</p>
            </div>
          )}

          {/* Photo result */}
          {photoDesc && !photoLoading && (
            <div className="mt-4 p-4 rounded-2xl fade-in" style={{ background: "var(--bg-2)" }}>
              <p className="text-[10px] font-bold tracking-wider mb-1.5" style={{ color: "var(--blue-d)" }}>
                {t.photoTitle.toUpperCase()}
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--slate)" }}>{photoDesc}</p>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="flex items-center gap-3 py-4 fade-in">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                   style={{ background: "#fdeaea", color: "#d64545" }}>
                <WarningIcon className="h-5 w-5" />
              </div>
              <p className="text-sm" style={{ color: "var(--slate)" }}>{error}</p>
            </div>
          )}
        </div>

        {/* Sheet action buttons */}
        {status === "done" && (
          <div className="sheet-actions">
            <button onClick={() => photoRef.current?.click()}
                    className="btn-soft flex items-center justify-center gap-1.5 flex-1 py-2.5 text-xs">
              <CameraIcon className="h-4 w-4" /> {t.photoBtn}
            </button>
            <button onClick={loadTimeline} disabled={timelineLoading}
                    className="btn-soft flex items-center justify-center gap-1.5 flex-1 py-2.5 text-xs">
              <ClockIcon className="h-4 w-4" /> {t.erasBtn}
            </button>
            <button onClick={reset}
                    className="btn-primary flex items-center justify-center gap-1.5 flex-1 py-2.5 text-xs font-bold">
              <RefreshIcon className="h-4 w-4" /> {t.newPlace}
            </button>
          </div>
        )}
        {status === "error" && (
          <div className="sheet-actions">
            <button onClick={reset} className="btn-soft flex-1 py-2.5 text-sm">{t.retry}</button>
          </div>
        )}
      </div>

      {/* Hidden file input for camera */}
      <input ref={photoRef} type="file" accept="image/*" capture="environment"
             className="hidden" onChange={handlePhoto} />
    </div>
  );
}
