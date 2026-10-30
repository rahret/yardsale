import type { Item, Sale, SaleDay } from "./types";
import { currentDays, forSaleItems, publicLocation, publicPhotoUrl, topCategories } from "./share";

type Day = Pick<SaleDay, "date" | "start_time" | "end_time">;

/** What the "Find yard sales" directory needs to show and filter one sale. */
export interface Listing {
  slug: string;
  name: string;
  tagline: string;
  location: string; // street name (no house number) + city, state
  zip: string;
  timezone: string | null;
  status: Sale["status"];
  days: Day[];
  categories: string[];
  itemCount: number;
  photos: string[];
  /** Miles from the buyer's chosen location, when they set one. */
  distanceMiles?: number | null;
  /** Map position (rounded to about a block unless the seller shows their full address). */
  coords?: { lat: number; lng: number } | null;
}

export const PAGE_SIZE = 24;
export const RADIUS_OPTIONS = [5, 10, 25, 50] as const;

/** Builds a listing from a sale and its days/items, or null if the sale has
 * no days left (it shouldn't appear in "upcoming"). */
export function toListing(
  sale: Pick<Sale, "slug" | "name" | "tagline" | "street" | "city" | "state" | "zip" | "show_full_address" | "timezone" | "status">,
  days: Day[],
  items: Item[],
  now: Date = new Date()
): Listing | null {
  const remaining = currentDays(sale, days, now);
  const today = now.toISOString().slice(0, 10);
  // without a time zone currentDays keeps everything; drop days clearly past
  // (a day of slack covers time zones)
  const upcoming = remaining.filter((d) => d.date >= addDays(today, -1));
  if (upcoming.length === 0) return null;

  const unsold = forSaleItems(items);
  const categories = topCategories(items, 3);
  const photos = unsold
    .flatMap((i) => [...(i.item_photos || [])].sort((a, b) => a.position - b.position).slice(0, 1))
    .slice(0, 3)
    .map((p) => publicPhotoUrl(p.storage_path));
  return {
    slug: sale.slug,
    name: sale.name,
    tagline: sale.tagline,
    location: publicLocation(sale),
    zip: sale.zip,
    timezone: sale.timezone,
    status: sale.status,
    days: [...upcoming].sort((a, b) => a.date.localeCompare(b.date)),
    categories,
    itemCount: unsold.length,
    photos,
  };
}

export type DateFilter = "any" | "today" | "weekend" | "week";

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Inclusive [from, to] dates for a filter, from the buyer's local "today"
 * (YYYY-MM-DD). "This weekend" is the coming Saturday–Sunday (or today
 * through Sunday when it's already the weekend). */
export function dateRange(filter: DateFilter, today: string): [string, string] | null {
  if (filter === "any") return null;
  if (filter === "today") return [today, today];
  if (filter === "week") return [today, addDays(today, 6)];
  const dow = new Date(today + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  if (dow === 0) return [today, today];
  if (dow === 6) return [today, addDays(today, 1)];
  return [addDays(today, 6 - dow), addDays(today, 7 - dow)];
}

/** Category chips: the most common categories across listings. */
export function popularCategories(listings: Listing[], limit = 8): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const l of listings) {
    for (const c of l.categories) {
      const key = c.toLowerCase();
      const entry = counts.get(key) || { label: c, n: 0 };
      entry.n += 1;
      counts.set(key, entry);
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((e) => e.label);
}
