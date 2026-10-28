import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { ownedOrder } from "@/lib/orderAuth";
import { refundOrder } from "@/lib/stripeEvents";

// Seller refunds a paid order (no-show, wrong item, changed mind). The money
// comes back out of their payout; the item goes back on sale.
export async function POST(_request: Request, { params }: { params: { orderId: string } }) {
  const order = await ownedOrder(params.orderId);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "paid" && order.status !== "picked_up") {
    return NextResponse.json({ error: "Only paid orders can be refunded" }, { status: 400 });
  }

  const stripe = getStripe();
  const admin = createAdminClient();
  if (!stripe || !admin) return NextResponse.json({ error: "Payments not configured" }, { status: 503 });

  try {
    await refundOrder(stripe, admin, order);
  } catch {
    return NextResponse.json({ error: "Stripe couldn't refund this payment — try again." }, { status: 502 });
  }

  // put the item back on sale and take the payment out of its revenue
  if (order.item_id) {
    const { data: item } = await admin.from("items").select("revenue, status").eq("id", order.item_id).maybeSingle();
    if (item && item.status === "sold") {
      await admin
        .from("items")
        .update({
          status: "available",
          sold_at: null,
          revenue: Math.max(0, Number(item.revenue) - order.amount_cents / 100),
        })
        .eq("id", order.item_id);
    }
  }
  const { data } = await admin.from("orders").select("*").eq("id", order.id).single();
  return NextResponse.json({ order: data });
}
