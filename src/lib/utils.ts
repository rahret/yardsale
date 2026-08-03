import type { Item, Sale } from "./types";

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

export function categoriesOf(items: Item[]): string[] {
  const set = new Set<string>();
  items.forEach((i) => {
    if (i.category) set.add(i.category);
  });
  return Array.from(set).sort();
}

export const EMOJI_PRESETS = [
  "📦", "🪑", "🛋️", "📚", "🎮", "🧸", "🖼️", "🕹️", "👕", "🍽️",
  "🔧", "🚲", "💡", "🎸", "🧦", "🎧", "🖥️", "⛺", "🧴", "🏓",
];
