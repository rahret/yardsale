import { describe, expect, it } from "vitest";
import type { Item, Order } from "@/lib/types";
import { newHolds, newPaidOrders } from "./liveUpdates";

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
