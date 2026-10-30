import { describe, expect, it } from "vitest";
import type { Item, Sale, SaleDay } from "./types";
import { dateRange, popularCategories, toListing } from "./directory";

const sale = {
  slug: "big-big-sale",
  name: "BIG BIG Sale",
  tagline: "All the good stuff",
  street: "5009 NW 4th",
  city: "Ankeny",
  state: "IA",
  zip: "50023",
  show_full_address: false,
  timezone: "America/Chicago",
  status: "live",
} as Sale;

const days = [
  { date: "2026-10-31", start_time: "08:00:00", end_time: "14:00:00" },
  { date: "2026-10-30", start_time: "09:00:00", end_time: "17:00:00" },
] as SaleDay[];

const item = (over: Partial<Item>) =>
  ({ id: "x", name: "x", price: 5, category: "Misc", status: "available", item_photos: [], ...over }) as unknown as Item;
const items = [
  item({ category: "Furniture", item_photos: [{ storage_path: "a.jpg", position: 0 }] as never }),
  item({ category: "Furniture" }),
  item({ category: "Tools" }),
  item({ category: "Toys", status: "sold" }),
];

const wed = new Date("2026-10-28T15:00:00Z");

describe("toListing", () => {
  it("summarizes a sale without the house number", () => {
    const l = toListing(sale, days, items, wed)!;
    expect(l.location).toBe("NW 4th, Ankeny, IA");
    expect(l.days.map((d) => d.date)).toEqual(["2026-10-30", "2026-10-31"]);
    expect(l.categories).toEqual(["Furniture", "Tools"]);
    expect(l.itemCount).toBe(3);
    expect(l.photos).toHaveLength(1);
  });

  it("drops sales whose days are all over", () => {
    expect(toListing(sale, days, items, new Date("2026-11-05T15:00:00Z"))).toBeNull();
  });
});

describe("dates", () => {
  it("computes 'this weekend' from any weekday", () => {
    expect(dateRange("weekend", "2026-10-28")).toEqual(["2026-10-31", "2026-11-01"]); // Wed
    expect(dateRange("weekend", "2026-10-31")).toEqual(["2026-10-31", "2026-11-01"]); // Sat
    expect(dateRange("weekend", "2026-11-01")).toEqual(["2026-11-01", "2026-11-01"]); // Sun
    expect(dateRange("week", "2026-10-28")).toEqual(["2026-10-28", "2026-11-03"]);
  });
});

describe("popularCategories", () => {
  it("ranks categories across sales, ignoring case", () => {
    const a = toListing(sale, days, items, wed)!;
    const b = { ...a, categories: ["furniture", "Books"] };
    expect(popularCategories([a, b])).toEqual(["Furniture", "Books", "Tools"]);
  });
});
