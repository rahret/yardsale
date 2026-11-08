"use client";

import { useEffect, useRef, useState } from "react";
import type { Sale } from "@/lib/types";

const STATUS_LABEL: Record<Sale["status"], { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-cardboard-dark/20 text-ink" },
  live: { label: "🟢 Live", cls: "bg-grass/20 text-grass-dark" },
  ended: { label: "Ended", cls: "bg-marker/15 text-marker" },
};
const ARCHIVED = { label: "🗄️ Archived", cls: "bg-cardboard-dark/20 text-ink opacity-80" };

/** One sale in the dashboard list: the card opens the sale, and a ⋯ menu
 * offers its public page, copying it, and archiving / unarchiving. */
export default function SaleListCard({
  sale,
  onArchive,
}: {
  sale: Pick<Sale, "id" | "name" | "slug" | "status" | "archived_at">;
  onArchive: (archived: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const st = sale.archived_at ? ARCHIVED : STATUS_LABEL[sale.status];
  const href = `/dashboard/sales/${sale.id}`;

  // close on a click outside or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "w-full text-left px-3 py-2 text-sm font-semibold hover:bg-chalk flex items-center gap-2";

  return (
    <div ref={wrapRef} className={`relative ${open ? "z-20" : ""}`}>
      <div
        className={`bg-white border-2 border-cardboard-dark rounded-xl shadow-tag flex items-center transition-transform hover:-translate-y-0.5 ${
          sale.archived_at ? "opacity-70" : ""
        }`}
      >
        <a href={href} className="flex-1 min-w-0 flex items-center justify-between gap-3 p-4 pr-2">
          <div className="min-w-0">
            <div className="font-bold break-words">{sale.name}</div>
            <div className="text-xs opacity-60 mt-0.5 truncate">/s/{sale.slug}</div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
        </a>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={`Options for ${sale.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`mr-3 w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-full border-2 flex items-center justify-center font-bold text-lg leading-none ${
            open ? "bg-ink text-chalk border-ink" : "border-cardboard-dark/50 bg-white"
          }`}
        >
          ⋯
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="absolute right-3 top-full -mt-2 w-64 max-w-[calc(100vw-2.5rem)] bg-white border-2 border-cardboard-dark rounded-lg shadow-tag py-1"
        >
          <a role="menuitem" href={href} className={item}>
            📝 Open sale
          </a>
          {sale.status !== "draft" && (
            <a role="menuitem" href={`/s/${sale.slug}`} target="_blank" rel="noopener" className={item}>
              🔗 View public page
            </a>
          )}
          <a role="menuitem" href={`${href}?copy=1#next-sale`} className={item}>
            📋 Copy to a new sale
          </a>
          <div className="border-t border-cardboard-dark/30 my-1" />
          {sale.archived_at ? (
            <button
              role="menuitem"
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                onArchive(false);
              }}
            >
              ↩️ Unarchive
            </button>
          ) : sale.status === "live" ? (
            <div className="px-3 py-2" role="menuitem" aria-disabled="true">
              <div className="text-sm font-semibold opacity-40 flex items-center gap-2">🗄️ Archive</div>
              <div className="text-[11px] opacity-60 mt-0.5">End the sale first — buyers may still be on their way.</div>
            </div>
          ) : (
            <button
              role="menuitem"
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                onArchive(true);
              }}
            >
              🗄️ Archive
            </button>
          )}
        </div>
      )}
    </div>
  );
}
