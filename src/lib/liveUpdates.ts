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
