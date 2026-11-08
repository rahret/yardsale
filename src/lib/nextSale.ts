/** Starting the next sale from an earlier one: what "copy this sale" and
 * "move unsold items" would take, counted the same way the database
 * functions copy_sale and move_unsold_items pick items. */

import type { Item, Sale } from "@/lib/types";

export type CopyItems = "unsold" | "all" | "none";

export function nextSaleCounts(items: Pick<Item, "status" | "quantity_available">[]) {
  const unsold = items.filter((i) => i.status !== "sold" && i.quantity_available > 0);
  return {
    all: items.length,
    /** Copied with "unsold items" (items on hold count: nobody has paid yet). */
    unsold: unsold.length,
    /** Moved by "move unsold items" (items on hold stay for their buyer). */
    movable: unsold.filter((i) => i.status === "available" || i.status === "low_stock").length,
    onHold: unsold.filter((i) => i.status === "reserved").length,
  };
}

/** The sale to suggest moving items into: the newest one that hasn't ended. */
export function defaultMoveTarget(sales: Pick<Sale, "id" | "status" | "created_at">[]): string {
  const open = sales.filter((s) => s.status !== "ended");
  const pick = (open.length ? open : sales).slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return pick?.id ?? "";
}
