import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAGE_SIZE, toListing, type Listing } from "@/lib/directory";
import { publicCoordinates } from "@/lib/geocode";
import type { Item, Sale, SaleDay } from "@/lib/types";

export interface SearchParams {
  lat?: number | null;
  lng?: number | null;
  radiusMiles?: number | null;
  from?: string | null; // YYYY-MM-DD
  to?: string | null;
  query?: string | null;
  category?: string | null;
  offset?: number;
}

export interface SearchResult {
  listings: Listing[];
  total: number;
  offset: number;
}

/** One page of the "Find yard sales" directory: search_sales() picks and
 * orders the sales, then their details are loaded and summarized. */
export async function searchListings(supabase: SupabaseClient, p: SearchParams): Promise<SearchResult> {
  const offset = Math.max(0, p.offset || 0);
  const { data: hits, error } = await supabase.rpc("search_sales", {
    p_lat: p.lat ?? null,
    p_lng: p.lng ?? null,
    p_radius_miles: p.lat != null ? p.radiusMiles ?? null : null,
    p_from: p.from || null,
    p_to: p.to || null,
    p_query: p.query?.trim() || null,
    p_category: p.category || null,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });
  if (error || !hits || hits.length === 0) return { listings: [], total: 0, offset };

  const rows = hits as { sale_id: string; distance_miles: number | null; total: number }[];
  const { data: sales } = await supabase
    .from("sales")
    .select(
      "id, slug, name, tagline, street, city, state, zip, show_full_address, timezone, status, lat, lng, sale_days(date, start_time, end_time), items(category, status, item_photos(storage_path, position))"
    )
    .in(
      "id",
      rows.map((r) => r.sale_id)
    );

  const byId = new Map((sales || []).map((s) => [s.id as string, s]));
  const listings: Listing[] = [];
  for (const r of rows) {
    const s = byId.get(r.sale_id);
    if (!s) continue;
    const listing = toListing(s as unknown as Sale, (s.sale_days || []) as SaleDay[], (s.items || []) as unknown as Item[]);
    if (!listing) continue;
    listing.distanceMiles = r.distance_miles;
    listing.coords = publicCoordinates(s as unknown as Sale);
    listings.push(listing);
  }
  return { listings, total: Number(rows[0].total) || listings.length, offset };
}
