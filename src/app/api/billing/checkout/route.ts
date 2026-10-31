import { NextResponse, type NextRequest } from "next/server";
import { billingRedirect, withBilling } from "@/lib/billingRoute";
import { ensureCustomer } from "@/lib/billingServer";
import { hasLiveSubscription, passCheckoutParams, subscriptionCheckoutParams } from "@/lib/billing";
import { safeRedirectPath } from "@/lib/utils";

// "Start free trial" / "Subscribe" / "Get a Sale Pass" buttons (form posts
// with choice=month|year|pass and an optional return path). Sends the seller
// to Stripe Checkout; /api/billing/return brings them back.
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const choice = String(form.get("choice") || "");
  const returnTo = safeRedirectPath(String(form.get("returnTo") || ""), "/dashboard/account#plan");

  return withBilling(returnTo, async ({ stripe, admin, user, origin }) => {
    if (choice !== "month" && choice !== "year" && choice !== "pass") return billingRedirect("error", returnTo);

    const { data: billing } = await admin
      .from("account_billing")
      .select("subscription_status, stripe_subscription_id, trial_used")
      .eq("user_id", user.id)
      .maybeSingle();
    if (choice !== "pass" && hasLiveSubscription(billing)) return billingRedirect("already", returnTo);

    const customerId = await ensureCustomer(stripe, admin, user);
    const session = await stripe.checkout.sessions.create(
      choice === "pass"
        ? passCheckoutParams({
            customerId,
            userId: user.id,
            origin,
            returnTo,
            endTrialSubscription: billing?.subscription_status === "trialing" ? billing.stripe_subscription_id : null,
          })
        : subscriptionCheckoutParams({
            interval: choice,
            customerId,
            userId: user.id,
            origin,
            returnTo,
            withTrial: !billing?.trial_used,
          })
    );
    return NextResponse.redirect(session.url!, { status: 303 });
  });
}
