/** Holds this buyer placed from this device, remembered in localStorage so
 * the sale page can say "You're holding this" (holds are anonymous: the
 * database never tells a buyer whose hold an item is). */

export interface MyHold {
  itemId: string;
  saleId: string;
  /** When the hold started, as the database recorded it. */
  reservedAt: string;
  name: string;
  email?: string;
}

const KEY = "garage-sale-my-holds";

/** Database times have microseconds, which some browsers can't parse. */
function toMs(t: string): number {
  return Date.parse(t.replace(/(\.\d{3})\d+/, "$1"));
}
const KEEP_MS = 2 * 24 * 60 * 60 * 1000;

export function parseMyHolds(raw: string | null, now = Date.now()): MyHold[] {
  try {
    const list = JSON.parse(raw || "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(
      (h): h is MyHold =>
        h &&
        typeof h.itemId === "string" &&
        typeof h.saleId === "string" &&
        typeof h.reservedAt === "string" &&
        typeof h.name === "string" &&
        now - toMs(h.reservedAt) < KEEP_MS
    );
  } catch {
    return [];
  }
}

export function loadMyHolds(): MyHold[] {
  try {
    return parseMyHolds(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function saveMyHold(hold: MyHold): MyHold[] {
  const next = [...loadMyHolds().filter((h) => h.itemId !== hold.itemId), hold];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  return next;
}

/** The buyer's hold on this item, if the item is still held by that same
 * hold (a later hold by someone else has a different start time). */
export function myHoldOn(
  item: { id: string; status: string; reserved_at: string | null },
  holds: MyHold[]
): MyHold | null {
  if (item.status !== "reserved" || !item.reserved_at) return null;
  const at = toMs(item.reserved_at);
  return holds.find((h) => h.itemId === item.id && Math.abs(toMs(h.reservedAt) - at) < 2000) ?? null;
}
