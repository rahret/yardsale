/** What's new for the seller when their sale changes while the page is open:
 * holds buyers just placed and Buy Now orders just paid. Only buyer actions
 * count, so the seller isn't told about their own clicks. */

import type { Item, Order } from "@/lib/types";

/** Items a buyer has just put on hold (reserved now, not before). */
export function newHolds(prev: Pick<Item, "id" | "status">[], next: Item[]): Item[] {
  const was = new Map(prev.map((i) => [i.id, i.status]));
  return next.filter((i) => i.status === "reserved" && was.get(i.id) !== "reserved");
}

/** Buy Now orders that have just been paid. */
export function newPaidOrders(prev: Pick<Order, "id" | "status">[], next: Order[]): Order[] {
  const was = new Map(prev.map((o) => [o.id, o.status]));
  return next.filter((o) => o.status === "paid" && was.get(o.id) !== "paid" && !was.has(o.id));
}

/** The orders the seller sees (not abandoned or expired checkouts). */
export const SELLER_ORDER_STATUSES = ["paid", "picked_up", "refunded", "conflict"];

export type LiveMode = "connecting" | "live" | "polling";

/** How often to check when live updates can't connect (and the page is visible). */
export const FALLBACK_POLL_MS = 15_000;
/** A slower check while connected, in case live updates miss something. */
export const SAFETY_POLL_MS = 60_000;

/** "12 min left", "1 hr 5 min left", or "Time's up" for a hold's deadline. */
export function holdTimeLeft(deadlineMs: number, nowMs: number): string {
  const mins = Math.ceil((deadlineMs - nowMs) / 60_000);
  if (mins <= 0) return "Time's up";
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min left` : `${h} hr left`;
}
