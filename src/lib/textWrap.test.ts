import { describe, expect, it } from "vitest";
import { bestWrap, lineSplits } from "./textWrap";

// every character 1 unit wide, lines 1.2 tall with 1.45 between baselines
const widthOf = (s: string) => s.length;
const wrap = (text: string, width: number, height: number) => bestWrap(text, widthOf, { width, height }, 1.2, 1.45);

describe("lineSplits", () => {
  it("lists every way to break the words, in order", () => {
    expect(lineSplits(["A", "B", "C"])).toEqual([["A B C"], ["A", "B C"], ["A B", "C"], ["A", "B", "C"]]);
    expect(lineSplits(["ONE"])).toEqual([["ONE"]]);
  });
});

describe("bestWrap", () => {
  it("keeps a title on one line in a wide box", () => {
    expect(wrap("YARD SALE", 20, 2)).toEqual(["YARD SALE"]);
  });
  it("wraps it in a tall, narrow box", () => {
    expect(wrap("YARD SALE", 5, 5)).toEqual(["YARD", "SALE"]);
    expect(wrap("MULTI FAMILY YARD SALE", 7, 8)).toEqual(["MULTI", "FAMILY", "YARD", "SALE"]);
  });
  it("balances the lines", () => {
    expect(wrap("BIG MOVING SALE", 8, 3)).toEqual(["BIG MOVING", "SALE"]);
  });
  it("leaves a single word alone", () => {
    expect(wrap("SALE", 1, 10)).toEqual(["SALE"]);
  });
});
