import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN, SIGN_PRESETS, TITLE_MAX, normalizeDesign, signContent } from "./signDesign";

const sale = { street: "1510 NW Ash Dr", city: "Ankeny", state: "IA", tagline: "Furniture, tools & toys" };
const days = ["Sat, Nov 8 · 8A – 2P"];

describe("normalizeDesign", () => {
  it("fills in defaults and rejects bad values from storage", () => {
    expect(normalizeDesign(null)).toEqual(DEFAULT_DESIGN);
    const d = normalizeDesign({ title: "x".repeat(40), arrow: "sideways", qr: "huge", perSheet: 7, qrCaption: "yes" });
    expect(d.title).toHaveLength(TITLE_MAX);
    expect(d.arrow).toBe("none");
    expect(d.qr).toBe(DEFAULT_DESIGN.qr);
    expect(d.perSheet).toBe(1);
    expect(d.qrCaption).toBe(true);
  });

  it("never leaves the title blank", () => {
    expect(normalizeDesign({ title: "   " }).title).toBe("YARD SALE");
  });

  it("keeps every preset valid", () => {
    for (const p of SIGN_PRESETS) {
      const merged = { ...DEFAULT_DESIGN, ...p.design };
      expect(normalizeDesign(merged)).toEqual(merged);
    }
  });
});

describe("signContent", () => {
  it("shows the street, or street and city", () => {
    expect(signContent(DEFAULT_DESIGN, sale, days, []).address).toBe("1510 NW Ash Dr");
    expect(signContent({ ...DEFAULT_DESIGN, addressStyle: "full" }, sale, days, []).address).toBe("1510 NW Ash Dr, Ankeny");
    expect(signContent({ ...DEFAULT_DESIGN, address: "off" }, sale, days, []).address).toBeNull();
  });

  it("says dates are coming when there are none", () => {
    expect(signContent(DEFAULT_DESIGN, sale, [], []).dates).toEqual(["Dates coming soon"]);
    expect(signContent({ ...DEFAULT_DESIGN, dates: "off" }, sale, days, []).dates).toBeNull();
  });

  it("fills the extra line from the tagline, categories or custom text", () => {
    const c = (extra: typeof DEFAULT_DESIGN.extra, extraText = "") =>
      signContent({ ...DEFAULT_DESIGN, extra, extraText }, sale, days, ["Furniture", "Tools", "Toys", "Books"]).extra;
    expect(c("tagline")).toBe("Furniture, tools & toys");
    expect(c("categories")).toBe("Furniture · Tools · Toys");
    expect(c("custom", "Everything $1!")).toBe("Everything $1!");
    expect(c("custom", "  ")).toBeNull();
    expect(c("none")).toBeNull();
  });
});
