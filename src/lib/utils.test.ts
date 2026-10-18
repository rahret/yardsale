import { describe, expect, it } from "vitest";
import type { Item, Sale } from "./types";
import {
  formatAddress,
  formatPhone,
  formatSignTime,
  isEffectivelyExpired,
  money,
  reservationDeadline,
  siteOrigin,
  slugify,
} from "./utils";

describe("money", () => {
  it("drops cents for whole dollars", () => {
    expect(money(5)).toBe("$5");
    expect(money(5.5)).toBe("$5.50");
    expect(money(null)).toBe("$0");
  });
});

describe("formatAddress", () => {
  it("joins only the parts that are filled in", () => {
    expect(formatAddress({ street: "1 Main St", city: "Springfield", state: "IL", zip: "62704" })).toBe(
      "1 Main St, Springfield, IL 62704"
    );
    expect(formatAddress({ street: "1 Main St", city: "", state: "", zip: "" })).toBe("1 Main St");
  });
});

describe("formatSignTime", () => {
  it("drops :00 minutes and the M from AM/PM", () => {
    expect(formatSignTime("09:00")).toBe("9A");
    expect(formatSignTime("14:00:00")).toBe("2P");
    expect(formatSignTime("00:00")).toBe("12A");
    expect(formatSignTime("12:00")).toBe("12P");
  });
  it("keeps non-zero minutes", () => {
    expect(formatSignTime("08:30")).toBe("8:30A");
  });
});

describe("formatPhone", () => {
  it("formats 10 digits and leaves anything else alone", () => {
    expect(formatPhone("3125550101")).toBe("(312) 555-0101");
    expect(formatPhone("555-234-5678")).toBe("555-234-5678");
  });
});

describe("slugify", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("  Jamie's BIG Sale!! ")).toBe("jamie-s-big-sale");
    expect(slugify("x".repeat(60))).toHaveLength(48);
  });
});

describe("siteOrigin", () => {
  it("strips trailing slashes", () => {
    expect(siteOrigin("https://example.com//")).toBe("https://example.com");
  });
});

describe("reservation expiry", () => {
  const sale = { default_reservation_minutes: 30 } as Sale;
  const reservedAt = new Date(Date.now() - 20 * 60000).toISOString();

  it("uses the sale default unless the item overrides it", () => {
    const item = { status: "reserved", reserved_at: reservedAt, reservation_minutes: null } as Item;
    expect(reservationDeadline(item, sale)).toBe(new Date(reservedAt).getTime() + 30 * 60000);
    expect(isEffectivelyExpired(item, sale)).toBe(false);
    expect(isEffectivelyExpired({ ...item, reservation_minutes: 10 }, sale)).toBe(true);
  });

  it("never treats a non-reserved item as expired", () => {
    expect(isEffectivelyExpired({ status: "available", reserved_at: null } as Item, sale)).toBe(false);
  });
});
