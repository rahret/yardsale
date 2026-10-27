import type { Item, PaymentMethod, Sale, SaleDay } from "./types";
import { localNow, shortDate } from "./share";
import { formatAddress, formatSignTime } from "./utils";

type Day = Pick<SaleDay, "date" | "start_time" | "end_time">;

export const PAYMENT_LABELS: Record<PaymentMethod, { icon: string; label: string }> = {
  cash: { icon: "💵", label: "Cash" },
  card: { icon: "💳", label: "Card" },
  venmo: { icon: "📱", label: "Venmo" },
  cashapp: { icon: "📱", label: "Cash App" },
  paypal: { icon: "📱", label: "PayPal" },
  zelle: { icon: "🏦", label: "Zelle" },
};

/** Methods to pre-tick for a sale the seller hasn't configured yet, from the
 * payment options saved on their Account page. Only names, never handles. */
export function paymentMethodsFromProfile(options: Record<string, unknown> | null | undefined): PaymentMethod[] {
  if (!options) return ["cash"];
  const methods: PaymentMethod[] = [];
  if (options.cash) methods.push("cash");
  for (const m of ["venmo", "cashapp", "paypal", "zelle"] as const) {
    if (typeof options[m] === "string" && (options[m] as string).trim()) methods.push(m);
  }
  return methods.length > 0 ? methods : ["cash"];
}

export interface OpenStatus {
  state: "open" | "later" | "ended";
  label: string;
}

const hhmm = (t: string) => t.slice(0, 5);

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Open now · closes 2P", "Opens today 8A", "Opens tomorrow 8A",
 * "Opens Sat 8A", "Opens Sat, Oct 31, 8A", or "This sale has ended".
 * Uses the sale's time zone, falling back to `fallbackTimeZone` (the buyer's
 * browser) when the seller's isn't saved yet. Null if there's nothing to say. */
export function openStatus(
  sale: Pick<Sale, "status" | "timezone">,
  days: Day[],
  now: Date = new Date(),
  fallbackTimeZone?: string
): OpenStatus | null {
  if (sale.status === "ended") return { state: "ended", label: "This sale has ended" };
  const tz = sale.timezone || fallbackTimeZone;
  const local = tz ? localNow(tz, now) : null;
  if (!local || days.length === 0) return null;

  const sorted = [...days].sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const open = sorted.find((d) => d.date === local.date && hhmm(d.start_time) <= local.time && local.time < hhmm(d.end_time));
  if (open) return { state: "open", label: `Open now · closes ${formatSignTime(open.end_time)}` };

  const next = sorted.find((d) => d.date > local.date || (d.date === local.date && local.time < hhmm(d.start_time)));
  if (!next) return { state: "ended", label: "This sale has ended" };

  const time = formatSignTime(next.start_time);
  if (next.date === local.date) return { state: "later", label: `Opens today ${time}` };
  if (next.date === addDays(local.date, 1)) return { state: "later", label: `Opens tomorrow ${time}` };
  if (next.date <= addDays(local.date, 6)) {
    const weekday = new Date(next.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
    return { state: "later", label: `Opens ${weekday} ${time}` };
  }
  return { state: "later", label: `Opens ${shortDate(next.date)}, ${time}` };
}

/** Up to 3 items to highlight: the seller's starred items first, otherwise
 * the priciest unsold items that have photos. */
export function featuredItems(items: Item[], limit = 3): Item[] {
  const unsold = items.filter((i) => i.status !== "sold");
  const starred = unsold.filter((i) => i.featured);
  if (starred.length > 0) return starred.slice(0, limit);
  return unsold
    .filter((i) => (i.item_photos?.length || 0) > 0)
    .sort((a, b) => Number(b.price) - Number(a.price))
    .slice(0, limit);
}

/** UTC instant for a wall-clock time in an IANA time zone. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // the zone's offset at that moment = (wall clock shown there) - (UTC)
  const offsetAt = (t: number) => {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(t));
    const g = (k: string) => Number(p.find((x) => x.type === k)?.value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - t;
  };
  let utc = asUtc - offsetAt(asUtc);
  utc = asUtc - offsetAt(utc); // second pass handles days when clocks change
  return new Date(utc);
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsFloating = (date: string, time: string) => `${date.replace(/-/g, "")}T${time.slice(0, 5).replace(":", "")}00`;

/** An .ics calendar file with one event per sale day that hasn't ended. */
export function saleCalendar(sale: Sale, days: Day[], url: string, now: Date = new Date()): string {
  const where = formatAddress(sale);
  const tz = sale.timezone;
  const events = [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      // with a known time zone, use exact UTC times; otherwise "floating"
      // times, which calendars read as the phone's local time
      const start = tz ? icsUtc(zonedTimeToUtc(d.date, d.start_time, tz)) : icsFloating(d.date, d.start_time);
      const end = tz ? icsUtc(zonedTimeToUtc(d.date, d.end_time, tz)) : icsFloating(d.date, d.end_time);
      const endsAt = tz ? zonedTimeToUtc(d.date, d.end_time, tz) : null;
      return { d, start, end, past: endsAt ? endsAt < now : false };
    })
    .filter((e) => !e.past)
    .map(({ d, start, end }) =>
      [
        "BEGIN:VEVENT",
        `UID:${sale.id}-${d.date}@yardsaleqr`,
        `DTSTAMP:${icsUtc(now)}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${icsEscape(sale.name)}`,
        where ? `LOCATION:${icsEscape(where)}` : null,
        `DESCRIPTION:${icsEscape(`${sale.tagline ? sale.tagline + "\n" : ""}Browse items: ${url}`)}`,
        `URL:${url}`,
        "END:VEVENT",
      ]
        .filter(Boolean)
        .join("\r\n")
    );
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Yard Sale QR//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
}
