import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PASS_DAYS, PRICES, isLiveStatus, subscriptionBillingFields } from "./billing";

/** The seller's Stripe customer, created on first use. */
export async function ensureCustomer(
  stripe: Stripe,
  admin: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<string> {
  const { data: billing } = await admin
    .from("account_billing")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (billing?.stripe_customer_id) return billing.stripe_customer_id;

  const customer = await stripe.customers.create(
    { email: user.email || undefined, metadata: { user_id: user.id } },
    { idempotencyKey: `customer-${user.id}` }
  );
  const { error } = await admin
    .from("account_billing")
    .upsert({ user_id: user.id, stripe_customer_id: customer.id }, { onConflict: "user_id" });
  if (error) throw new Error(`Couldn't save the Stripe customer: ${error.message}`);
  return customer.id;
}

/** A Stripe product for each Pro billing period, created on first use (used
 * when a trial seller switches period while upgrading). */
export async function ensureProProduct(stripe: Stripe, interval: "month" | "year"): Promise<string> {
  const id = `yardsaleqr_pro_${interval}`;
  try {
    return (await stripe.products.retrieve(id)).id;
  } catch {
    return (await stripe.products.create({ id, name: PRICES[interval].name })).id;
  }
}

/** Copies a subscription's state into account_billing. Events can arrive out
 * of order or for an old subscription, so an ended subscription never
 * overwrites a different one that's still going, and complimentary accounts
 * keep their plan. */
export async function syncSubscription(admin: SupabaseClient, sub: Stripe.Subscription): Promise<string> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = sub.metadata?.user_id || null;

  const query = admin.from("account_billing").select("user_id, plan, stripe_subscription_id, subscription_status");
  const { data: row } = await (userId ? query.eq("user_id", userId) : query.eq("stripe_customer_id", customerId)).maybeSingle();
  const ownerId = row?.user_id || userId;
  if (!ownerId) return "unknown customer";

  if (row?.stripe_subscription_id && row.stripe_subscription_id !== sub.id) {
    if (isLiveStatus(row.subscription_status) && !isLiveStatus(sub.status)) return "stale subscription ignored";
  }

  const fields = subscriptionBillingFields(sub);
  const values = {
    user_id: ownerId,
    stripe_customer_id: customerId,
    ...fields,
    plan: row?.plan === "comp" ? "comp" : fields.plan,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("account_billing").upsert(values, { onConflict: "user_id" });
  if (error) throw new Error(`Couldn't save the subscription: ${error.message}`);
  return `subscription ${sub.status}`;
}

/** Applies a finished billing Checkout (subscription or Sale Pass). Called
 * from the webhook and when the seller comes back from Checkout, whichever
 * comes first; repeats are harmless. */
export async function applyBillingCheckout(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  admin: SupabaseClient
): Promise<string> {
  const kind = session.metadata?.kind;
  const userId = session.metadata?.user_id;
  if (!userId) return "no user";

  if (kind === "sale_pass") {
    if (session.payment_status !== "paid") return "awaiting payment";
    const { error } = await admin.rpc("grant_sale_pass", {
      p_user: userId,
      p_session: session.id,
      p_amount_cents: session.amount_total ?? 0,
      p_days: PASS_DAYS,
    });
    if (error) throw new Error(`grant_sale_pass failed: ${error.message}`);

    // bought from the trial: end the trial so Pro never bills them
    const trialSub = session.metadata?.end_trial_subscription;
    if (trialSub) {
      const sub = await stripe.subscriptions.retrieve(trialSub);
      const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const sessionCustomer = typeof session.customer === "string" ? session.customer : session.customer?.id;
      if (sub.status === "trialing" && customer === sessionCustomer) {
        await syncSubscription(admin, await stripe.subscriptions.cancel(trialSub));
        return "sale pass granted, trial ended";
      }
    }
    return "sale pass granted";
  }

  if (kind === "subscription" && session.subscription) {
    const sub =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;
    return syncSubscription(admin, sub);
  }
  return "ignored";
}
