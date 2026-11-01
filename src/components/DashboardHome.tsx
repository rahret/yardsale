"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Sale } from "@/lib/types";
import { friendlyDbError, randomSuffix, slugify } from "@/lib/utils";
import type { AddressFields } from "@/lib/address";
import { type Access, TRIAL_LIMITS, UPGRADE_HREF } from "@/lib/billing";
import { LockedBadge, UpgradeNote } from "@/components/PlanOptions";

const STATUS_LABEL: Record<Sale["status"], { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-cardboard-dark/20 text-ink" },
  live: { label: "🟢 Live", cls: "bg-grass/20 text-grass-dark" },
  ended: { label: "Ended", cls: "bg-marker/15 text-marker" },
};

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
  const canCreate = access === "full" || (access === "trial" && sales.length < TRIAL_LIMITS.sales);

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

      <div className="grid gap-3 mb-6">
        {sales.map((sale) => {
          const st = STATUS_LABEL[sale.status];
          return (
            <a
              key={sale.id}
              href={`/dashboard/sales/${sale.id}`}
              className="bg-white border-2 border-cardboard-dark rounded-xl p-4 flex items-center justify-between shadow-tag hover:-translate-y-0.5 transition-transform"
            >
              <div>
                <div className="font-bold">{sale.name}</div>
                <div className="text-xs opacity-60 mt-0.5">/s/{sale.slug}</div>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${st.cls}`}>{st.label}</span>
            </a>
          );
        })}
      </div>

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
