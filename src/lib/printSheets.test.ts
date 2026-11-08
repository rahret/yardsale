import { describe, expect, it } from "vitest";
import { FLYER_LAYOUTS, PAGE_HEIGHT_IN, PAGE_WIDTH_IN, TAG_LAYOUTS, paginate, perSheet, slotBox, tagPrice } from "./printSheets";

const byKey = (k: string) => [...TAG_LAYOUTS, ...FLYER_LAYOUTS].find((l) => l.key === k)!;

describe("sheet layouts", () => {
  it.each([...TAG_LAYOUTS, ...FLYER_LAYOUTS])("$key fits on a Letter page", (l) => {
    const right = l.leftIn + (l.cols - 1) * l.pitchXIn + l.widthIn;
    const bottom = l.topIn + (l.rows - 1) * l.pitchYIn + l.heightIn;
    expect(right).toBeLessThanOrEqual(PAGE_WIDTH_IN + 1e-9);
    expect(bottom).toBeLessThanOrEqual(PAGE_HEIGHT_IN + 1e-9);
    // labels don't overlap
    expect(l.pitchXIn).toBeGreaterThanOrEqual(l.widthIn);
    expect(l.pitchYIn).toBeGreaterThanOrEqual(l.heightIn);
  });

  it("matches the Avery label counts", () => {
    expect(perSheet(byKey("avery5160"))).toBe(30);
    expect(perSheet(byKey("avery5163"))).toBe(10);
    expect(perSheet(byKey("quarter"))).toBe(4);
  });
});

describe("slotBox", () => {
  it("places labels across then down, in page percentages", () => {
    const l = byKey("avery5160");
    const first = slotBox(l, 0);
    expect(first.left).toBeCloseTo((0.1875 / 8.5) * 100);
    expect(first.top).toBeCloseTo((0.5 / 11) * 100);
    expect(first.width).toBeCloseTo((2.625 / 8.5) * 100);
    const second = slotBox(l, 1);
    expect(second.left).toBeCloseTo(((0.1875 + 2.75) / 8.5) * 100);
    expect(second.top).toBeCloseTo(first.top);
    const fourth = slotBox(l, 3);
    expect(fourth.left).toBeCloseTo(first.left);
    expect(fourth.top).toBeCloseTo((1.5 / 11) * 100);
  });

  it("wraps onto the next page", () => {
    const l = byKey("avery5163");
    expect(slotBox(l, 10)).toEqual(slotBox(l, 0));
  });

  it("the full-page flyer fills the page", () => {
    expect(slotBox(byKey("full"), 0)).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });
});

describe("paginate", () => {
  it("splits into full sheets and a remainder", () => {
    const pages = paginate(Array.from({ length: 25 }, (_, i) => i), byKey("avery5163"));
    expect(pages.map((p) => p.length)).toEqual([10, 10, 5]);
    expect(pages[2][0]).toBe(20);
  });

  it("gives no pages for nothing", () => {
    expect(paginate([], byKey("avery5160"))).toEqual([]);
  });
});

describe("tagPrice", () => {
  it.each([
    [5, false, "$5"],
    [0.5, false, "$0.50"],
    [2.25, false, "$2.25"],
    [2, true, "$2 each"],
    [0, false, "FREE"],
    [0, true, "FREE"],
    [NaN, false, "FREE"],
  ])("%s (bulk %s) → %s", (price, bulk, out) => {
    expect(tagPrice(price, bulk)).toBe(out);
  });
});
