import { describe, expect, it } from "vitest";
import type { Item, Sale, SaleDay } from "./types";
import {
  dayLines,
  itemPreview,
  publicLocation,
  saleLink,
  salePhase,
  salePost,
  salePreview,
  streetName,
  topCategories,
} from "./share";

const sale = {
  id: "s1",
  slug: "jamies-sale-ab12",
  name: "Jamie's Yard Sale",
  tagline: "everything must go",
  street: "123 Maple St",
  city: "Springfield",
  state: "IL",
  zip: "62704",
  status: "live",
  show_full_address: false,
  timezone: "America/Chicago",
} as Sale;

const days = [
  { date: "2026-10-24", start_time: "08:00:00", end_time: "14:00:00" },
  { date: "2026-10-23", start_time: "09:00:00", end_time: "13:30:00" },
] as SaleDay[];

const item = (over: Partial<Item>): Item =>
  ({ id: "i", name: "Thing", price: 5, category: "Misc", status: "available", ...over }) as Item;

const items = [
  item({ id: "1", category: "Furniture" }),
  item({ id: "2", category: "Furniture" }),
  item({ id: "3", category: "Tools" }),
  item({ id: "4", category: "Toys", status: "sold" }),
  item({ id: "5", category: "Misc" }),
];

describe("streetName", () => {
  it("drops the house number", () => {
    expect(streetName("123 Maple St")).toBe("Maple St");
    expect(streetName("123A Maple St")).toBe("Maple St");
    expect(streetName("12-14 Oak Ave")).toBe("Oak Ave");
    expect(streetName("Maple St")).toBe("Maple St");
  });
});

describe("publicLocation", () => {
  it("hides the house number unless the seller opts in", () => {
    expect(publicLocation(sale)).toBe("Maple St, Springfield, IL");
    expect(publicLocation({ ...sale, show_full_address: true })).toBe("123 Maple St, Springfield, IL");
    expect(publicLocation({ ...sale, street: "", city: "", state: "" })).toBe("");
  });
});

describe("saleLink", () => {
  it("adds item and source tags", () => {
    expect(saleLink("https://x.com", "abc")).toBe("https://x.com/s/abc");
    expect(saleLink("https://x.com", "abc", { src: "qr" })).toBe("https://x.com/s/abc?src=qr");
    expect(saleLink("https://x.com", "abc", { item: "i1", src: "friend" })).toBe("https://x.com/s/abc?item=i1&src=friend");
  });
});

describe("dayLines / topCategories", () => {
  it("lists days in date order with compact times", () => {
    expect(dayLines(days)).toEqual(["Fri, Oct 23, 9A–1:30P", "Sat, Oct 24, 8A–2P"]);
  });
  it("ranks categories of unsold items, ignoring Misc", () => {
    expect(topCategories(items)).toEqual(["Furniture", "Tools"]);
  });
});

describe("salePhase", () => {
  // 2026-10-24 10:00 in Chicago (CDT, UTC-5) = 15:00 UTC
  const satMorning = new Date("2026-10-24T15:00:00Z");
  it("knows when the sale is happening", () => {
    expect(salePhase(sale, days, satMorning)).toBe("now");
    expect(salePhase(sale, days, new Date("2026-10-20T15:00:00Z"))).toBe("upcoming");
    expect(salePhase(sale, days, new Date("2026-10-24T20:00:00Z"))).toBe("ended"); // 3pm Sat, after close
    expect(salePhase({ ...sale, status: "ended" }, days, new Date("2026-10-20T15:00:00Z"))).toBe("ended");
  });
  it("can't say 'now' without a time zone", () => {
    expect(salePhase({ ...sale, timezone: null }, days, satMorning)).toBe("upcoming");
  });
});

describe("previews", () => {
  it("summarizes the sale", () => {
    const p = salePreview(sale, days, items, new Date("2026-10-20T15:00:00Z"));
    expect(p.title).toBe("Jamie's Yard Sale · Fri, Oct 23, 9A–1:30P (+1 more day)");
    expect(p.description).toBe("Furniture, Tools · 4 items · Maple St, Springfield, IL");
    expect(salePreview(sale, days, items, new Date("2026-10-24T15:00:00Z")).title).toMatch(/^Happening now!/);
  });
  it("summarizes an item", () => {
    const p = itemPreview(sale, days, item({ name: "Oak rocking chair", price: 25 }));
    expect(p.title).toBe("Oak rocking chair · $25");
    expect(p.description).toContain("At Jamie's Yard Sale");
    expect(p.description).not.toContain("123");
  });
});

describe("salePost", () => {
  it("never includes the house number by default", () => {
    for (const kind of ["group", "craigslist", "text"] as const) {
      const text = salePost(kind, sale, days, items, "https://x.com/s/abc?src=group");
      expect(text).toContain("Maple St");
      expect(text).not.toContain("123 Maple");
      expect(text).toContain("https://x.com/s/abc?src=group");
    }
  });
});
