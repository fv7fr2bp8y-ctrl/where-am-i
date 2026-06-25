import { Redis } from "@upstash/redis";

// ── Ключ по координатна мрежа (~165 м), за да хваща едно и също място ──────────
export function gridKey(lat: number, lon: number): string {
  const r = (n: number) => (Math.round(n / 0.0015) * 0.0015).toFixed(4);
  return `${r(lat)}_${r(lon)}`;
}

// ── Redis (Vercel KV / Upstash). Ако env vars липсват → no-op (без кеш) ───────
let _redis: Redis | null = null;
let _redisTried = false;
function redis(): Redis | null {
  if (_redisTried) return _redis;
  _redisTried = true;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) _redis = new Redis({ url, token });
  return _redis;
}

const TTL = 60 * 60 * 24 * 60; // 60 дни

export interface CachedGuide { address: string; content: string }
export interface CachedEra { year: string; caption: string; image: string | null }

export async function getGuide(key: string): Promise<CachedGuide | null> {
  const r = redis();
  if (!r) return null;
  try { return (await r.get<CachedGuide>(key)) ?? null; } catch { return null; }
}
export async function setGuide(key: string, val: CachedGuide): Promise<void> {
  const r = redis();
  if (!r || !val.content?.trim()) return;
  try { await r.set(key, val, { ex: TTL }); } catch { /* ignore */ }
}

export async function getTimeline(key: string): Promise<CachedEra[] | null> {
  const r = redis();
  if (!r) return null;
  try { return (await r.get<CachedEra[]>(key)) ?? null; } catch { return null; }
}
export async function setTimeline(key: string, eras: CachedEra[]): Promise<void> {
  const r = redis();
  if (!r) return;
  try { await r.set(key, eras, { ex: TTL }); } catch { /* ignore */ }
}

// ── Blob за снимки. Ако токенът липсва → връща null (пазим base64 директно) ───
export function blobEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function uploadImage(path: string, base64: string): Promise<string | null> {
  if (!blobEnabled()) return null;
  try {
    const { put } = await import("@vercel/blob");
    const buf = Buffer.from(base64, "base64");
    const { url } = await put(path, buf, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return url;
  } catch {
    return null;
  }
}
