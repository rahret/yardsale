import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  accessFor,
  billingNoticeUrl,
  hasLiveSubscription,
  passCheckoutParams,
  subscriptionBillingFields,
  subscriptionCheckoutParams,
  subscriptionStartAfterPass,
} from "./billing";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const billing = (over: Partial<Parameters<typeof accessFor>[0] & object> = {}) => ({
  plan: "none" as const,
  subscription_status: null,
  pass_expires_at: null,
  ...over,
});

describe("accessFor", () => {
  it("has no free tier", () => {
    expect(accessFor(null, NOW)).toBe("none");
    expect(accessFor(billing(), NOW)).toBe("none");
    expect(accessFor(billing({ subscription_status: "canceled" }), NOW)).toBe("none");
    expect(accessFor(billing({ subscription_status: "incomplete" }), NOW)).toBe("none");
  });

  it("limits the trial and unlocks Pro", () => {
    expect(accessFor(billing({ plan: "pro", subscription_status: "trialing" }), NOW)).toBe("trial");
    expect(accessFor(billing({ plan: "pro", subscription_status: "active" }), NOW)).toBe("full");
    // Stripe retries a declined renewal; keep the seller going meanwhile
    expect(accessFor(billing({ plan: "pro", subscription_status: "past_due" }), NOW)).toBe("full");
  });

  it("unlocks everything with an unexpired Sale Pass, even during a trial", () => {
    expect(accessFor(billing({ pass_expires_at: "2026-11-15T00:00:00Z" }), NOW)).toBe("full");
    expect(accessFor(billing({ pass_expires_at: "2026-10-01T00:00:00Z" }), NOW)).toBe("none");
    expect(
      accessFor(billing({ subscription_status: "trialing", pass_expires_at: "2026-11-15T00:00:00Z" }), NOW)
    ).toBe("full");
  });

  it("treats complimentary accounts as Pro", () => {
    expect(accessFor(billing({ plan: "comp" }), NOW)).toBe("full");
  });
});

describe("hasLiveSubscription", () => {
  it("stops a second subscription while one is going", () => {
    expect(hasLiveSubscription({ subscription_status: "trialing" })).toBe(true);
    expect(hasLiveSubscription({ subscription_status: "past_due" })).toBe(true);
    expect(hasLiveSubscription({ subscription_status: "canceled" })).toBe(false);
    expect(hasLiveSubscription(null)).toBe(false);
  });
});

describe("Checkout settings", () => {
  const base = { customerId: "cus_1", userId: "user-1", origin: "https://yardsaleqr.example.com", productId: "yardsaleqr_pro_month" };

  it("starts a 7-day trial with a card required", () => {
    const p = subscriptionCheckoutParams({ ...base, interval: "month", withTrial: true, returnTo: "/dashboard/welcome" });
    expect(p.mode).toBe("subscription");
    expect(p.payment_method_collection).toBe("always");
    expect(p.line_items?.[0].price_data).toMatchObject({
      unit_amount: 799,
      recurring: { interval: "month" },
      // filed under the plan's fixed product, not a new one per checkout
      product: "yardsaleqr_pro_month",
    });
    expect(p.line_items?.[0].price_data).not.toHaveProperty("product_data");
    expect(p.subscription_data?.trial_period_days).toBe(7);
    expect(p.subscription_data?.metadata).toEqual({ user_id: "user-1" });
    expect(p.success_url).toBe(
      "https://yardsaleqr.example.com/api/billing/return?session_id={CHECKOUT_SESSION_ID}&to=%2Fdashboard%2Fwelcome"
    );
    expect(p.cancel_url).toBe("https://yardsaleqr.example.com/dashboard/welcome?billing=canceled");
  });

  it("gives no second trial and prices the yearly plan", () => {
    const p = subscriptionCheckoutParams({ ...base, interval: "year", withTrial: false, returnTo: "/dashboard/account#plan" });
    expect(p.subscription_data?.trial_period_days).toBeUndefined();
    expect(p.line_items?.[0].price_data).toMatchObject({ unit_amount: 5900, recurring: { interval: "year" } });
    expect(p.cancel_url).toBe("https://yardsaleqr.example.com/dashboard/account?billing=canceled#plan");
  });

  it("starts billing when a running Sale Pass ends, with no free trial on top", () => {
    const passEnds = "2026-11-20T00:00:00Z";
    const startAt = subscriptionStartAfterPass(passEnds, NOW);
    expect(startAt).toBe(Date.parse(passEnds) / 1000);
    const p = subscriptionCheckoutParams({ ...base, interval: "year", withTrial: false, returnTo: "/x", startAt });
    expect(p.subscription_data?.trial_end).toBe(startAt);
    expect(p.subscription_data?.trial_period_days).toBeUndefined();
  });

  it("starts billing now when the pass ends within 48 hours (Stripe's minimum delay)", () => {
    expect(subscriptionStartAfterPass("2026-11-01T06:00:00Z", NOW)).toBeNull();
    expect(subscriptionStartAfterPass("2026-10-01T00:00:00Z", NOW)).toBeNull();
    expect(subscriptionStartAfterPass(null, NOW)).toBeNull();
  });

  it("sells the Sale Pass as a one-time payment", () => {
    const p = passCheckoutParams({ ...base, returnTo: "/dashboard/account#plan" });
    expect(p.mode).toBe("payment");
    expect(p.line_items?.[0].price_data?.unit_amount).toBe(1499);
    expect(p.metadata).toEqual({ kind: "sale_pass", user_id: "user-1" });
  });

  it("remembers which trial to end when the pass is bought from the trial", () => {
    const p = passCheckoutParams({ ...base, returnTo: "/dashboard/account#plan", endTrialSubscription: "sub_trial" });
    expect(p.metadata).toEqual({ kind: "sale_pass", user_id: "user-1", end_trial_subscription: "sub_trial" });
  });

  it("adds notices to return paths", () => {
    expect(billingNoticeUrl("https://x.test", "/dashboard/account#plan", "pass")).toBe(
      "https://x.test/dashboard/account?billing=pass#plan"
    );
  });
});

describe("subscriptionBillingFields", () => {
  const sub = (over: Partial<Stripe.Subscription> = {}) =>
    ({
      id: "sub_1",
      status: "trialing",
      current_period_end: 1793000000,
      cancel_at_period_end: false,
      trial_start: 1792400000,
      trial_end: 1793000000,
      items: { data: [{ price: { recurring: { interval: "year" } } }] },
      ...over,
    }) as unknown as Stripe.Subscription;

  it("records the trial", () => {
    expect(subscriptionBillingFields(sub())).toEqual({
      plan: "pro",
      subscription_status: "trialing",
      stripe_subscription_id: "sub_1",
      current_period_end: new Date(1793000000 * 1000).toISOString(),
      cancel_at_period_end: false,
      trial_ends_at: new Date(1793000000 * 1000).toISOString(),
      billing_interval: "year",
      trial_used: true,
    });
  });

  it("drops the plan when the subscription ends", () => {
    const f = subscriptionBillingFields(sub({ status: "canceled", trial_start: null, trial_end: null }));
    expect(f.plan).toBe("none");
    expect(f.trial_ends_at).toBeNull();
    // never un-sets trial_used
    expect("trial_used" in f).toBe(false);
  });
});
