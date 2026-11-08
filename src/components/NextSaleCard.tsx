"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Item, Sale } from "@/lib/types";
import { friendlyDbError, randomSuffix, slugify } from "@/lib/utils";
import { type Access } from "@/lib/billing";
import { defaultMoveTarget, nextSaleCounts, type CopyItems } from "@/lib/nextSale";
import { LockedBadge, UpgradeNote } from "@/components/PlanOptions";

export type OtherSale = Pick<Sale, "id" | "name" | "status" | "created_at">;

/** Start the next sale from this one: copy it (details and items) into a new
 * draft, or move its unsold items into another of the seller's sales. */
export default function NextSaleCard({
  sale,
  items,
  otherSales,
  access,
  onItemsMoved,
}: {
  sale: Pick<Sale, "id" | "name">;
  items: Pick<Item, "status" | "quantity_available">[];
  otherSales: OtherSale[];
  access: Access;
  onItemsMoved: () => void;
}) {
  const router = useRouter();
  const counts = nextSaleCounts(items);
  const [open, setOpen] = useState<"copy" | "move" | null>(null);
  const [name, setName] = useState(sale.name);
  const [copyItems, setCopyItems] = useState<CopyItems>(counts.unsold ? "unsold" : "none");
  const [target, setTarget] = useState(() => defaultMoveTarget(otherSales));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [moved, setMoved] = useState<{ count: number; saleId: string } | null>(null);
  // the trial includes one sale, and a lapsed plan can't add sales or items
  const canCopy = access === "full";
  const canMove = access !== "none" && otherSales.length > 0;

  // "Copy to a new sale" from the dashboard's sale menu lands here with ?copy=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("copy") !== "1") return;
    setOpen("copy");
    params.delete("copy");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    requestAnimationFrame(() => document.getElementById("next-sale")?.scrollIntoView({ block: "start" }));
  }, []);

  function toggle(panel: "copy" | "move") {
    setOpen((o) => (o === panel ? null : panel));
    setError("");
    setMoved(null);
  }

  async function copy() {
    setBusy(true);
    setError("");
    const newName = name.trim() || sale.name;
    const { data, error } = await createClient().rpc("copy_sale", {
      p_sale_id: sale.id,
      p_name: newName,
      p_slug: `${slugify(newName) || "sale"}-${randomSuffix(4)}`,
      p_items: copyItems,
    });
    if (error || !data) {
      setBusy(false);
      setError(friendlyDbError(error?.message));
      return;
    }
    // the map position comes with the address, so there's nothing to look up
    router.push(`/dashboard/sales/${data}`);
  }

  async function move() {
    if (!target) return;
    setBusy(true);
    setError("");
    const { data, error } = await createClient().rpc("move_unsold_items", { p_from: sale.id, p_to: target });
    setBusy(false);
    if (error) return setError(friendlyDbError(error.message));
    setMoved({ count: Number(data) || 0, saleId: target });
    onItemsMoved();
  }

  const targetName = otherSales.find((s) => s.id === (moved?.saleId ?? target))?.name ?? "the other sale";

  return (
    <div>
      <p className="text-xs opacity-70 mb-3">
        Holding another sale? Start it from this one instead of from scratch.
      </p>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => toggle("copy")}
          aria-expanded={open === "copy"}
          className={`font-bold px-4 py-2 rounded-lg text-sm border-2 ${
            open === "copy" ? "bg-ink text-chalk border-ink" : "border-cardboard-dark bg-white"
          }`}
        >
          📋 Copy to a new sale
        </button>
        <button
          type="button"
          onClick={() => toggle("move")}
          aria-expanded={open === "move"}
          className={`font-bold px-4 py-2 rounded-lg text-sm border-2 ${
            open === "move" ? "bg-ink text-chalk border-ink" : "border-cardboard-dark bg-white"
          }`}
        >
          📦 Move unsold items
        </button>
      </div>

      {open === "copy" && (
        <div className="mt-3 border-2 border-cardboard-dark/50 rounded-lg p-3 space-y-3">
          {!canCopy ? (
            <UpgradeNote>
              {access === "trial"
                ? "Your free trial includes one sale. Upgrade to copy this one into a new sale."
                : "Choose a plan to start a new sale."}
            </UpgradeNote>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold opacity-70 mb-1" htmlFor="copy-name">
                  New sale&apos;s name
                </label>
                <input
                  id="copy-name"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg text-sm"
                />
              </div>
              <fieldset>
                <legend className="text-xs font-bold opacity-70 mb-1">Items</legend>
                <div className="space-y-1 text-sm">
                  <Radio checked={copyItems === "unsold"} onChange={() => setCopyItems("unsold")} disabled={!counts.unsold}>
                    Unsold items ({counts.unsold})
                  </Radio>
                  <Radio checked={copyItems === "all"} onChange={() => setCopyItems("all")} disabled={!counts.all}>
                    All items, including sold ones ({counts.all})
                  </Radio>
                  <Radio checked={copyItems === "none"} onChange={() => setCopyItems("none")}>
                    No items — just the sale details
                  </Radio>
                </div>
              </fieldset>
              <p className="text-[11px] opacity-60">
                Copies the address, tagline and payment methods. The new sale starts as a draft with no dates, so you
                pick new ones. Copied items start available at their list price, with their photos. This sale stays as
                it is.
              </p>
              <button
                type="button"
                onClick={copy}
                disabled={busy}
                className="bg-grass text-white font-bold px-4 py-2 rounded-lg text-sm shadow-tag disabled:opacity-50"
              >
                {busy ? "Copying…" : "Copy sale"}
              </button>
            </>
          )}
        </div>
      )}

      {open === "move" && (
        <div className="mt-3 border-2 border-cardboard-dark/50 rounded-lg p-3 space-y-3">
          {access === "none" ? (
            <UpgradeNote>Choose a plan to add items to a sale.</UpgradeNote>
          ) : otherSales.length === 0 ? (
            <p className="text-sm">
              You don&apos;t have another sale yet. Use <strong>Copy to a new sale</strong> with &ldquo;Unsold
              items&rdquo; instead
              {access === "trial" ? (
                <>
                  {" "}
                  <LockedBadge className="align-middle" />
                </>
              ) : null}
              .
            </p>
          ) : moved ? (
            <p className="text-sm">
              ✅ Moved {moved.count} item{moved.count === 1 ? "" : "s"} to{" "}
              <a href={`/dashboard/sales/${moved.saleId}`} className="font-bold underline">
                {targetName}
              </a>
              .
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold opacity-70 mb-1" htmlFor="move-target">
                  Move to
                </label>
                <select
                  id="move-target"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg text-sm bg-white"
                >
                  {otherSales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.status === "ended" ? " (ended)" : s.status === "draft" ? " (draft)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] opacity-60">
                Moves {counts.movable} unsold item{counts.movable === 1 ? "" : "s"}, with their photos, out of this
                sale.
                {counts.onHold ? ` ${counts.onHold} on hold stay${counts.onHold === 1 ? "s" : ""} here for the buyer.` : ""}{" "}
                A bulk lot that partly sold moves what&apos;s left; what sold stays in this sale&apos;s totals.
              </p>
              <button
                type="button"
                onClick={move}
                disabled={busy || !counts.movable || !canMove}
                className="bg-grass text-white font-bold px-4 py-2 rounded-lg text-sm shadow-tag disabled:opacity-50"
              >
                {busy ? "Moving…" : `Move ${counts.movable} item${counts.movable === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-marker font-semibold mt-2">{error}</p>}
    </div>
  );
}

function Radio({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? "opacity-40" : ""}`}>
      <input type="radio" checked={checked} onChange={onChange} disabled={disabled} />
      {children}
    </label>
  );
}
