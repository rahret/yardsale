"use client";

import { useState } from "react";
import type { Order } from "@/lib/types";
import { MIN_CHARGE_CENTS, sellerNetCents, toCents } from "@/lib/fees";
import { money } from "@/lib/utils";

/** The seller's Buy Now orders, with "Picked up" and "Refund". */
export default function BuyNowCard({
  orders,
  onOrderUpdated,
  onItemsChanged,
}: {
  /** The sale's online orders, kept up to date by the sale page (live updates). */
  orders: Order[];
  /** An order was marked picked up or refunded here. */
  onOrderUpdated: (order: Order) => void;
  /** An order changed an item (refund puts it back on sale). */
  onItemsChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRefundId, setConfirmRefundId] = useState<string | null>(null);
  const [error, setError] = useState("");

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
    onOrderUpdated(data.order);
    if (action === "refund") onItemsChanged();
  }

  return (
    <div>
      {error && <div className="text-marker text-xs font-semibold mt-2">{error}</div>}

      <div>
        <div className="text-xs font-bold opacity-70 mb-1.5">💳 Buy Now (online orders)</div>
        {orders.length === 0 ? (
          <p className="text-sm opacity-60">No online orders yet.</p>
        ) : (
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
        )}
      </div>
    </div>
  );
}

/** What Buy Now and Holds are, the fees, and whether online payment is ready:
 * shown at the top of the Holds & Buy Now card. */
export function BuyNowIntro({ payoutsReady, serverReady = true }: { payoutsReady: boolean; serverReady?: boolean }) {
  const exampleCents = toCents(25);
  return (
    <div className="mb-4">
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
            {serverReady ? (
              <span className="text-grass-dark font-semibold">● Ready.</span>
            ) : (
              <span className="text-marker font-semibold">● Off on this site (see below).</span>
            )} Choose <strong>💳 Buy Now</strong> or{" "}
            <strong>✋ Hold</strong> for each item when you add or edit it. Buy Now items are paid online and picked
            up with a code; Hold items are reserved and paid in person.
          </div>
          <div className="text-[11px] opacity-60 mt-2">
            Card and service fees come out of each Buy Now sale: on a {money(25)} item you&apos;d receive about{" "}
            {money(sellerNetCents(exampleCents) / 100)}, and on a {money(5)} item about{" "}
            {money(sellerNetCents(toCents(5)) / 100)}. Bulk items and anything under {money(MIN_CHARGE_CENTS / 100)}{" "}
            can&apos;t use Buy Now. If a buyer doesn&apos;t show up, you can refund them below.
          </div>
        </>
      )}

    </div>
  );
}
