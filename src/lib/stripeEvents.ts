import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncConnectAccount } from "./payouts";
import { applyBillingCheckout, syncSubscription } from "./billingServer";
import { notifyOrderPaid } from "./alerts";

/** Refunds a paid order through Stripe, pulling the money back from the
 * seller's transfer and returning the application fee, then records it. */
export async function refundOrder(
  stripe: Stripe,
  admin: SupabaseClient,
  order: { id: string; stripe_payment_intent_id: string | null }
): Promise<boolean> {
  if (!order.stripe_payment_intent_id) return false;
  await stripe.refunds.create(
    { payment_intent: order.stripe_payment_intent_id, reverse_transfer: true, refund_application_fee: true },
    { idempotencyKey: `refund-${order.id}` }
  );
  await admin.from("orders").update({ status: "refunded", refunded_at: new Date().toISOString() }).eq("id", order.id);
  return true;
}

function pickupName(session: Stripe.Checkout.Session): string | null {
  return session.custom_fields?.find((f) => f.key === "pickup_name")?.text?.value ?? session.customer_details?.name ?? null;
}

/** Finishes a paid Checkout: sells the item (or refunds if it was already
 * gone). Called from the webhook and from the buyer's confirmation page,
 * whichever comes first; the database function makes repeats harmless. */
export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  admin: SupabaseClient
): Promise<string> {
  if (session.payment_status !== "paid") return "awaiting payment";
  const orderId = session.metadata?.order_id || session.client_reference_id;
  if (!orderId) return "no order";
  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  const { data: result, error } = await admin.rpc("complete_order", {
    p_order_id: orderId,
    p_payment_intent: paymentIntent,
    p_buyer_email: session.customer_details?.email ?? null,
    p_buyer_name: pickupName(session),
  });
  if (error) throw new Error(`complete_order failed: ${error.message}`);

  if (result === "conflict") {
    // someone else got the item first — give this buyer their money back
    await refundOrder(stripe, admin, { id: orderId, stripe_payment_intent_id: paymentIntent });
    return "refunded (item already gone)";
  }
  // tell the seller to set it aside (sent once, however often this runs)
  if (result === "paid") await notifyOrderPaid(admin, orderId);
  return String(result);
}

/** Applies one verified Stripe webhook event. Returns a short description of
 * what happened (for logs/tests). Safe to receive the same event twice. */
export async function handleStripeEvent(event: Stripe.Event, stripe: Stripe, admin: SupabaseClient): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (isBillingSession(session)) return applyBillingCheckout(session, stripe, admin);
      return fulfillCheckoutSession(session, stripe, admin);
    }

    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (isBillingSession(session)) return "ignored";
      const orderId = session.metadata?.order_id || session.client_reference_id;
      if (orderId) await admin.from("orders").update({ status: "expired" }).eq("id", orderId).eq("status", "pending");
      return "expired";
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      return syncSubscription(admin, event.data.object as Stripe.Subscription);
    }

    case "account.updated": {
      await syncConnectAccount(admin, event.data.object as Stripe.Account);
      return "account synced";
    }

    default:
      return "ignored";
  }
}

/** A seller paying us (subscription or Sale Pass), not a buyer's Buy Now. */
function isBillingSession(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.kind === "subscription" || session.metadata?.kind === "sale_pass";
}
