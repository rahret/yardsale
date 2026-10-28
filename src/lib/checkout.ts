import type Stripe from "stripe";
import type { Item, Sale } from "./types";

/** Stripe Checkout settings for buying one item. A destination charge: the
 * buyer pays the platform, Stripe sends the price minus the application fee
 * to the seller's connected account. */
export function checkoutSessionParams(o: {
  item: Pick<Item, "id" | "name">;
  sale: Pick<Sale, "id" | "name" | "slug">;
  orderId: string;
  amountCents: number;
  feeCents: number;
  code: string;
  destination: string;
  origin: string;
  photoUrl: string | null;
  now?: number;
}): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    // No payment_method_types: Checkout shows what's enabled in the Stripe
    // dashboard — cards (with Apple Pay / Google Pay) and Cash App Pay.
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: o.amountCents,
          product_data: {
            name: o.item.name,
            description: `${o.sale.name} — pick it up at the sale`,
            ...(o.photoUrl ? { images: [o.photoUrl] } : {}),
          },
        },
      },
    ],
    custom_fields: [{ key: "pickup_name", label: { type: "custom", custom: "Name for pickup" }, type: "text" }],
    payment_intent_data: {
      application_fee_amount: o.feeCents,
      transfer_data: { destination: o.destination },
      // appears on the buyer's Stripe receipt
      description: `${o.item.name} at ${o.sale.name} — pickup code ${o.code}`,
      metadata: { order_id: o.orderId },
    },
    client_reference_id: o.orderId,
    metadata: { order_id: o.orderId, sale_id: o.sale.id, item_id: o.item.id },
    expires_at: Math.floor((o.now ?? Date.now()) / 1000) + 30 * 60, // Stripe's minimum
    success_url: `${o.origin}/s/${o.sale.slug}/order?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${o.origin}/s/${o.sale.slug}?item=${o.item.id}`,
  };
}
