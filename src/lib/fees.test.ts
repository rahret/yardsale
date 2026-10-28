import { describe, expect, it } from "vitest";
import { applicationFeeCents, canBuyOnline, pickupCode, sellerNetCents, toCents } from "./fees";

const stripeOnly = { stripePercent: 2.9, stripeFixedCents: 30, platformPercent: 0 };

describe("fees", () => {
  it("covers Stripe's fee so the platform never loses money", () => {
    expect(applicationFeeCents(2500, stripeOnly)).toBe(73 + 30); // ceil(72.5) + 30
    expect(sellerNetCents(2500, stripeOnly)).toBe(2397);
  });
  it("adds the platform's cut on top", () => {
    expect(applicationFeeCents(2500, { ...stripeOnly, platformPercent: 5 })).toBe(103 + 125);
  });
  it("never takes more than the price", () => {
    expect(applicationFeeCents(20, stripeOnly)).toBe(20);
  });
  it("converts dollars to cents without float drift", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents("0.1")).toBe(10);
  });
  it("offers Buy Now on any single item Stripe can charge (50¢+)", () => {
    expect(canBuyOnline({ price: 1, quantity_total: 1 })).toBe(true);
    expect(canBuyOnline({ price: "0.50", quantity_total: 1 })).toBe(true);
    expect(canBuyOnline({ price: 0.25, quantity_total: 1 })).toBe(false);
    expect(canBuyOnline({ price: 0, quantity_total: 1 })).toBe(false);
    expect(canBuyOnline({ price: 20, quantity_total: 12 })).toBe(false); // bulk: in person only
  });
  it("makes 4-digit pickup codes", () => {
    expect(pickupCode(() => 0)).toBe("0000");
    expect(pickupCode(() => 0.0421)).toBe("0421");
    expect(pickupCode(() => 0.99999)).toBe("9999");
  });
});
