import { describe, expect, it } from "vitest";
import type { Item, Order } from "@/lib/types";
import { holdTimeLeft, newHolds, newPaidOrders } from "./liveUpdates";

const item = (id: string, status: Item["status"]) => ({ id, status }) as Item;
const order = (id: string, status: Order["status"]) => ({ id, status }) as Order;

describe("newHolds", () => {
  it("finds items that just went on hold", () => {
    const prev = [item("a", "available"), item("b", "reserved"), item("c", "available")];
    const next = [item("a", "reserved"), item("b", "reserved"), item("c", "sold"), item("d", "reserved")];
    expect(newHolds(prev, next).map((i) => i.id)).toEqual(["a", "d"]);
  });

  it("is empty when nothing changed", () => {
    const list = [item("a", "reserved")];
    expect(newHolds(list, list)).toEqual([]);
  });
});

describe("newPaidOrders", () => {
  it("finds orders paid since last time", () => {
    const prev = [order("a", "paid"), order("b", "picked_up")];
    const next = [order("a", "paid"), order("b", "picked_up"), order("c", "paid"), order("d", "refunded")];
    expect(newPaidOrders(prev, next).map((o) => o.id)).toEqual(["c"]);
  });

  it("doesn't repeat an order that was already listed", () => {
    expect(newPaidOrders([order("a", "conflict")], [order("a", "paid")])).toEqual([]);
  });
});

describe("holdTimeLeft", () => {
  const now = 1_000_000_000;
  it.each([
    [12 * 60_000, "12 min left"],
    [30_000, "1 min left"],
    [65 * 60_000, "1 hr 5 min left"],
    [120 * 60_000, "2 hr left"],
    [0, "Time's up"],
    [-60_000, "Time's up"],
  ])("%s ms → %s", (ms, out) => {
    expect(holdTimeLeft(now + ms, now)).toBe(out);
  });
});
