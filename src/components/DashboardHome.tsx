"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Sale } from "@/lib/types";
import { friendlyDbError, randomSuffix, slugify } from "@/lib/utils";
import type { AddressFields } from "@/lib/address";
import { type Access, TRIAL_LIMITS, UPGRADE_HREF } from "@/lib/billing";
import { LockedBadge, UpgradeNote } from "@/components/PlanOptions";
import SaleListCard from "@/components/SaleListCard";

export default function DashboardHome({
  initialSales,
  displayName,
  access,
  profileAddress,
}: {
  initialSales: Sale[];
  displayName?: string;
  access: Access;
  /** The address on the seller's Account page: new sales start with it. */
  profileAddress?: AddressFields | null;
}) {
  const router = useRouter();
  const [sales, setSales] = useState<Sale[]>(initialSales);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [toast, setToast] = useState<{ sale: Sale; archived: boolean } | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const active = sales.filter((s) => !s.archived_at);
  const archived = sales.filter((s) => s.archived_at);
  const canCreate = access === "full" || (access === "trial" && sales.length < TRIAL_LIMITS.sales);

  // the "Archived … Undo" message goes away on its own
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  async function setArchived(sale: Sale, archived: boolean, undo = false) {
    setArchiveError("");
    const { data, error } = await createClient()
      .from("sales")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", sale.id)
      .select()
      .single();
    if (error || !data) {
      setArchiveError(friendlyDbError(error?.message));
      return;
    }
    setSales((prev) => prev.map((s) => (s.id === sale.id ? data : s)));
    setToast(undo ? null : { sale: data, archived });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const slug = `${slugify(name) || "sale"}-${randomSuffix(4)}`;
    const { data, error } = await supabase
      .from("sales")
      .insert({ owner_id: user.id, slug, name: name.trim(), ...(profileAddress?.street ? profileAddress : {}) })
      .select()
      .single();

    setLoading(false);
    if (error) {
      setError(friendlyDbError(error.message));
      return;
    }
    // place the Account-page address on the map; the sale page re-checks it on save
    if (profileAddress?.street) fetch(`/api/sales/${data.id}/geocode`, { method: "POST" }).catch(() => {});
    router.push(`/dashboard/sales/${data.id}`);
  }

  return (
    <div className="p-5">
      <div className="mb-6">
        <div className="text-sm opacity-60">
          {displayName ? `Welcome back, ${displayName}` : "Welcome back"}
        </div>
        <div className="text-xl font-bold mt-1">Your garage sales</div>
      </div>

      {sales.length === 0 && !creating && (
        <div className="bg-white border-2 border-cardboard-dark rounded-xl p-6 text-center shadow-tag mb-6">
          <div className="text-4xl mb-1">🏷️</div>
          <span className="font-marker text-2xl text-marker block mb-1">Let&apos;s set up your first sale</span>
          <p className="text-sm opacity-75 mb-4">
            Three quick steps — name, address and dates — then add items, print your QR sign and share it.
          </p>
          <a href="/dashboard/welcome" className="inline-block bg-grass text-white font-bold px-6 py-3 rounded-lg shadow-tag">
            Start setup — about 2 minutes
          </a>
        </div>
      )}

      {access === "none" && sales.length > 0 && (
        <div className="mb-4">
          <UpgradeNote>
            You don&apos;t have a plan right now. Your sales stay up, but you can&apos;t add sales or items, and
            Holds, Buy Now and Find yard sales are off.
          </UpgradeNote>
        </div>
      )}

      {sales.length > 0 && active.length === 0 && (
        <p className="text-sm opacity-70 mb-4">All your sales are archived.</p>
      )}

      <div className="grid gap-3 mb-6">
        {[...active, ...(showArchived ? archived : [])].map((sale) => (
          <SaleListCard key={sale.id} sale={sale} onArchive={(on) => setArchived(sale, on)} />
        ))}
      </div>

      {archived.length > 0 && (
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          aria-expanded={showArchived}
          className="block text-xs font-bold underline opacity-70 -mt-3 mb-6"
        >
          {showArchived ? "Hide archived sales" : `Show archived sales (${archived.length})`}
        </button>
      )}

      {archiveError && <p className="text-marker text-sm font-semibold -mt-3 mb-4">{archiveError}</p>}

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md bg-ink text-chalk text-sm rounded-lg px-4 py-3 shadow-tag flex items-center gap-4"
        >
          <span className="flex-1 min-w-0 break-words">
            {toast.archived ? "🗄️ Archived" : "↩️ Unarchived"} &ldquo;{toast.sale.name}&rdquo;
          </span>
          <button
            type="button"
            onClick={() => setArchived(toast.sale, !toast.archived, true)}
            className="font-bold underline shrink-0"
          >
            Undo
          </button>
        </div>
      )}

      {creating ? (
        <form onSubmit={handleCreate} className="bg-white border-2 border-cardboard-dark rounded-xl p-4 space-y-3">
          <label className="block text-xs font-bold opacity-70">Sale name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="The Big Driveway Sale"
            className="w-full px-3 py-2.5 border-2 border-cardboard-dark rounded-lg"
          />
          {error && <div className="text-marker text-sm font-semibold">{error}</div>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-grass text-white font-bold px-5 py-2.5 rounded-lg shadow-tag disabled:opacity-60"
            >
              {loading ? "Creating…" : "Create sale"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="border-2 border-cardboard-dark px-5 py-2.5 rounded-lg font-semibold"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : canCreate ? (
        <button
          onClick={() => setCreating(true)}
          className="bg-ink text-chalk font-bold px-5 py-3 rounded-lg shadow-tag"
        >
          + Create new sale
        </button>
      ) : sales.length > 0 ? (
        <div>
          <div className="flex items-center gap-2">
            <button
              disabled
              className="bg-ink text-chalk font-bold px-5 py-3 rounded-lg shadow-tag opacity-40 cursor-not-allowed"
            >
              + Create new sale
            </button>
            <LockedBadge />
          </div>
          <p className="text-xs opacity-70 mt-2">
            {access === "trial"
              ? `Your free trial includes ${TRIAL_LIMITS.sales} sale. `
              : "Choose a plan to create more sales. "}
            <a href={UPGRADE_HREF} className="font-bold underline">
              See plans
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
