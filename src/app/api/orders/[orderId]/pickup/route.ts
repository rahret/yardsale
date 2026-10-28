import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownedOrder } from "@/lib/orderAuth";

// Seller marks a paid order as picked up (after checking the pickup code).
export async function POST(_request: Request, { params }: { params: { orderId: string } }) {
  const order = await ownedOrder(params.orderId);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "paid") return NextResponse.json({ error: "Only paid orders can be picked up" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Payments not configured" }, { status: 503 });
  const { data, error } = await admin
    .from("orders")
    .update({ status: "picked_up", picked_up_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "paid")
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: "Couldn't update the order" }, { status: 500 });
  return NextResponse.json({ order: data });
}
