import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { billingRedirect, withBilling } from "@/lib/billingRoute";
import { ensureProProduct, syncSubscription } from "@/lib/billingServer";
import { PRICES } from "@/lib/billing";

// "Change plan" for Pro subscribers (choice=month|year). Switches today:
// monthly → yearly charges the year now, less credit for the unused part of
// the month; yearly → monthly turns the unused part of the year into account
// credit that pays the monthly charges. A subscription that hasn't started
// billing yet (waiting for a Sale Pass to end) just changes price, no charge.
// If a card is declined, Stripe refuses the change and nothing happens.
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const choice = form?.get("choice");

  return withBilling("/dashboard/account#plan", async ({ stripe, admin, user }) => {
    if (choice !== "month" && choice !== "year") return billingRedirect("error");

    const { data: billing } = await admin
      .from("account_billing")
      .select("stripe_subscription_id, subscription_status")
      .eq("user_id", user.id)
      .maybeSingle();
    const status = billing?.subscription_status;
    if (!billing?.stripe_subscription_id || !["active", "past_due", "trialing"].includes(status ?? "")) {
      return billingRedirect("error");
    }

    const current = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
    const item = current.items.data[0];
    if (!item) return billingRedirect("error");
    if (item.price?.recurring?.interval === choice) return billingRedirect("same-plan");

    const items: Stripe.SubscriptionUpdateParams.Item[] = [
      {
        id: item.id,
        price_data: {
          currency: "usd",
          product: await ensureProProduct(stripe, choice),
          unit_amount: PRICES[choice].cents,
          recurring: { interval: choice },
        },
      },
    ];
    const sub = await stripe.subscriptions.update(billing.stripe_subscription_id, {
      items,
      cancel_at_period_end: false,
      ...(current.status === "trialing"
        ? { proration_behavior: "none" as const }
        : { proration_behavior: "always_invoice" as const, payment_behavior: "error_if_incomplete" as const }),
    });
    await syncSubscription(admin, sub);
    return billingRedirect("switched");
  });
}
