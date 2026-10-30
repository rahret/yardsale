import { NextResponse, type NextRequest } from "next/server";
import { geocodePlace } from "@/lib/geocode";

// Buyer's typed place (ZIP or city) → coordinates for "within N miles".
// Lookups are cached, and spaced at least a second apart to respect
// OpenStreetMap Nominatim's usage policy.
let lastLookup = 0;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 2) return NextResponse.json({ error: "Enter a ZIP code or city." }, { status: 400 });

  const wait = lastLookup + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastLookup = Date.now();

  const place = await geocodePlace(q);
  if (!place) return NextResponse.json({ error: "Couldn't find that place." }, { status: 404 });
  return NextResponse.json(place, { headers: { "Cache-Control": "public, max-age=86400" } });
}
