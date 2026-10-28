import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Copies a connected account's readiness into account_billing. */
export async function syncConnectAccount(admin: SupabaseClient, account: Stripe.Account) {
  await admin
    .from("account_billing")
    .update({
      connect_charges_enabled: !!account.charges_enabled,
      connect_payouts_enabled: !!account.payouts_enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_connect_account_id", account.id);
}
