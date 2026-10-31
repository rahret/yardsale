import { describe, expect, it } from "vitest";
import { applicationFeeCents, canBuyOnline, feeSettings, pickupCode, sellerNetCents, toCents } from "./fees";

const stripeOnly = { stripePercent: 2.9, stripeFixedCents: 30, platformPercent: 0, platformFixedCents: 0 };

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
  it("takes 1.5% + 15¢ for the platform by default", () => {
    expect(feeSettings()).toMatchObject({ platformPercent: 1.5, platformFixedCents: 15 });
    // $25: Stripe ceil(72.5) + 30 = 103, platform round(37.5) + 15 = 53
    expect(applicationFeeCents(2500, feeSettings())).toBe(103 + 53);
    expect(sellerNetCents(2500, feeSettings())).toBe(2344);
    // $3, the Buy Now minimum: Stripe ceil(8.7) + 30 = 39, platform round(4.5) + 15 = 20
    expect(sellerNetCents(300, feeSettings())).toBe(241);
  });
  it("offers Buy Now on single items priced $3 or more", () => {
    expect(canBuyOnline({ price: 3, quantity_total: 1 })).toBe(true);
    expect(canBuyOnline({ price: "3.00", quantity_total: 1 })).toBe(true);
    expect(canBuyOnline({ price: 2.99, quantity_total: 1 })).toBe(false);
    expect(canBuyOnline({ price: 1, quantity_total: 1 })).toBe(false);
    expect(canBuyOnline({ price: 0, quantity_total: 1 })).toBe(false);
    expect(canBuyOnline({ price: 20, quantity_total: 12 })).toBe(false); // bulk: in person only
  });
  it("makes 4-digit pickup codes", () => {
    expect(pickupCode(() => 0)).toBe("0000");
    expect(pickupCode(() => 0.0421)).toBe("0421");
    expect(pickupCode(() => 0.99999)).toBe("9999");
  });
});
