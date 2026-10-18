import type { Address, Item, Sale, SaleDay } from "./types";

export function money(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return "$" + (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2));
}

/** Joins the structured address fields into one display string, e.g.
 * "123 Main St, Springfield, IL 62704". Omits any parts that are blank. */
export function formatAddress(a: Address): string {
  const cityStateZip = [a.city, [a.state, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [a.street, cityStateZip].filter(Boolean).join(", ");
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

/** Item columns for the seller's admin view. item_holds (buyer name/phone) is
 * private to the sale owner, so it's only embedded here, never on the public
 * shop page. */
export const ITEM_SELECT = "*, item_photos(*), item_holds(*)";

/** Formats a stored 10-digit phone number as "(555) 555-1234"; anything else is returned as-is. */
export function formatPhone(digits: string): string {
  const m = /^(\d{3})(\d{3})(\d{4})$/.exec(digits);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : digits;
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

/** Compact clock time for printed signs: drops ":00" minutes and the "M"
 * from AM/PM, e.g. "09:00" -> "9A", "14:00" -> "2P", "09:30" -> "9:30A". */
export function formatSignTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minutes = m ? `:${String(m).padStart(2, "0")}` : "";
  return `${hour12}${minutes}${h < 12 ? "A" : "P"}`;
}

/** Compact sale_days line for printed signs, e.g. "Fri, Aug 15 · 9A – 4P". */
export function formatSignSaleDay(day: Pick<SaleDay, "date" | "start_time" | "end_time">): string {
  const date = new Date(day.date + "T00:00:00");
  const dateStr = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${dateStr} · ${formatSignTime(day.start_time)} – ${formatSignTime(day.end_time)}`;
}

export function sortSaleDays(days: SaleDay[]): SaleDay[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date));
}

export const EMOJI_PRESETS = [
  "📦", "🪑", "🛋️", "📚", "🎮", "🧸", "🖼️", "🕹️", "👕", "🍽️",
  "🔧", "🚲", "💡", "🎸", "🧦", "🎧", "🖥️", "⛺", "🧴", "🏓",
];
