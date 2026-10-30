import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { handleStripeEvent } from "@/lib/stripeEvents";

// Stripe → app notifications (payments completed, checkouts expired, seller
// account status). Every request is verified with STRIPE_WEBHOOK_SECRET.
// Subscribe the endpoint to: checkout.session.completed,
// checkout.session.async_payment_succeeded, checkout.session.async_payment_failed,
// checkout.session.expired, customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted, and (for
// connected accounts) account.updated.
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const admin = createAdminClient();
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    (s): s is string => !!s
  );
  if (!stripe || !admin || secrets.length === 0) {
    return NextResponse.json({ error: "Payments not configured" }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  let event = null;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret);
      break;
    } catch {
      // try the next secret (platform vs. connected-account endpoint)
    }
  }
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  try {
    const outcome = await handleStripeEvent(event, stripe, admin);
    return NextResponse.json({ received: true, outcome });
  } catch (e) {
    // a 500 makes Stripe retry later
    console.error("Stripe webhook failed", event.type, e);
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
