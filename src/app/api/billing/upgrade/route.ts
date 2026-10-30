import { billingRedirect, withBilling } from "@/lib/billingRoute";
import { syncSubscription } from "@/lib/billingServer";

// "Unlock everything now" during the trial: ends the trial today and charges
// the first period. If the card is declined, Stripe refuses the change and the
// trial carries on as before.
export async function POST() {
  return withBilling("/dashboard/account#plan", async ({ stripe, admin, user }) => {
    const { data: billing } = await admin
      .from("account_billing")
      .select("stripe_subscription_id, subscription_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!billing?.stripe_subscription_id || billing.subscription_status !== "trialing") {
      return billingRedirect("error");
    }

    const sub = await stripe.subscriptions.update(billing.stripe_subscription_id, {
      trial_end: "now",
      payment_behavior: "error_if_incomplete",
      proration_behavior: "none",
    });
    await syncSubscription(admin, sub);
    return billingRedirect("upgraded");
  });
}
