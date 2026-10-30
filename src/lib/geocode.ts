/** Turning addresses and places into map coordinates (server-side only).
 *
 * - Sale addresses: US Census Bureau geocoder first (free, no key, accurate
 *   for US street addresses), then OpenStreetMap's Nominatim.
 * - Buyer search places (a ZIP code or city): Nominatim, cached in memory.
 *
 * Every lookup has a short timeout and returns null on any failure, so a
 * slow or unavailable service never breaks saving a sale or searching.
 */

export interface Coordinates {
  lat: number;
  lng: number;
  label?: string;
}

type Fetch = typeof fetch;

const TIMEOUT_MS = 6000;

// Nominatim's usage policy asks for an identifying User-Agent.
function userAgent(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://yardsaleqr.app";
  return `YardSaleQR/1.0 (+${site})`;
}

function valid(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

async function getJson(url: string, f: Fetch): Promise<unknown> {
  const res = await f(url, {
    headers: { "User-Agent": userAgent(), Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function censusGeocode(address: string, f: Fetch = fetch): Promise<Coordinates | null> {
  try {
    const url =
      "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=" +
      encodeURIComponent(address);
    const data = (await getJson(url, f)) as {
      result?: { addressMatches?: { coordinates?: { x: number; y: number }; matchedAddress?: string }[] };
    };
    const match = data.result?.addressMatches?.[0];
    if (!match?.coordinates) return null;
    const { x: lng, y: lat } = match.coordinates;
    return valid(lat, lng) ? { lat, lng, label: match.matchedAddress } : null;
  } catch {
    return null;
  }
}

export async function nominatimGeocode(query: string, f: Fetch = fetch): Promise<Coordinates | null> {
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=" + encodeURIComponent(query);
    const data = (await getJson(url, f)) as { lat: string; lon: string; display_name?: string }[];
    const hit = data?.[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    return valid(lat, lng) ? { lat, lng, label: hit.display_name } : null;
  } catch {
    return null;
  }
}

/** A sale's street address → coordinates. */
export async function geocodeAddress(
  a: { street: string; city: string; state: string; zip: string },
  f: Fetch = fetch
): Promise<Coordinates | null> {
  const line = [a.street, a.city, a.state, a.zip].map((s) => (s || "").trim()).filter(Boolean).join(", ");
  if (!a.street?.trim() || line.length < 6) return null;
  return (await censusGeocode(line, f)) ?? (await nominatimGeocode(line, f));
}

const placeCache = new Map<string, { at: number; value: Coordinates | null }>();
const CACHE_MS = 24 * 60 * 60 * 1000;

/** A buyer's typed place ("50023", "Ankeny, IA") → coordinates. */
export async function geocodePlace(query: string, f: Fetch = fetch): Promise<Coordinates | null> {
  const q = query.trim().replace(/\s+/g, " ").slice(0, 120);
  if (q.length < 2) return null;
  const key = q.toLowerCase();
  const cached = placeCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  // a bare 5-digit ZIP is clearer to Nominatim as a postal code
  const value = /^\d{5}$/.test(q) ? await nominatimGeocode(`${q}, USA`, f) : await nominatimGeocode(q, f);
  if (placeCache.size > 2000) placeCache.clear();
  placeCache.set(key, { at: Date.now(), value });
  return value;
}

/** Coordinates safe to show publicly: exact when the seller shows their full
 * address, otherwise rounded to roughly a block (~200 m) so a map pin doesn't
 * point at the house. */
export function publicCoordinates(
  sale: { lat: number | null; lng: number | null; show_full_address: boolean }
): { lat: number; lng: number } | null {
  if (sale.lat == null || sale.lng == null) return null;
  if (sale.show_full_address) return { lat: sale.lat, lng: sale.lng };
  const step = 0.002;
  return { lat: Math.round(sale.lat / step) * step, lng: Math.round(sale.lng / step) * step };
}
