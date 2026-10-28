import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { requestOrigin } from "@/lib/saleData";

// "View payouts" on the Account page: a one-time login link to the seller's
// Stripe Express dashboard (balance, payouts, bank details).
export async function POST() {
  const origin = requestOrigin();
  const stripe = getStripe();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!stripe || !admin || !user) return NextResponse.redirect(`${origin}/dashboard/account`, { status: 303 });

  const { data: billing } = await admin
    .from("account_billing")
    .select("stripe_connect_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!billing?.stripe_connect_account_id) {
    return NextResponse.redirect(`${origin}/dashboard/account`, { status: 303 });
  }
  try {
    const link = await stripe.accounts.createLoginLink(billing.stripe_connect_account_id);
    return NextResponse.redirect(link.url, { status: 303 });
  } catch {
    return NextResponse.redirect(`${origin}/dashboard/account?stripe=error`, { status: 303 });
  }
}
