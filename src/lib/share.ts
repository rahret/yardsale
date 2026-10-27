import type { Item, Sale, SaleDay } from "./types";
import { formatSignTime, money, siteOrigin } from "./utils";

/** Where a visitor came from — appended to shared links as `?src=…`. */
export const SHARE_SOURCES = ["qr", "share", "facebook", "group", "craigslist", "text", "email", "friend"] as const;
export type ShareSource = (typeof SHARE_SOURCES)[number];

export const SOURCE_LABELS: Record<string, string> = {
  qr: "QR code / sign",
  share: "Share button",
  facebook: "Facebook",
  group: "Group posts",
  craigslist: "Craigslist",
  text: "Text messages",
  email: "Email",
  friend: "Shared by buyers",
  direct: "Direct / other",
};

/** The site's origin in the browser (honors NEXT_PUBLIC_SITE_URL). */
export function siteOriginForClient(): string {
  return siteOrigin(typeof window !== "undefined" ? window.location.origin : "");
}

export function saleLink(origin: string, slug: string, opts: { src?: ShareSource; item?: string } = {}): string {
  const params = new URLSearchParams();
  if (opts.item) params.set("item", opts.item);
  if (opts.src) params.set("src", opts.src);
  const qs = params.toString();
  return `${origin}/s/${slug}${qs ? `?${qs}` : ""}`;
}

/** Public URL of an item photo, usable on the server (no browser Supabase client needed). */
export function publicPhotoUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/item-photos/${path}`;
}

/** "123 Main St" -> "Main St". Strips a leading house number (incl. forms like
 * "123A", "12-14", "1/2") so shared previews don't pinpoint the house. */
export function streetName(street: string): string {
  return street.replace(/^\s*\d+[\w/-]*\s+/, "").trim();
}

/** Location line for previews and posts: street name (no house number) + city,
 * or the full address when the seller has opted in. */
export function publicLocation(sale: Pick<Sale, "street" | "city" | "state" | "show_full_address">): string {
  const street = sale.show_full_address ? sale.street.trim() : streetName(sale.street);
  const cityState = [sale.city.trim(), sale.state.trim()].filter(Boolean).join(", ");
  return [street, cityState].filter(Boolean).join(", ");
}

/** "Sat Oct 24" — deterministic (en-US) so server-rendered previews don't depend on server locale. */
export function shortDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "Sat Oct 24, 8A–2P" for each day. */
export function dayLines(days: Pick<SaleDay, "date" | "start_time" | "end_time">[]): string[] {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => `${shortDate(d.date)}, ${formatSignTime(d.start_time)}–${formatSignTime(d.end_time)}`);
}

/** Items a buyer could still come and buy. */
export function forSaleItems(items: Item[]): Item[] {
  return items.filter((i) => i.status !== "sold");
}

/** Most common categories among unsold items, most frequent first. */
export function topCategories(items: Item[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const i of forSaleItems(items)) {
    const c = i.category?.trim();
    if (c && c !== "Misc") counts.set(c, (counts.get(c) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([c]) => c);
}

export type SalePhase = "upcoming" | "now" | "ended";

/** Wall-clock "YYYY-MM-DD" and "HH:MM" in the sale's time zone. */
export function localNow(timeZone: string, now: Date): { date: string; time: string } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
  } catch {
    return null; // unknown time zone
  }
}

/** Whether the sale is upcoming, happening right now, or over. Uses the
 * sale's saved time zone; without one, "now" can't be known, so open days
 * count as upcoming. */
export function salePhase(
  sale: Pick<Sale, "status" | "timezone">,
  days: Pick<SaleDay, "date" | "start_time" | "end_time">[],
  now: Date = new Date()
): SalePhase {
  if (sale.status === "ended") return "ended";
  const local = sale.timezone ? localNow(sale.timezone, now) : null;
  if (!local || days.length === 0) return "upcoming";
  const hhmm = (t: string) => t.slice(0, 5);
  if (days.some((d) => d.date === local.date && hhmm(d.start_time) <= local.time && local.time < hhmm(d.end_time))) {
    return "now";
  }
  const stillAhead = days.some(
    (d) => d.date > local.date || (d.date === local.date && local.time < hhmm(d.end_time))
  );
  return stillAhead ? "upcoming" : "ended";
}

/** Days that haven't finished yet, in the sale's time zone — so previews and
 * posts lead with today or the next day, not one that's already over. Without
 * a time zone we can't tell, so every day is kept. If every day is over, the
 * full list is returned (the sale reads as ended anyway). */
export function currentDays<D extends Pick<SaleDay, "date" | "start_time" | "end_time">>(
  sale: Pick<Sale, "timezone">,
  days: D[],
  now: Date = new Date()
): D[] {
  const local = sale.timezone ? localNow(sale.timezone, now) : null;
  if (!local) return days;
  const left = days.filter(
    (d) => d.date > local.date || (d.date === local.date && local.time < d.end_time.slice(0, 5))
  );
  return left.length > 0 ? left : days;
}

export interface SalePreview {
  title: string;
  description: string;
}

/** Title/description for a sale's link preview (Open Graph / Twitter card). */
export function salePreview(sale: Sale, days: SaleDay[], items: Item[], now: Date = new Date()): SalePreview {
  const phase = salePhase(sale, days, now);
  const lines = dayLines(currentDays(sale, days, now));
  const when =
    phase === "ended" ? "This sale has ended" : lines.length > 0 ? lines[0] + (lines.length > 1 ? ` (+${lines.length - 1} more day${lines.length > 2 ? "s" : ""})` : "") : "";
  const title = [phase === "now" ? `Happening now! ${sale.name}` : sale.name, when].filter(Boolean).join(" · ");

  const count = forSaleItems(items).length;
  const cats = topCategories(items);
  const description = [
    cats.length > 0 ? cats.join(", ") : null,
    count > 0 ? `${count} item${count === 1 ? "" : "s"}` : null,
    publicLocation(sale) || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return { title, description: description || sale.tagline || "Browse the items before you go." };
}

/** Title/description for a single item's link preview. */
export function itemPreview(sale: Sale, days: SaleDay[], item: Item, now: Date = new Date()): SalePreview {
  const lines = dayLines(currentDays(sale, days, now));
  const status = item.status === "sold" ? "Sold" : money(item.price);
  return {
    title: `${item.name} · ${status}`,
    description: [`At ${sale.name}`, lines[0], publicLocation(sale) || null].filter(Boolean).join(" · "),
  };
}

export type PostKind = "group" | "craigslist" | "text";

export const POST_KINDS: { kind: PostKind; label: string; src: ShareSource }[] = [
  { kind: "group", label: "Facebook / Nextdoor group post", src: "group" },
  { kind: "craigslist", label: "Craigslist listing", src: "craigslist" },
  { kind: "text", label: "Text message", src: "text" },
];

/** Ready-to-paste announcement text for the seller to post or send. */
export function salePost(
  kind: PostKind,
  sale: Sale,
  days: SaleDay[],
  items: Item[],
  link: string,
  now: Date = new Date()
): string {
  const lines = dayLines(currentDays(sale, days, now));
  const where = publicLocation(sale);
  const cats = topCategories(items, 5);
  const count = forSaleItems(items).length;
  const highlights = cats.length > 0 ? cats.join(", ") : null;

  if (kind === "text") {
    return [
      `Yard sale${lines[0] ? ` ${lines[0]}` : ""}${where ? ` on ${where}` : ""}!`,
      highlights ? `${highlights} & more.` : null,
      `See what's for sale: ${link}`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const body = [
    kind === "craigslist" ? `${sale.name.toUpperCase()}` : `🏷️ ${sale.name}`,
    "",
    ...lines.map((l) => `🗓️ ${l}`),
    where ? `📍 ${where}` : null,
    "",
    highlights ? `${count > 0 ? `${count} items including ` : ""}${highlights} and more.` : count > 0 ? `${count} items for sale.` : null,
    sale.tagline || null,
    "",
    kind === "craigslist"
      ? `Photos and prices for everything, plus hold an item before you come: ${link}`
      : `👉 Browse photos and prices, and reserve items before you come: ${link}`,
  ];
  // collapse the blank lines left by missing sections
  return body
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
