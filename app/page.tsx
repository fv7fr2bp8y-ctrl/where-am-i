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

type Status = "idle" | "locating" | "loading" | "done" | "error";
interface Visit { id: string; date: string; address: string; lat: number; lon: number; }
interface Lang  { code: string; flag: string; label: string; name: string; tts: string; }
interface TimelineEra { year: string; caption: string; image: string | null; }
interface GeoResult { lat: number; lon: number; name: string; full: string; }

const LANGS: Lang[] = [
  { code: "bg", flag: "🇧🇬", label: "БГ", name: "Български", tts: "bg-BG" },
  { code: "en", flag: "🇬🇧", label: "EN", name: "English",   tts: "en-GB" },
  { code: "de", flag: "🇩🇪", label: "DE", name: "Deutsch",   tts: "de-DE" },
  { code: "fr", flag: "🇫🇷", label: "FR", name: "Français",  tts: "fr-FR" },
  { code: "es", flag: "🇪🇸", label: "ES", name: "Español",   tts: "es-ES" },
];

const DEFAULT_COORDS = { lat: 42.6977, lon: 23.3219 };

const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
let audioEl: HTMLAudioElement | null = null;
let lastUrl: string | null = null;

function ensureAudio() {
  if (typeof window === "undefined") return null;
  if (!audioEl) audioEl = new Audio();
  return audioEl;
}
function unlockAudio() {
  const a = ensureAudio(); if (!a) return;
  try { a.src = SILENT_WAV; a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {}); } catch {}
}
function stopSpeaking() {
  if (audioEl) audioEl.pause();
  if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = null; }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
function browserSpeak(text: string, lang: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = window.speechSynthesis.getVoices().find(x => x.lang.startsWith(lang.slice(0, 2)));
  if (v) u.voice = v; u.lang = lang; u.rate = 0.97;
  window.speechSynthesis.speak(u);
}
async function speakText(text: string, ttsLang: string): Promise<boolean> {
  const a = ensureAudio(); stopSpeaking();
  try {
    const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (res.ok && a) {
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      lastUrl = url; a.src = url;
      a.onended = () => { if (lastUrl === url) { URL.revokeObjectURL(url); lastUrl = null; } };
      await a.play(); return true;
    }
  } catch {}
  browserSpeak(text, ttsLang); return false;
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} style={{ color: "var(--ink)" }}>{p.slice(2, -2)}</strong>
      : p
  );
}
function MarkdownText({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## "))
          return <h2 key={i} className="guide-h text-sm mt-5 mb-1 first:mt-0">{renderInline(line.replace("## ", ""))}</h2>;
        if (line.startsWith("- ") || line.startsWith("• "))
          return <p key={i} className="pl-3 border-l-2 py-0.5 text-[13px] leading-relaxed" style={{ borderColor: "var(--blue-b)", color: "var(--slate)" }}>{renderInline(line.slice(2))}</p>;
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        return <p key={i} className="text-[13px] leading-relaxed" style={{ color: "var(--slate)" }}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

const CATS = [
  { cat: "history", Icon: LandmarkIcon, label: (t: UIStrings) => t.catHistory },
  { cat: "food",    Icon: FoodIcon,     label: (t: UIStrings) => t.catFood    },
  { cat: "facts",   Icon: SparkleIcon,  label: (t: UIStrings) => t.catFacts   },
  { cat: "eras",    Icon: ClockIcon,    label: (t: UIStrings) => t.catEras    },
  { cat: "photo",   Icon: CameraIcon,   label: (t: UIStrings) => t.catPhoto   },
  { cat: "voice",   Icon: SpeakerIcon,  label: (t: UIStrings) => t.catVoice   },
];

function EraCard({ era, flipped, onFlip }: { era: TimelineEra; flipped: boolean; onFlip: () => void }) {
  return (
    <div className="era-card" onClick={onFlip}>
      <div className={`era-card-inner${flipped ? " flipped" : ""}`}>
        <div className="era-face era-front">
          {era.image
            ? <img src={era.image.startsWith("http") ? era.image : `data:image/png;base64,${era.image}`} alt={era.year} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "0.8rem" }}>—</div>
          }
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

export default function Home() {
  const [status,          setStatus]          = useState<Status>("idle");
  const [content,         setContent]         = useState("");
  const [error,           setError]           = useState("");
  const [coords,          setCoords]          = useState<{ lat: number; lon: number } | null>(null);
  const [address,         setAddress]         = useState("");
  const [speaking,        setSpeaking]        = useState(false);
  const [lang,            setLang]            = useState<Lang>(LANGS[0]);
  const [history,         setHistory]         = useState<Visit[]>([]);
  const [showHistory,     setShowHistory]     = useState(false);
  const [photoDesc,       setPhotoDesc]       = useState("");
  const [photoLoading,    setPhotoLoading]    = useState(false);
  const [timeline,        setTimeline]        = useState<TimelineEra[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [activeTopic,     setActiveTopic]     = useState<string | null>(null);
  const [flippedCards,    setFlippedCards]    = useState<Set<number>>(new Set());
  const [searchQuery,     setSearchQuery]     = useState("");
  const [searchResults,   setSearchResults]   = useState<GeoResult[]>([]);
  const [searchLoading,   setSearchLoading]   = useState(false);

  const abortRef  = useRef<AbortController | null>(null);
  const photoRef  = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const t = UI[lang.code as LangCode];
  const busy = status === "locating" || status === "loading";

  useEffect(() => {
    try {
      const stored = localStorage.getItem("wai-history");
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("touchend",    unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchend",    unlock);
    };
  }, []);

  function saveVisit(addr: string, lat: number, lon: number) {
    const v: Visit = { id: Date.now().toString(), date: new Date().toLocaleString("bg-BG"), address: addr, lat, lon };
    setHistory(prev => {
      const next = [v, ...prev].slice(0, 20);
      localStorage.setItem("wai-history", JSON.stringify(next));
      return next;
    });
  }

  const handleSpeak = useCallback(async () => {
    const clean = content.replace(/[#*]/g, "").replace(/^[-•]\s*/gm, "").replace(/\p{Extended_Pictographic}/gu, "").trim();
    const text = clean || address; if (!text) return;
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
      if (!res.ok) throw new Error();
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let headerParsed = false, buffer = "", parsedAddress = "", fullContent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!headerParsed) {
          buffer += chunk;
          const ni = buffer.indexOf("\x00");
          if (ni !== -1) {
            const lf = buffer.indexOf("\n", ni);
            if (lf !== -1) {
              try { const m = JSON.parse(buffer.slice(ni + 1, lf)); parsedAddress = m.address ?? ""; setAddress(parsedAddress); if (speak && !topic) setTimeout(() => speakText(parsedAddress, l.tts), 300); } catch {}
              const rest = buffer.slice(lf + 1);
              if (rest) { setContent(rest); fullContent += rest; }
              headerParsed = true; buffer = "";
            }
          }
        } else { fullContent += chunk; setContent(p => p + chunk); }
      }
      setStatus("done");
      if (parsedAddress) saveVisit(parsedAddress, lat, lon);
      if (speak && topic && fullContent.trim()) speakText(fullContent.replace(/^- /gm, "").trim(), l.tts);
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
      pos => { const { latitude: lat, longitude: lon } = pos.coords; setCoords({ lat, lon }); streamGuide(lat, lon, lang, true); },
      ()  => { setError(t.errGeo); setStatus("error"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function runCategory(cat: string) {
    if (cat === activeTopic && status === "done") return;
    setError(""); setContent(""); setPhotoDesc(""); setTimeline([]); setFlippedCards(new Set());
    setActiveTopic(cat);
    const doFetch = (lat: number, lon: number) => {
      setCoords({ lat, lon });
      if (cat === "voice") streamGuide(lat, lon, lang, true, "intro");
      else streamGuide(lat, lon, lang, false, cat);
    };
    if (coords) { doFetch(coords.lat, coords.lon); return; }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      pos => doFetch(pos.coords.latitude, pos.coords.longitude),
      ()  => { setError(t.errGeo); setStatus("error"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function changeLang(l: Lang) {
    setLang(l);
    if (coords && (status === "done" || status === "loading"))
      streamGuide(coords.lat, coords.lon, l, false, activeTopic && activeTopic !== "photo" ? activeTopic : undefined);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setPhotoLoading(true); setPhotoDesc("");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/describe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base64: (reader.result as string).split(",")[1], mediaType: file.type, lang: lang.code }) });
        setPhotoDesc((await res.json()).description ?? "");
      } catch { setPhotoDesc("Не успях да анализирам снимката."); }
      setPhotoLoading(false);
    };
    reader.readAsDataURL(file);
  }

  async function loadTimeline() {
    if (!address) return;
    setTimelineLoading(true); setTimeline([]);
    try {
      const res = await fetch("/api/timeline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ place: address, lang: lang.code, lat: coords?.lat, lon: coords?.lon }) });
      setTimeline((await res.json()).eras ?? []);
    } catch {}
    setTimelineLoading(false);
  }

  async function doSearch(q: string) {
    if (!q.trim()) return;
    setSearchLoading(true); setSearchResults([]);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&lang=${lang.code}`);
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } catch {}
    setSearchLoading(false);
  }

  function pickPlace(r: GeoResult) {
    setSearchQuery(""); setSearchResults([]);
    setError(""); setAddress(""); setPhotoDesc(""); setTimeline([]); setActiveTopic(null); setFlippedCards(new Set());
    setCoords({ lat: r.lat, lon: r.lon });
    streamGuide(r.lat, r.lon, lang, false);
  }

  function reset() {
    abortRef.current?.abort(); stopSpeaking();
    setStatus("idle"); setContent(""); setCoords(null); setAddress("");
    setSpeaking(false); setPhotoDesc(""); setTimeline([]);
    setTimelineLoading(false); setActiveTopic(null); setFlippedCards(new Set()); setError("");
  }

  // ── Header (always visible) ──────────────────────────────────────────────
  const header = (
    <div className="app-header">
      <div className="app-header-left">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/generated/logo.png" alt="Placetale" className="app-header-logo" />
        <span className="app-header-title">Placetale</span>
      </div>
      <div className="app-header-lang">
        <span className="text-base">{lang.flag}</span>
        <span className="text-sm font-semibold" style={{ color: "var(--slate)" }}>{lang.label}</span>
        <ChevronIcon className="h-3 w-3" style={{ color: "var(--muted)" }} />
        <select value={lang.code} onChange={e => { const l = LANGS.find(x => x.code === e.target.value); if (l) changeLang(l); }} aria-label="Език">
          {LANGS.map(l => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
        </select>
      </div>
    </div>
  );

  const langSelector = null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app-page">
      <Splash />

      {header}
      {langSelector}

      {/* ── IDLE ── */}
      {status === "idle" && (
        <div className="fade-in">
          {/* Search bar */}
          <div className="search-wrap">
            <div className="search-bar">
              <svg className="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="8.5" cy="8.5" r="5.5"/><path d="M15 15l-3-3"/>
              </svg>
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") doSearch(searchQuery); }}
                placeholder={lang.code === "bg" ? "Търси място..." : lang.code === "de" ? "Ort suchen..." : lang.code === "fr" ? "Chercher un lieu..." : lang.code === "es" ? "Buscar lugar..." : "Search place..."}
                className="search-input"
                type="search"
                autoComplete="off"
              />
              {searchLoading
                ? <span className="search-spinner" />
                : searchQuery && (
                  <button onClick={() => doSearch(searchQuery)} className="search-go">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                  </button>
                )
              }
            </div>
            {searchResults.length > 0 && (
              <div className="search-dropdown">
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => pickPlace(r)} className="search-result">
                    <PinIcon className="h-4 w-4 flex-shrink-0" style={{ color: "var(--blue)" }} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>{r.name}</span>
                      <span className="block text-xs truncate" style={{ color: "var(--muted)" }}>{r.full}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Hero card */}
          <div className="hero-card">
            <div className="hero-pin-wrap">
              <PinIcon className="h-7 w-7" style={{ color: "#fff" }} />
            </div>
            <p className="hero-sub">{t.heroSub}</p>
            <button onClick={explore} className="hero-btn">{t.heroTitle}</button>
          </div>

          {/* Category grid */}
          <div className="cat-grid">
            {CATS.map(({ cat, Icon, label }) => (
              <button key={cat} onClick={() => runCategory(cat)} className="cat-grid-item">
                <Icon className="h-8 w-8" style={{ color: "var(--blue)" }} />
                <span className="cat-grid-label">{label(t)}</span>
              </button>
            ))}
          </div>

          {/* History */}
          {history.length > 0 && (
            <>
              <button onClick={() => setShowHistory(p => !p)} className="w-full text-center text-xs font-semibold py-2" style={{ color: "var(--blue-d)" }}>
                {showHistory ? "▲ Скрий" : `▼ ${t.prevVisits(history.length)}`}
              </button>
              {showHistory && (
                <div className="card p-4 space-y-0 fade-in mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>{t.diary}</span>
                    <button onClick={() => { setHistory([]); localStorage.removeItem("wai-history"); }} className="text-xs font-semibold" style={{ color: "var(--blue-d)" }}>{t.clear}</button>
                  </div>
                  {history.slice(0, 6).map(v => (
                    <div key={v.id} className="flex items-center gap-2 py-2 border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                      <PinIcon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--blue)" }} />
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

          <p className="text-center text-[11px] mt-2" style={{ color: "var(--muted)" }}>{t.footer}</p>
        </div>
      )}

      {/* ── LOCATING ── */}
      {status === "locating" && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 fade-in">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <span className="absolute inset-0 rounded-full" style={{ background: "var(--blue)", opacity: 0.12, animation: "ping-slow 2s ease-out infinite" }} />
            <span className="absolute inset-3 rounded-full" style={{ background: "var(--blue)", opacity: 0.18, animation: "ping-slow 2s ease-out infinite .3s" }} />
            <CompassIcon className="h-9 w-9 animate-spin" style={{ color: "var(--blue)" }} />
          </div>
          <p className="text-base font-semibold" style={{ color: "var(--slate)" }}>{t.locating}</p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{lang.code === "bg" ? "Моля, разреши достъп до местоположението" : "Please allow location access"}</p>
        </div>
      )}

      {/* ── LOADING / DONE ── */}
      {(status === "loading" || status === "done") && (
        <div className="space-y-3 fade-in">
          {/* Map */}
          {coords && (
            <div style={{ height: 200, borderRadius: 20, overflow: "hidden", marginBottom: 4 }}>
              <Map lat={coords.lat} lon={coords.lon} address={address} />
            </div>
          )}

          {/* Address card */}
          <div className="card p-4">
            {address ? (
              <div className="address-bar">
                <PinIcon className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "var(--blue)" }} />
                <span className="flex-1 text-sm font-semibold leading-snug" style={{ color: "var(--ink)" }}>{address}</span>
                <button onClick={handleSpeak} className={`speak-btn${speaking ? " speaking" : ""}`}>
                  <SpeakerIcon className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="skeleton h-5 w-2/3" />
            )}
            {coords && (
              <div className="stat-row mt-3">
                <div className="stat">
                  <GlobeIcon className="h-4 w-4" style={{ color: "var(--blue)" }} />
                  <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>{coords.lat.toFixed(4)}</span>
                  <span className="text-[10px]" style={{ color: "var(--muted)" }}>{t.statLat}</span>
                </div>
                <div className="stat">
                  <CompassIcon className="h-4 w-4" style={{ color: "var(--blue)" }} />
                  <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>{coords.lon.toFixed(4)}</span>
                  <span className="text-[10px]" style={{ color: "var(--muted)" }}>{t.statLon}</span>
                </div>
                <div className="stat">
                  <span className="text-base">{lang.flag}</span>
                  <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>{lang.label}</span>
                  <span className="text-[10px]" style={{ color: "var(--muted)" }}>{t.statLang}</span>
                </div>
              </div>
            )}
          </div>

          {/* Category chips */}
          <div className="chips-row">
            {CATS.map(({ cat, Icon, label }) => (
              <button key={cat} onClick={() => runCategory(cat)} disabled={busy} className={`cat-chip${activeTopic === cat ? " cat-chip-active" : ""}`}>
                <Icon className="h-4 w-4" /><span>{label(t)}</span>
              </button>
            ))}
          </div>

          {/* Guide content */}
          <div className="card p-4">
            {content ? (
              <>
                <MarkdownText text={content} />
                {status === "loading" && <div className="mt-3 h-0.5 shimmer rounded-full" />}
              </>
            ) : (
              <div className="space-y-2.5">
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-4 w-4/5" />
              </div>
            )}
          </div>

          {/* Actions */}
          {status === "done" && (
            <div className="flex gap-2">
              <button onClick={() => photoRef.current?.click()} className="btn-soft flex items-center justify-center gap-1.5 flex-1 py-3 text-xs">
                <CameraIcon className="h-4 w-4" />{t.photoBtn}
              </button>
              <button onClick={loadTimeline} disabled={timelineLoading} className="btn-soft flex items-center justify-center gap-1.5 flex-1 py-3 text-xs">
                <ClockIcon className="h-4 w-4" />{t.erasBtn}
              </button>
              <button onClick={reset} className="btn-primary flex items-center justify-center gap-1.5 flex-1 py-3 text-xs">
                <RefreshIcon className="h-4 w-4" />{t.newPlace}
              </button>
            </div>
          )}

          {/* Timeline */}
          {timelineLoading && (
            <div className="timeline-h-scroll">
              <div className="skeleton era-card-skeleton" /><div className="skeleton era-card-skeleton" /><div className="skeleton era-card-skeleton" />
            </div>
          )}
          {timeline.length > 0 && !timelineLoading && (
            <div className="fade-in">
              <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: "var(--muted)" }}>{t.timelineTitle.toUpperCase()}</p>
              <div className="timeline-h-scroll">
                {timeline.map((era, i) => (
                  <EraCard key={i} era={era} flipped={flippedCards.has(i)} onFlip={() => {
                    setFlippedCards(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
                  }} />
                ))}
              </div>
              <p className="text-[10px] text-center mt-1" style={{ color: "var(--muted)" }}>{t.timelineDisclaimer}</p>
            </div>
          )}

          {/* Photo */}
          {photoLoading && (
            <div className="card p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center animate-pulse flex-shrink-0" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>
                <CameraIcon className="h-5 w-5" />
              </div>
              <p className="text-sm" style={{ color: "var(--slate)" }}>{t.photoLoading}</p>
            </div>
          )}
          {photoDesc && !photoLoading && (
            <div className="card p-4 fade-in">
              <p className="text-[10px] font-bold tracking-wider mb-2" style={{ color: "var(--blue-d)" }}>{t.photoTitle.toUpperCase()}</p>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--slate)" }}>{photoDesc}</p>
            </div>
          )}
        </div>
      )}

      {/* ── ERROR ── */}
      {status === "error" && (
        <div className="space-y-3 fade-in">
          <div className="card p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#fdeaea", color: "#d64545" }}>
              <WarningIcon className="h-5 w-5" />
            </div>
            <p className="text-sm" style={{ color: "var(--slate)" }}>{error}</p>
          </div>
          <button onClick={reset} className="btn-soft w-full py-3 text-sm">{t.retry}</button>
        </div>
      )}

      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
    </div>
  );
}
