import { describe, expect, it } from "vitest";
import { busiestDay, dayLabel, pct, printedShare } from "./saleStats";

describe("printedShare", () => {
  it("adds up signs, tags and flyers", () => {
    expect(
      printedShare([
        { src: "qr", visits: 5 },
        { src: "tag", visits: 2 },
        { src: "flyer", visits: 1 },
        { src: "facebook", visits: 4 },
        { src: "direct", visits: 3 },
      ])
    ).toEqual({ printed: 8, total: 15 });
  });
});

describe("busiestDay", () => {
  const d = (day: string, visits: number) => ({ day, visits, holds: 0, orders: 0 });
  it("finds the day with the most visits, latest on a tie", () => {
    expect(busiestDay([d("2026-11-01", 3), d("2026-11-02", 7), d("2026-11-03", 7)])?.day).toBe("2026-11-03");
  });
  it("is null with no visits", () => {
    expect(busiestDay([d("2026-11-01", 0)])).toBeNull();
  });
});

describe("helpers", () => {
  it("labels days and guards percentages", () => {
    expect(dayLabel("2026-11-08")).toBe("Sun, Nov 8");
    expect(pct(1, 3)).toBe(33);
    expect(pct(1, 0)).toBe(0);
  });
});
