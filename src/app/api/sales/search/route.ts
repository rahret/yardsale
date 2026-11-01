import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchListings } from "@/lib/directorySearch";
import { RADIUS_OPTIONS } from "@/lib/directory";

// Buyer search for the "Find yard sales" page (one page of results). A
// location is required: buyers only ever see sales near a place they chose,
// never the whole directory.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const num = (k: string) => {
    const v = q.get(k);
    const n = v === null || v === "" ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(q.get(k) || "") ? q.get(k) : null);

  const lat = num("lat");
  const lng = num("lng");
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Choose a place to search near." }, { status: 400 });
  }
  const requested = num("radius");
  const radius = (RADIUS_OPTIONS as readonly number[]).includes(requested ?? -1) ? requested : 25;

  const result = await searchListings(createClient(), {
    lat,
    lng,
    radiusMiles: radius,
    from: date("from"),
    to: date("to"),
    category: q.get("category")?.slice(0, 60) || null,
    offset: num("offset") ?? 0,
  });
  return NextResponse.json(result);
}
