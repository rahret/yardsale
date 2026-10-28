import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { requestOrigin } from "@/lib/saleData";
import { applicationFeeCents, canBuyOnline, pickupCode, toCents } from "@/lib/fees";
import { publicPhotoUrl } from "@/lib/share";
import { checkoutSessionParams } from "@/lib/checkout";
import { isEffectivelyExpired } from "@/lib/utils";
import type { Item, Sale } from "@/lib/types";

// "Buy Now": starts a Stripe Checkout for one item. Payment goes to the
// seller's connected Stripe account (minus the application fee); the webhook
// marks the item sold once paid. The item isn't locked while the buyer is on
// the checkout page — if two people pay for it, the second is refunded
// automatically (see complete_order / the webhook).
export async function POST(request: NextRequest) {
  const unavailable = (error: string, status = 400) => NextResponse.json({ error }, { status });

  const stripe = getStripe();
  const admin = createAdminClient();
  if (!stripe || !admin) return unavailable("Online payment isn't available right now.", 503);

  const body = await request.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId : null;
  if (!itemId) return unavailable("Missing item.");

  const { data: item } = await admin
    .from("items")
    .select("*, item_photos(*), sales!inner(*)")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return unavailable("This item no longer exists.", 404);
  const sale = item.sales as Sale;

  if (sale.status !== "live") return unavailable("This sale isn't open for purchases.");
  if (!sale.buy_now_enabled) return unavailable("This seller isn't taking online payments.");
  if (!canBuyOnline(item)) return unavailable("This item can't be bought online — hold it and pay in person.");
  if (item.status === "sold") return unavailable("Sorry, this item has already sold.");
  if (item.status === "reserved" && !isEffectivelyExpired(item as Item, sale)) {
    return unavailable("Someone is holding this item right now.");
  }

  const { data: billing } = await admin
    .from("account_billing")
    .select("stripe_connect_account_id, connect_charges_enabled")
    .eq("user_id", sale.owner_id)
    .maybeSingle();
  if (!billing?.stripe_connect_account_id || !billing.connect_charges_enabled) {
    return unavailable("This seller isn't set up to take online payments yet.");
  }

  const amount = toCents(item.price);
  const fee = applicationFeeCents(amount);
  const code = pickupCode();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      sale_id: sale.id,
      item_id: item.id,
      item_name: item.name,
      amount_cents: amount,
      fee_cents: fee,
      pickup_code: code,
    })
    .select()
    .single();
  if (orderError || !order) return unavailable("Couldn't start checkout — try again.", 500);

  const origin = requestOrigin();
  const photo = [...(item.item_photos || [])].sort((a, b) => a.position - b.position)[0];
  try {
    const session = await stripe.checkout.sessions.create(
      checkoutSessionParams({
        item,
        sale,
        orderId: order.id,
        amountCents: amount,
        feeCents: fee,
        code,
        destination: billing.stripe_connect_account_id,
        origin,
        photoUrl: photo && origin.startsWith("https") ? publicPhotoUrl(photo.storage_path) : null,
      })
    );
    await admin.from("orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
    return NextResponse.json({ url: session.url });
  } catch {
    await admin.from("orders").update({ status: "expired" }).eq("id", order.id);
    return unavailable("Couldn't start checkout — try again.", 502);
  }
}
