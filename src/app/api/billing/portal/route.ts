import { NextResponse } from "next/server";
import { billingRedirect, withBilling } from "@/lib/billingRoute";

// "Manage billing": Stripe's customer portal, where sellers update their
// card, see invoices, or cancel.
export async function POST() {
  return withBilling("/dashboard/account#plan", async ({ stripe, admin, user, origin }) => {
    const { data: billing } = await admin
      .from("account_billing")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!billing?.stripe_customer_id) return billingRedirect("error");

    const portal = await stripe.billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: `${origin}/dashboard/account#plan`,
    });
    return NextResponse.redirect(portal.url, { status: 303 });
  });
}
