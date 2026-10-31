import type Stripe from "stripe";
import type { AccountBilling } from "./types";

// Seller plans. There's no free tier: new sellers start a 7-day trial of Pro
// (card required, cancel anytime) with limited features, then pay monthly or
// yearly. Sellers holding a single sale can buy a one-time Sale Pass instead.

export type BillingChoice = "month" | "year" | "pass";

export const PRICES: Record<BillingChoice, { cents: number; label: string; name: string }> = {
  month: { cents: 799, label: "$7.99/month", name: "Yard Sale QR Pro (monthly)" },
  year: { cents: 5900, label: "$59/year", name: "Yard Sale QR Pro (yearly)" },
  pass: { cents: 1499, label: "$14.99 once", name: "Yard Sale QR Sale Pass (30 days)" },
};

/** "$7.99", "$59": a plan's price without the period. */
export function priceText(choice: BillingChoice): string {
  const cents = PRICES[choice].cents;
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

export const TRIAL_DAYS = 7;
export const PASS_DAYS = 30;

/** What the trial allows; Pro and the Sale Pass have no limits. */
export const TRIAL_LIMITS = { sales: 1, items: 25 } as const;

/** Features the trial shows but keeps locked. */
export const LOCKED_IN_TRIAL = [
  "More than one sale",
  `More than ${TRIAL_LIMITS.items} items`,
  "Holds",
  "Buy Now (online payment)",
  "Listing in Find yard sales",
] as const;

/** Mirrors public.seller_access in schema.sql (the database enforces it). */
export type Access = "full" | "trial" | "none";

/** Stripe statuses that mean a subscription is still going. */
const LIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

export function accessFor(
  billing: Pick<AccountBilling, "plan" | "subscription_status" | "pass_expires_at"> | null | undefined,
  now = Date.now()
): Access {
  if (!billing) return "none";
  if (billing.plan === "comp") return "full";
  if (billing.pass_expires_at && new Date(billing.pass_expires_at).getTime() > now) return "full";
  if (billing.subscription_status === "active" || billing.subscription_status === "past_due") return "full";
  if (billing.subscription_status === "trialing") return "trial";
  return "none";
}

/** The seller has a subscription that hasn't ended (they shouldn't start another). */
export function hasLiveSubscription(billing: Pick<AccountBilling, "subscription_status"> | null | undefined): boolean {
  return !!billing?.subscription_status && LIVE_STATUSES.has(billing.subscription_status);
}

/** Where upgrade prompts link to. */
export const UPGRADE_HREF = "/dashboard/account#plan";

/** Stripe Checkout settings for starting a Pro subscription. New sellers get
 * the 7-day trial; a card is always collected, and a trial that somehow ends
 * without one cancels instead of billing. */
export function subscriptionCheckoutParams(o: {
  interval: "month" | "year";
  customerId: string;
  userId: string;
  origin: string;
  withTrial: boolean;
  returnTo: string;
  /** Unix seconds: start billing then instead of now (when a Sale Pass is still running). */
  startAt?: number | null;
}): Stripe.Checkout.SessionCreateParams {
  const price = PRICES[o.interval];
  return {
    mode: "subscription",
    customer: o.customerId,
    payment_method_collection: "always",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: price.cents,
          recurring: { interval: o.interval },
          product_data: { name: price.name },
        },
      },
    ],
    subscription_data: {
      metadata: { user_id: o.userId },
      ...(o.startAt
        ? {
            // nothing is charged until the pass runs out
            trial_end: o.startAt,
            trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          }
        : o.withTrial
        ? {
            trial_period_days: TRIAL_DAYS,
            trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          }
        : {}),
    },
    metadata: { kind: "subscription", user_id: o.userId },
    allow_promotion_codes: true,
    success_url: billingReturnUrl(o.origin, o.returnTo),
    cancel_url: billingNoticeUrl(o.origin, o.returnTo, "canceled"),
  };
}

/** Stripe only lets Checkout delay the first charge if it's at least 48 hours
 * away; a pass ending sooner than that just overlaps the new subscription. */
const MIN_DELAYED_START_MS = 48 * 60 * 60 * 1000;

/** When a seller with a Sale Pass subscribes, when billing should start
 * (unix seconds), or null to start now. */
export function subscriptionStartAfterPass(passExpiresAt: string | null | undefined, now = Date.now()): number | null {
  if (!passExpiresAt) return null;
  const ends = new Date(passExpiresAt).getTime();
  return ends - now >= MIN_DELAYED_START_MS ? Math.floor(ends / 1000) : null;
}

/** Stripe Checkout settings for a one-time 30-day Sale Pass. When bought
 * from the trial, endTrialSubscription names the trial subscription to
 * cancel once the pass is paid (so the seller isn't billed for Pro too). */
export function passCheckoutParams(o: {
  customerId: string;
  userId: string;
  origin: string;
  returnTo: string;
  endTrialSubscription?: string | null;
}): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    customer: o.customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: PRICES.pass.cents,
          product_data: {
            name: PRICES.pass.name,
            description: `Everything in Pro for ${PASS_DAYS} days. No subscription — it just ends.`,
          },
        },
      },
    ],
    payment_intent_data: { metadata: { kind: "sale_pass", user_id: o.userId } },
    invoice_creation: { enabled: true },
    metadata: {
      kind: "sale_pass",
      user_id: o.userId,
      ...(o.endTrialSubscription ? { end_trial_subscription: o.endTrialSubscription } : {}),
    },
    allow_promotion_codes: true,
    success_url: billingReturnUrl(o.origin, o.returnTo),
    cancel_url: billingNoticeUrl(o.origin, o.returnTo, "canceled"),
  };
}

function billingReturnUrl(origin: string, returnTo: string): string {
  // {CHECKOUT_SESSION_ID} is filled in by Stripe
  return `${origin}/api/billing/return?session_id={CHECKOUT_SESSION_ID}&to=${encodeURIComponent(returnTo)}`;
}

/** returnTo (a path, maybe with a #section) with ?billing=<notice> added. */
export function billingNoticeUrl(origin: string, returnTo: string, notice: string): string {
  const url = new URL(returnTo, origin);
  url.searchParams.set("billing", notice);
  return url.toString();
}

const isoOrNull = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);

/** The account_billing columns a Stripe subscription determines. */
export function subscriptionBillingFields(sub: Stripe.Subscription) {
  const live = LIVE_STATUSES.has(sub.status);
  const item = sub.items?.data?.[0];
  const interval = item?.price?.recurring?.interval;
  return {
    plan: live ? ("pro" as const) : ("none" as const),
    subscription_status: sub.status,
    stripe_subscription_id: sub.id,
    current_period_end: isoOrNull(sub.current_period_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    trial_ends_at: isoOrNull(sub.trial_end),
    billing_interval: interval === "month" || interval === "year" ? interval : null,
    ...(sub.trial_start ? { trial_used: true } : {}),
  };
}

export function isLiveStatus(status: string | null | undefined): boolean {
  return !!status && LIVE_STATUSES.has(status);
}
