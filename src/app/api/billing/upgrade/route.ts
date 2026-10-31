import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { billingRedirect, withBilling } from "@/lib/billingRoute";
import { ensureProProduct, syncSubscription } from "@/lib/billingServer";
import { PRICES } from "@/lib/billing";

// "Unlock everything now" during the trial, with monthly or yearly picked in
// the confirmation pop-up (choice=month|year): ends the trial today, switches
// the billing period if needed, and charges the first period to the card on
// file. If the card is declined, Stripe refuses the change and the trial
// carries on as before. (The Sale Pass choice goes through Checkout instead.)
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
    if (!billing?.stripe_subscription_id || billing.subscription_status !== "trialing") {
      return billingRedirect("error");
    }

    const current = await stripe.subscriptions.retrieve(billing.stripe_subscription_id);
    const item = current.items.data[0];
    const switching = item?.price?.recurring?.interval !== choice;
    const items: Stripe.SubscriptionUpdateParams.Item[] | undefined = switching
      ? [
          {
            id: item.id,
            price_data: {
              currency: "usd",
              product: await ensureProProduct(stripe, choice),
              unit_amount: PRICES[choice].cents,
              recurring: { interval: choice },
            },
          },
        ]
      : undefined;

    const sub = await stripe.subscriptions.update(billing.stripe_subscription_id, {
      trial_end: "now",
      ...(items ? { items } : {}),
      cancel_at_period_end: false,
      payment_behavior: "error_if_incomplete",
      proration_behavior: "none",
    });
    await syncSubscription(admin, sub);
    return billingRedirect("upgraded");
  });
}
