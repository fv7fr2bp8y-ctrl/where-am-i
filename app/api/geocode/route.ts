import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q    = req.nextUrl.searchParams.get("q")?.trim();
  const lang = req.nextUrl.searchParams.get("lang") ?? "bg";

  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=${lang},en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Placetale/1.0 fps60@yahoo.com" },
  });

  if (!res.ok) return NextResponse.json({ error: "geocode failed" }, { status: 502 });

  const data = await res.json();
  const results = (data as Array<{ lat: string; lon: string; display_name: string; type: string; class: string }>)
    .slice(0, 5)
    .map(r => ({
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      name: r.display_name.split(",").slice(0, 2).join(", "),
      full: r.display_name,
      type: r.type,
    }));

  return NextResponse.json({ results });
}
