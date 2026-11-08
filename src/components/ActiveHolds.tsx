"use client";

import { useEffect, useState } from "react";
import type { Item, Sale } from "@/lib/types";
import { formatPhone, money, reservationDeadline } from "@/lib/utils";
import { holdTimeLeft } from "@/lib/liveUpdates";

/** Items buyers are holding right now: who, their phone, and how long the
 * hold has left, with Mark sold / Cancel hold. Updates live with the page. */
export default function ActiveHolds({
  items,
  sale,
  onMarkSold,
  onCancel,
  onExpired,
}: {
  items: Item[];
  sale: Pick<Sale, "default_reservation_minutes">;
  onMarkSold: (item: Item) => void;
  onCancel: (itemId: string) => void;
  /** A hold's time just ran out (so the page can refresh and release it). */
  onExpired: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const holds = items
    .filter((i) => i.status === "reserved")
    .map((i) => ({ item: i, deadline: reservationDeadline(i, sale as Sale) }))
    .sort((a, b) => a.deadline - b.deadline);

  // when a hold runs out, ask the page to refresh (the database releases it)
  const expiredCount = holds.filter((h) => h.deadline <= now).length;
  useEffect(() => {
    if (expiredCount > 0) onExpired();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiredCount]);

  return (
    <div>
      <div className="text-xs font-bold opacity-70 mb-1.5">✋ Active holds ({holds.length})</div>
      {holds.length === 0 ? (
        <p className="text-sm opacity-60">No one is holding anything right now.</p>
      ) : (
        <ul className="divide-y divide-chalk-dim border-2 border-cardboard-dark/40 rounded-lg">
          {holds.map(({ item, deadline }) => {
            const left = holdTimeLeft(deadline, now);
            const urgent = deadline - now < 5 * 60_000;
            return (
              <li key={item.id} className="px-3 py-2 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <div className="font-bold text-sm">
                    {item.name} <span className="font-normal opacity-60">· {money(item.price)}</span>
                  </div>
                  <div className="text-xs opacity-70">
                    {item.item_holds ? (
                      <>
                        {item.item_holds.name} ·{" "}
                        <a href={`tel:${item.item_holds.phone}`} className="underline">
                          {formatPhone(item.item_holds.phone)}
                        </a>{" "}
                        ·{" "}
                      </>
                    ) : null}
                    <span className={urgent ? "text-marker font-bold" : ""}>{left}</span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onMarkSold(item)}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-ink text-chalk"
                  >
                    Mark sold
                  </button>
                  <button
                    type="button"
                    onClick={() => onCancel(item.id)}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-cardboard-dark bg-white"
                  >
                    Cancel hold
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
