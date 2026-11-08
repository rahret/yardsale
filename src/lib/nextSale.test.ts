import { describe, expect, it } from "vitest";
import { defaultMoveTarget, nextSaleCounts } from "./nextSale";

describe("nextSaleCounts", () => {
  it("counts what copying and moving would take", () => {
    const items = [
      { status: "available", quantity_available: 1 },
      { status: "low_stock", quantity_available: 2 },
      { status: "reserved", quantity_available: 1 },
      { status: "sold", quantity_available: 1 },
      { status: "sold", quantity_available: 0 },
    ] as const;
    expect(nextSaleCounts([...items])).toEqual({ all: 5, unsold: 3, movable: 2, onHold: 1 });
  });

  it("handles an empty sale", () => {
    expect(nextSaleCounts([])).toEqual({ all: 0, unsold: 0, movable: 0, onHold: 0 });
  });
});

describe("defaultMoveTarget", () => {
  it("picks the newest sale that hasn't ended", () => {
    expect(
      defaultMoveTarget([
        { id: "a", status: "ended", created_at: "2026-10-01" },
        { id: "b", status: "draft", created_at: "2026-09-01" },
        { id: "c", status: "live", created_at: "2026-08-01" },
      ])
    ).toBe("b");
  });

  it("falls back to the newest sale, or nothing", () => {
    expect(defaultMoveTarget([{ id: "a", status: "ended", created_at: "2026-10-01" }])).toBe("a");
    expect(defaultMoveTarget([])).toBe("");
  });
});
