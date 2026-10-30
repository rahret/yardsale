import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchListings } from "@/lib/directorySearch";

// Buyer search for the "Find yard sales" page (one page of results).
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const num = (k: string) => {
    const v = q.get(k);
    const n = v === null || v === "" ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(q.get(k) || "") ? q.get(k) : null);

  const result = await searchListings(createClient(), {
    lat: num("lat"),
    lng: num("lng"),
    radiusMiles: num("radius"),
    from: date("from"),
    to: date("to"),
    query: q.get("q")?.slice(0, 100) || null,
    category: q.get("category")?.slice(0, 60) || null,
    offset: num("offset") ?? 0,
  });
  return NextResponse.json(result);
}
