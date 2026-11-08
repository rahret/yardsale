/** The seller's stats page: the shape sale_stats() returns, plus small
 * summaries the page shows. */

import type { ItemStatus } from "@/lib/types";

export interface StatsDay {
  day: string; // YYYY-MM-DD in the sale's time zone
  visits: number;
  holds: number;
  orders: number;
}

export interface SaleStats {
  /** The breakdown below is part of Pro and the Sale Pass. */
  locked: boolean;
  timezone: string;
  visits: number;
  item_views: number;
  holds: number;
  orders: number;
  /** What the seller receives from Buy Now, after fees. */
  online_cents: number;
  /** Everything collected (in person and online). */
  revenue: number;
  items: number;
  items_sold: number;
  days?: StatsDay[];
  sources?: { src: string; visits: number }[];
  top_items?: { id: string; name: string; status: ItemStatus; price: number; views: number }[];
}

/** Visits that came from something printed (signs, price tags, flyers). */
export const PRINTED_SOURCES = ["qr", "tag", "flyer"];

export function printedShare(sources: { src: string; visits: number }[]): { printed: number; total: number } {
  const total = sources.reduce((n, s) => n + Number(s.visits), 0);
  const printed = sources.filter((s) => PRINTED_SOURCES.includes(s.src)).reduce((n, s) => n + Number(s.visits), 0);
  return { printed, total };
}

/** The day with the most visits (the latest, on a tie), or null if none. */
export function busiestDay(days: StatsDay[]): StatsDay | null {
  let best: StatsDay | null = null;
  for (const d of days) if (d.visits > 0 && (!best || d.visits >= best.visits)) best = d;
  return best;
}

/** "Sat, Nov 8" for a YYYY-MM-DD day. */
export function dayLabel(day: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", opts);
}

/** Percent, rounded, with a 0 guard. */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
