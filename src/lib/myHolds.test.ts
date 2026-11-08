import { describe, expect, it } from "vitest";
import { myHoldOn, parseMyHolds } from "./myHolds";

const hold = { itemId: "i1", saleId: "s1", reservedAt: "2026-11-08T18:00:00.123456+00:00", name: "Pat" };

describe("myHoldOn", () => {
  it("recognises the buyer's own hold", () => {
    expect(myHoldOn({ id: "i1", status: "reserved", reserved_at: "2026-11-08T18:00:00.123456+00:00" }, [hold])).toEqual(hold);
  });

  it("not once the hold ended, or someone else holds it now", () => {
    expect(myHoldOn({ id: "i1", status: "available", reserved_at: null }, [hold])).toBeNull();
    expect(myHoldOn({ id: "i1", status: "reserved", reserved_at: "2026-11-08T19:30:00Z" }, [hold])).toBeNull();
    expect(myHoldOn({ id: "i2", status: "reserved", reserved_at: hold.reservedAt }, [hold])).toBeNull();
  });
});

describe("parseMyHolds", () => {
  it("drops junk and holds older than two days", () => {
    const now = Date.parse("2026-11-09T00:00:00Z");
    const old = { ...hold, itemId: "i0", reservedAt: "2026-11-01T00:00:00Z" };
    expect(parseMyHolds(JSON.stringify([hold, old, { itemId: 5 }, null]), now)).toEqual([hold]);
    expect(parseMyHolds("not json", now)).toEqual([]);
    expect(parseMyHolds(null, now)).toEqual([]);
  });
});
