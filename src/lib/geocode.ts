/** Turning addresses and places into map coordinates (server-side only).
 *
 * - Sale addresses: US Census Bureau geocoder first (free, no key, accurate
 *   for US street addresses), then OpenStreetMap's Nominatim.
 * - Buyer search places (a ZIP code or city): Nominatim, cached in memory.
 *
 * Every lookup has a short timeout and never throws, so a slow or
 * unavailable service never breaks saving a sale or searching.
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

/** A street-level match, with the state (and ZIP, when known) it was found in. */
interface StreetMatch extends Coordinates {
  state?: string;
  zip?: string;
}

/** undefined = the service couldn't be reached; null = it had no match. */
type Lookup = StreetMatch | null | undefined;

async function censusLookup(address: string, f: Fetch): Promise<Lookup> {
  try {
    const url =
      "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=" +
      encodeURIComponent(address);
    const data = (await getJson(url, f)) as {
      result?: {
        addressMatches?: {
          coordinates?: { x: number; y: number };
          matchedAddress?: string;
          addressComponents?: { state?: string; zip?: string };
        }[];
      };
    };
    const match = data.result?.addressMatches?.[0];
    if (!match?.coordinates) return null;
    const { x: lng, y: lat } = match.coordinates;
    if (!valid(lat, lng)) return null;
    return { lat, lng, label: match.matchedAddress, state: match.addressComponents?.state, zip: match.addressComponents?.zip };
  } catch {
    return undefined;
  }
}

// Nominatim results that only found the town, ZIP or county, not the street
const AREA_TYPES = new Set([
  "city", "town", "village", "hamlet", "municipality", "county", "state", "postcode", "country",
  "suburb", "neighbourhood", "quarter", "city_district", "district", "administrative", "region", "island",
]);

async function nominatimStreetLookup(address: string, f: Fetch): Promise<Lookup> {
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=us&q=" +
      encodeURIComponent(address);
    const data = (await getJson(url, f)) as {
      lat: string;
      lon: string;
      display_name?: string;
      addresstype?: string;
      address?: { "ISO3166-2-lvl4"?: string; postcode?: string };
    }[];
    const hit = data?.[0];
    if (!hit || AREA_TYPES.has(hit.addresstype || "")) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!valid(lat, lng)) return null;
    const state = hit.address?.["ISO3166-2-lvl4"]?.replace(/^US-/, "");
    return { lat, lng, label: hit.display_name, state, zip: hit.address?.postcode };
  } catch {
    return undefined;
  }
}

export async function censusGeocode(address: string, f: Fetch = fetch): Promise<Coordinates | null> {
  return (await censusLookup(address, f)) ?? null;
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

export type AddressCheck =
  | { status: "verified"; lat: number; lng: number; label?: string; zip?: string }
  | { status: "not_found" }
  | { status: "unavailable" };

/** Confirms a street address exists: a street-level match (Census first,
 * then OpenStreetMap) in the state that was entered. Matching only the town
 * or ZIP doesn't count. "unavailable" means neither service answered, so
 * the address couldn't be checked either way. */
export async function verifyAddress(
  a: { street: string; city: string; state: string; zip: string },
  f: Fetch = fetch
): Promise<AddressCheck> {
  const line = [a.street, a.city, a.state, a.zip].map((s) => (s || "").trim()).filter(Boolean).join(", ");
  if (!a.street?.trim() || line.length < 6) return { status: "not_found" };
  const state = (a.state || "").trim().toUpperCase();
  const inState = (m: StreetMatch) => !m.state || !state || m.state.toUpperCase() === state;

  const census = await censusLookup(line, f);
  if (census && inState(census)) return { status: "verified", lat: census.lat, lng: census.lng, label: census.label, zip: census.zip };
  const osm = await nominatimStreetLookup(line, f);
  if (osm && inState(osm)) return { status: "verified", lat: osm.lat, lng: osm.lng, label: osm.label, zip: osm.zip };
  return census === undefined && osm === undefined ? { status: "unavailable" } : { status: "not_found" };
}

/** A sale's street address → coordinates (only for addresses that check out). */
export async function geocodeAddress(
  a: { street: string; city: string; state: string; zip: string },
  f: Fetch = fetch
): Promise<Coordinates | null> {
  const check = await verifyAddress(a, f);
  return check.status === "verified" ? { lat: check.lat, lng: check.lng, label: check.label } : null;
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
