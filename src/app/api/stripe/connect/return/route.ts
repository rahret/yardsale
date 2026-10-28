import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { requestOrigin } from "@/lib/saleData";
import { syncConnectAccount } from "@/lib/payouts";

// Where Stripe sends the seller after onboarding. Refreshes their account's
// status right away (the account.updated webhook also keeps it current).
export async function GET() {
  const origin = requestOrigin();
  const stripe = getStripe();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (stripe && admin && user) {
    const { data: billing } = await admin
      .from("account_billing")
      .select("stripe_connect_account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (billing?.stripe_connect_account_id) {
      try {
        await syncConnectAccount(admin, await stripe.accounts.retrieve(billing.stripe_connect_account_id));
      } catch {
        // status will catch up via the webhook
      }
    }
  }
  return NextResponse.redirect(`${origin}/dashboard/account?stripe=returned`, { status: 303 });
}
