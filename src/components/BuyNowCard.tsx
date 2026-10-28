"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Order, Sale } from "@/lib/types";
import { MIN_CHARGE_CENTS, sellerNetCents, toCents } from "@/lib/fees";
import { money } from "@/lib/utils";

const ORDER_STATUSES = ["paid", "picked_up", "refunded", "conflict"];

/** Seller-side Buy Now: setup status, what fees mean, and the list of online
 * orders with "Picked up" and "Refund". (Each item chooses Buy Now or Hold.) */
export default function BuyNowCard({
  sale,
  payoutsReady,
  hasBuyNowItems,
  initialOrders,
  onItemsChanged,
}: {
  sale: Pick<Sale, "id">;
  payoutsReady: boolean;
  /** Any item on this sale is set to Buy Now (so orders may arrive). */
  hasBuyNowItems: boolean;
  initialOrders: Order[];
  /** An order changed an item (refund puts it back on sale). */
  onItemsChanged: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRefundId, setConfirmRefundId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // new online orders arrive while the seller has this page open
  useEffect(() => {
    if (!hasBuyNowItems && orders.length === 0) return;
    const supabase = createClient();
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("sale_id", sale.id)
        .in("status", ORDER_STATUSES)
        .order("created_at", { ascending: false });
      if (data) setOrders(data as Order[]);
    };
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [sale.id, hasBuyNowItems, orders.length]);

  async function act(order: Order, action: "pickup" | "refund") {
    setBusyId(order.id);
    setError("");
    const res = await fetch(`/api/orders/${order.id}/${action}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    setConfirmRefundId(null);
    if (!res.ok || !data.order) {
      setError(data.error || "Something went wrong — try again.");
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === order.id ? data.order : o)));
    if (action === "refund") onItemsChanged();
  }

  const exampleCents = toCents(25);

  return (
    <div>
      {!payoutsReady ? (
        <div className="text-sm">
          Let buyers pay online with card, Apple Pay, Google Pay or Cash App Pay — the item is theirs right away and
          you&apos;re paid even if they&apos;re late.{" "}
          <a href="/dashboard/account" className="text-grass-dark font-semibold underline">
            Set up payouts on your Account page
          </a>{" "}
          first.
        </div>
      ) : (
        <>
          <div className="text-sm">
            <span className="text-grass-dark font-semibold">● Ready.</span> Choose <strong>💳 Buy Now</strong> or{" "}
            <strong>✋ Hold</strong> for each item when you add or edit it. Buy Now items are paid online and picked
            up with a code; Hold items are reserved and paid in person.
          </div>
          <div className="text-[11px] opacity-60 mt-2">
            Card fees come out of each Buy Now sale: on a {money(25)} item you&apos;d receive about{" "}
            {money(sellerNetCents(exampleCents) / 100)}, and on a {money(2)} item about{" "}
            {money(sellerNetCents(toCents(2)) / 100)}. Bulk items and anything under {money(MIN_CHARGE_CENTS / 100)}{" "}
            (Stripe&apos;s minimum) can only be held. If a buyer doesn&apos;t show up, you can refund them below.
          </div>
        </>
      )}

      {error && <div className="text-marker text-xs font-semibold mt-2">{error}</div>}

      {orders.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-bold opacity-70 mb-1.5">Online orders</div>
          <div className="divide-y divide-chalk-dim">
            {orders.map((o) => (
              <div key={o.id} className="py-2 flex items-center gap-2 flex-wrap text-sm">
                <div className="flex-1 min-w-[180px]">
                  <div className="font-bold">
                    {o.item_name} · {money(o.amount_cents / 100)}
                  </div>
                  <div className="text-xs opacity-70">
                    {o.buyer_name || "Buyer"}
                    {o.buyer_email ? ` · ${o.buyer_email}` : ""} · code{" "}
                    <span className="font-mono font-bold">{o.pickup_code}</span>
                  </div>
                </div>
                <span
                  className={`text-xs font-bold ${
                    o.status === "paid" ? "text-amber" : o.status === "picked_up" ? "text-grass-dark" : "text-marker"
                  }`}
                >
                  {o.status === "paid"
                    ? "Paid — awaiting pickup"
                    : o.status === "picked_up"
                      ? "Picked up"
                      : o.status === "refunded"
                        ? "Refunded"
                        : "Refunding…"}
                </span>
                {o.status === "paid" && (
                  <button
                    onClick={() => act(o, "pickup")}
                    disabled={busyId === o.id}
                    className="bg-grass text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    Picked up
                  </button>
                )}
                {(o.status === "paid" || o.status === "picked_up") &&
                  (confirmRefundId === o.id ? (
                    <button
                      onClick={() => act(o, "refund")}
                      disabled={busyId === o.id}
                      className="bg-marker text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      {busyId === o.id ? "Refunding…" : `Refund ${money(o.amount_cents / 100)}?`}
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmRefundId(o.id)}
                      className="border-2 border-cardboard-dark bg-white text-xs font-bold px-3 py-1.5 rounded-lg"
                    >
                      Refund
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
