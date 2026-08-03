"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Sale } from "@/lib/types";
import { randomSuffix, slugify } from "@/lib/utils";

const STATUS_LABEL: Record<Sale["status"], { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-cardboard-dark/20 text-ink" },
  live: { label: "🟢 Live", cls: "bg-grass/20 text-grass-dark" },
  ended: { label: "Ended", cls: "bg-marker/15 text-marker" },
};

export default function DashboardHome({
  initialSales,
  displayName,
}: {
  initialSales: Sale[];
  displayName?: string;
}) {
  const router = useRouter();
  const [sales, setSales] = useState<Sale[]>(initialSales);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      .insert({ owner_id: user.id, slug, name: name.trim() })
      .select()
      .single();

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
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
        <div className="border-2 border-dashed border-cardboard-dark rounded-xl p-8 text-center opacity-75 mb-6">
          <span className="font-marker text-xl text-marker block mb-2">no sales yet!</span>
          Create your first garage sale to get a shareable link and QR code.
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
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="bg-ink text-chalk font-bold px-5 py-3 rounded-lg shadow-tag"
        >
          + Create new sale
        </button>
      )}
    </div>
  );
}
