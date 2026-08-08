import type { Item, Sale, SaleDay } from "./types";

export function money(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return "$" + (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
}

export function normalizePhone(p: string | null | undefined): string {
  return (p || "").replace(/\D/g, "");
}

/** Strips any trailing slash(es) so combining this with `/s/${slug}` never
 * produces a double slash, regardless of how NEXT_PUBLIC_SITE_URL was set. */
export function siteOrigin(fallback = ""): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || fallback;
  return raw.replace(/\/+$/, "");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 48);
}

export function randomSuffix(len = 5): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function fmtMMSS(ms: number): string {
  if (ms < 0) ms = 0;
  let s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  s = s % 60;
  return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

export function reservationDeadline(item: Item, sale: Sale): number {
  const minutes = item.reservation_minutes ?? sale.default_reservation_minutes;
  const reservedAt = item.reserved_at ? new Date(item.reserved_at).getTime() : 0;
  return reservedAt + minutes * 60000;
}

/** Client-side mirror of the server-side expiry logic, used only for display
 * (countdown / "is this actually still reserved") — the source of truth is
 * always the database, kept fresh by sweep_expired_reservations(). */
export function isEffectivelyExpired(item: Item, sale: Sale): boolean {
  if (item.status !== "reserved" || !item.reserved_at) return false;
  return Date.now() > reservationDeadline(item, sale);
}

export function isBulkItem(item: Item): boolean {
  return item.quantity_total > 1;
}

export function categoriesOf(items: Item[]): string[] {
  const set = new Set<string>();
  items.forEach((i) => {
    if (i.category) set.add(i.category);
  });
  return Array.from(set).sort();
}

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Formats a "HH:MM" or "HH:MM:SS" time-of-day string (as returned by
 * Postgres's `time` type) into a locale-formatted clock time. */
export function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Formats one sale_days row into a single human-readable line, e.g.
 * "Fri, Aug 15 · 10:00 AM – 4:00 PM". */
export function formatSaleDay(day: Pick<SaleDay, "date" | "start_time" | "end_time">): string {
  const date = new Date(day.date + "T00:00:00");
  const dateStr = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${dateStr} · ${formatTime(day.start_time)} – ${formatTime(day.end_time)}`;
}

export function sortSaleDays(days: SaleDay[]): SaleDay[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date));
}

export const EMOJI_PRESETS = [
  "📦", "🪑", "🛋️", "📚", "🎮", "🧸", "🖼️", "🕹️", "👕", "🍽️",
  "🔧", "🚲", "💡", "🎸", "🧦", "🎧", "🖥️", "⛺", "🧴", "🏓",
];
