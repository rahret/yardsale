import { describe, expect, it } from "vitest";
import type { Item, Sale, SaleDay } from "./types";
import { featuredItems, openStatus, paymentMethodsFromProfile, saleCalendar, zonedTimeToUtc } from "./saleInfo";

const sale = {
  id: "s1",
  name: "BIG BIG Sale",
  tagline: "All the good stuff",
  street: "5009 NW 4th",
  city: "Ankeny",
  state: "IA",
  zip: "50023",
  status: "live",
  timezone: "America/Chicago",
} as Sale;

// Fri Oct 30 and Sat Oct 31, 2026 (Chicago is UTC-5 until Nov 1)
const days = [
  { date: "2026-10-31", start_time: "08:00:00", end_time: "14:00:00" },
  { date: "2026-10-30", start_time: "09:00:00", end_time: "17:00:00" },
] as SaleDay[];
const chicago = (local: string) => new Date(`${local}-05:00`);

describe("openStatus", () => {
  it.each([
    ["2026-10-27T10:00", "Opens Fri 9A"],
    ["2026-10-29T10:00", "Opens tomorrow 9A"],
    ["2026-10-30T07:00", "Opens today 9A"],
    ["2026-10-30T12:30", "Open now · closes 5P"],
    ["2026-10-30T18:00", "Opens tomorrow 8A"],
    ["2026-10-31T13:59", "Open now · closes 2P"],
    ["2026-10-31T14:00", "This sale has ended"],
    ["2026-10-20T10:00", "Opens Fri, Oct 30, 9A"],
  ])("at %s → %s", (when, label) => {
    expect(openStatus(sale, days, chicago(when))?.label).toBe(label);
  });

  it("says ended when the seller marked it ended", () => {
    expect(openStatus({ ...sale, status: "ended" }, days, chicago("2026-10-30T12:00"))?.state).toBe("ended");
  });

  it("falls back to the buyer's time zone, or says nothing without one", () => {
    expect(openStatus({ ...sale, timezone: null }, days, chicago("2026-10-30T12:30"), "America/Chicago")?.state).toBe("open");
    expect(openStatus({ ...sale, timezone: null }, days, chicago("2026-10-30T12:30"))).toBeNull();
    expect(openStatus(sale, [], chicago("2026-10-30T12:30"))).toBeNull();
  });
});

describe("featuredItems", () => {
  const item = (over: Partial<Item>) =>
    ({ id: "x", price: 1, status: "available", featured: false, item_photos: [{}], ...over }) as unknown as Item;

  it("uses the seller's picks first, skipping sold ones", () => {
    const items = [
      item({ id: "a", featured: true }),
      item({ id: "b", featured: true, status: "sold" }),
      item({ id: "c", price: 500 }),
    ];
    expect(featuredItems(items).map((i) => i.id)).toEqual(["a"]);
  });

  it("otherwise picks the priciest unsold items with photos", () => {
    const items = [
      item({ id: "cheap", price: 2 }),
      item({ id: "nophoto", price: 900, item_photos: [] }),
      item({ id: "sold", price: 800, status: "sold" }),
      item({ id: "bike", price: 100 }),
      item({ id: "shoes", price: 20 }),
      item({ id: "game", price: 20 }),
    ];
    expect(featuredItems(items).map((i) => i.id)).toEqual(["bike", "shoes", "game"]);
  });
});

describe("paymentMethodsFromProfile", () => {
  it("lists only methods the seller filled in, never the handles", () => {
    expect(paymentMethodsFromProfile({ cash: true, venmo: "@jamie", cashapp: "", zelle: "555" })).toEqual([
      "cash",
      "venmo",
      "zelle",
    ]);
    expect(paymentMethodsFromProfile(null)).toEqual(["cash"]);
  });
});

describe("calendar", () => {
  it("converts local sale times to UTC, including across a clock change", () => {
    expect(zonedTimeToUtc("2026-10-31", "08:00", "America/Chicago").toISOString()).toBe("2026-10-31T13:00:00.000Z");
    // Nov 1, 2026 clocks fall back: 9am is now UTC-6
    expect(zonedTimeToUtc("2026-11-01", "09:00", "America/Chicago").toISOString()).toBe("2026-11-01T15:00:00.000Z");
  });

  it("builds one event per remaining day with the address and link", () => {
    const ics = saleCalendar(sale, days, "https://x.com/s/big", chicago("2026-10-30T18:00"));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1); // Friday is over
    expect(ics).toContain("DTSTART:20261031T130000Z");
    expect(ics).toContain("DTEND:20261031T190000Z");
    expect(ics).toContain("LOCATION:5009 NW 4th\\, Ankeny\\, IA 50023");
    expect(ics).toContain("URL:https://x.com/s/big");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });

  it("uses floating times without a time zone", () => {
    const ics = saleCalendar({ ...sale, timezone: null }, days, "u", chicago("2026-10-27T10:00"));
    expect(ics).toContain("DTSTART:20261030T090000");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});
