"use client";

import { useEffect, useState } from "react";
import type { Item, Sale, SaleDay } from "@/lib/types";
import { topCategories } from "@/lib/share";
import { PAYMENT_LABELS, featuredItems, openStatus, type OpenStatus } from "@/lib/saleInfo";
import { money } from "@/lib/utils";
import { photoUrl } from "@/components/PhotoUploader";

/** The top of the buyer page: is it open, the seller's note, what's there,
 * highlights, practical details, and "add to calendar" — everything a buyer
 * needs to decide whether the trip is worth it, before the full item list. */
export default function SaleSummary({
  sale,
  items,
  days,
  onOpenItem,
}: {
  sale: Sale;
  items: Item[];
  days: SaleDay[];
  onOpenItem: (id: string) => void;
}) {
  // Time-dependent, so computed after mount (and every minute) rather than
  // during server rendering, which would mismatch the browser's clock.
  const [status, setStatus] = useState<OpenStatus | null>(null);
  useEffect(() => {
    const buyerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const update = () => setStatus(openStatus(sale, days, new Date(), buyerTz));
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [sale, days]);

  const available = items.filter((i) => i.status === "available" || i.status === "low_stock").length;
  const cats = topCategories(items, 5);
  const highlights = featuredItems(items);
  const details = [
    { label: "Early birds", value: sale.early_birds },
    { label: "Parking", value: sale.parking },
    { label: "If it rains", value: sale.rain_plan },
  ].filter((d) => d.value?.trim());
  const ended = sale.status === "ended" || status?.state === "ended";

  const statusStyle =
    status?.state === "open"
      ? "text-grass-dark bg-grass/15 border-grass/40"
      : status?.state === "ended"
        ? "text-marker bg-marker/10 border-marker/30"
        : "text-amber bg-sun/20 border-sun";

  return (
    <div className="px-5 pb-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {status && (
          <div className={`text-xs font-bold border rounded-full px-3 py-1 ${statusStyle}`}>
            {status.state === "open" ? "🟢 " : status.state === "later" ? "🕗 " : ""}
            {status.label}
          </div>
        )}
        {!ended && (
          <div className="text-xs font-bold text-ink/80 bg-white border border-cardboard-dark/50 rounded-full px-3 py-1">
            {available} item{available === 1 ? "" : "s"} available
          </div>
        )}
        {!ended && days.length > 0 && (
          <a
            href={`/s/${sale.slug}/calendar`}
            className="text-xs font-bold text-grass-dark bg-white border border-grass/50 rounded-full px-3 py-1"
          >
            📅 Add to calendar
          </a>
        )}
      </div>

      {sale.note?.trim() && (
        <div className="bg-sun/25 border-2 border-sun rounded-lg px-3.5 py-2.5 text-sm font-semibold -rotate-[0.4deg]">
          📣 {sale.note}
        </div>
      )}

      {cats.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide font-bold opacity-55 mb-1">What&apos;s here</div>
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => (
              <span key={c} className="text-xs font-semibold bg-chalk-dim border border-cardboard-dark/40 rounded-full px-2.5 py-0.5">
                {c}
              </span>
            ))}
            {topCategories(items, Infinity).length > cats.length && (
              <span className="text-xs opacity-60 px-1 py-0.5">& more</span>
            )}
          </div>
        </div>
      )}

      {highlights.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide font-bold opacity-55 mb-1">Highlights</div>
          <div className="grid grid-cols-3 gap-2">
            {highlights.map((item) => {
              const photo = [...(item.item_photos || [])].sort((a, b) => a.position - b.position)[0];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenItem(item.id)}
                  className="text-left bg-white border-2 border-cardboard-dark rounded-lg overflow-hidden"
                >
                  <div className="aspect-square bg-chalk-dim flex items-center justify-center">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photoUrl(photo.storage_path)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl">{item.icon}</span>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="text-xs font-bold leading-tight truncate">{item.name}</div>
                    <div className="font-marker text-marker text-base leading-tight">{money(item.price)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(sale.accepted_payments?.length > 0 || details.length > 0) && (
        <div className="bg-white border-2 border-cardboard-dark/60 rounded-lg px-3.5 py-2.5 text-sm space-y-1.5">
          {sale.accepted_payments?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold opacity-60 mr-0.5">Pay with</span>
              {sale.accepted_payments.map((m) => (
                <span
                  key={m}
                  className="text-xs font-semibold bg-chalk border border-cardboard-dark/40 rounded-full px-2 py-0.5"
                >
                  {PAYMENT_LABELS[m]?.icon} {PAYMENT_LABELS[m]?.label ?? m}
                </span>
              ))}
            </div>
          )}
          {details.map((d) => (
            <div key={d.label}>
              <span className="text-xs font-bold opacity-60">{d.label}: </span>
              {d.value}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
