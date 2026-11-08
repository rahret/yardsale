import { describe, expect, it } from "vitest";
import { DEFAULT_FLYER, flyerBlocks, normalizeFlyer } from "./flyerDesign";

const sale = { name: "Maple St Moving Sale", tagline: "Everything must go!", street: "12 Maple St", city: "Springfield" };

describe("normalizeFlyer", () => {
  it("fills in defaults for anything missing or invalid", () => {
    expect(normalizeFlyer(null)).toEqual(DEFAULT_FLYER);
    expect(normalizeFlyer({ color: "green", layout: "eighth", qr: "yes", title: "  " })).toEqual(DEFAULT_FLYER);
  });

  it("keeps valid choices and caps the title", () => {
    const f = normalizeFlyer({ title: "A VERY LONG SALE TITLE HERE", color: "red", layout: "full", showTagline: true });
    expect(f.title.length).toBeLessThanOrEqual(16);
    expect(f.color).toBe("red");
    expect(f.layout).toBe("full");
    expect(f.showTagline).toBe(true);
  });
});

describe("flyerBlocks", () => {
  it("shows the sale name by default but not the tagline", () => {
    const kinds = flyerBlocks(DEFAULT_FLYER, sale, ["Sat 8am–2pm"], ["Toys"]).map((b) => b.kind);
    expect(kinds).toEqual(["title", "name", "dates", "address", "categories", "qr"]);
  });

  it("adds the tagline when asked, and drops what's switched off", () => {
    const d = { ...DEFAULT_FLYER, showTagline: true, showName: false, showCategories: false, qr: false, address: "off" as const };
    const blocks = flyerBlocks(d, sale, ["Sat 8am–2pm"], ["Toys"]);
    expect(blocks.map((b) => b.kind)).toEqual(["title", "tagline", "dates"]);
    expect(blocks[1]).toMatchObject({ text: "Everything must go!" });
  });

  it("leaves out a tagline or address the sale doesn't have", () => {
    const d = { ...DEFAULT_FLYER, showTagline: true };
    const kinds = flyerBlocks(d, { ...sale, tagline: "  ", street: "" }, [], []).map((b) => b.kind);
    expect(kinds).toEqual(["title", "name", "dates", "qr"]);
  });

  it("uses street + city when asked, and a placeholder before dates are set", () => {
    const blocks = flyerBlocks({ ...DEFAULT_FLYER, address: "full" }, sale, [], []);
    expect(blocks.find((b) => b.kind === "address")).toMatchObject({ text: "12 Maple St, Springfield" });
    expect(blocks.find((b) => b.kind === "dates")).toMatchObject({ lines: ["Dates coming soon"] });
  });
});
