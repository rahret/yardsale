"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Item, Sale, SaleDay } from "@/lib/types";
import { categoriesOf, fmtMMSS, formatSaleDay, mapsUrl, money, reservationDeadline, sortSaleDays } from "@/lib/utils";
import { photoUrl } from "@/components/PhotoUploader";

type SortKey = "newest" | "price-asc" | "price-desc" | "name";

export default function ShopView({
  sale,
  initialItems,
  saleDays,
}: {
  sale: Sale;
  initialItems: Item[];
  saleDays: SaleDay[];
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [filterCats, setFilterCats] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("newest");
  const [showSold, setShowSold] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  const supabase = useMemo(() => createClient(), []);

  // refetch items + sweep expired reservations every few seconds
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      await supabase.rpc("sweep_expired_reservations", { p_sale_id: sale.id });
      const { data } = await supabase
        .from("items")
        .select("*, item_photos(*)")
        .eq("sale_id", sale.id)
        .order("created_at", { ascending: false });
      if (!cancelled && data) setItems(data as Item[]);
    }
    const poll = setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [sale.id, supabase]);

  // 1s tick so countdowns move without a full refetch
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const categories = useMemo(() => categoriesOf(items), [items]);

  const visible = useMemo(() => {
    let arr = items.slice();
    if (filterCats.length > 0) arr = arr.filter((i) => filterCats.includes(i.category));
    if (!showSold) arr = arr.filter((i) => i.status !== "sold");
    if (sort === "price-asc") arr.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") arr.sort((a, b) => b.price - a.price);
    else if (sort === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
    else arr.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    return arr;
  }, [items, filterCats, showSold, sort]);

  const selected = items.find((i) => i.id === selectedId) || null;
  const availableCount = items.filter((i) => i.status === "available").length;
  const sortedDays = useMemo(() => sortSaleDays(saleDays), [saleDays]);

  function updateItem(next: Item) {
    setItems((prev) => prev.map((i) => (i.id === next.id ? next : i)));
  }

  if (sale.status === "draft") {
    return (
      <EmptyScreen title="Sale not published yet" body="The seller is still setting this one up — check back soon." />
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-10">
      <div className="px-5 pt-6 pb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-marker text-3xl text-marker -rotate-1 break-words">{sale.name}</div>
          <div className="text-sm opacity-65 mt-1.5 break-words">{sale.tagline}</div>
          {sale.address && (
            <a
              href={mapsUrl(sale.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm font-semibold text-grass-dark mt-1.5 underline underline-offset-2"
            >
              📍 {sale.address}
            </a>
          )}
          {sortedDays.length > 0 && (
            <div className="text-xs opacity-70 mt-1 font-semibold space-y-0.5">
              {sortedDays.map((day) => (
                <div key={day.id}>🗓️ {formatSaleDay(day)}</div>
              ))}
            </div>
          )}
          {sale.status === "live" ? (
            <div className="inline-block mt-2 text-xs font-bold text-grass-dark bg-grass/15 border border-grass/40 rounded-full px-3 py-1">
              🟢 {availableCount} item{availableCount === 1 ? "" : "s"} available
            </div>
          ) : (
            <div className="inline-block mt-2 text-xs font-bold text-marker bg-marker/10 border border-marker/30 rounded-full px-3 py-1">
              This sale has ended
            </div>
          )}
        </div>
      </div>

      <div className="px-5 pb-4 flex flex-wrap items-center gap-2">
        <div className="flex-1">
          <CategoryFilter categories={categories} selected={filterCats} onChange={setFilterCats} />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="border-2 border-cardboard-dark bg-white rounded-full px-3 py-1.5 text-xs font-bold"
        >
          <option value="newest">Newest</option>
          <option value="price-asc">Price: low→high</option>
          <option value="price-desc">Price: high→low</option>
          <option value="name">Name A→Z</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs opacity-75">
          <input type="checkbox" checked={showSold} onChange={(e) => setShowSold(e.target.checked)} />
          show sold
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="mx-5 my-10 text-center border-2 border-dashed border-cardboard-dark rounded-xl p-10 opacity-75">
          <span className="font-marker text-xl text-marker block mb-2">nothing here yet!</span>
          {items.length === 0 ? "Once the seller adds items, they'll show up here." : "Try a different filter."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 px-5">
          {visible.map((item, idx) => (
            <Tag key={item.id} item={item} idx={idx} onClick={() => setSelectedId(item.id)} />
          ))}
        </div>
      )}

      {selected && (
        <DetailSheet
          item={selected}
          sale={sale}
          onClose={() => setSelectedId(null)}
          onReserved={updateItem}
        />
      )}
    </div>
  );
}

function EmptyScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 text-center">
      <div>
        <div className="font-marker text-3xl text-marker mb-2">{title}</div>
        <p className="opacity-70 text-sm">{body}</p>
      </div>
    </div>
  );
}

function CategoryFilter({
  categories,
  selected,
  onChange,
}: {
  categories: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  function toggle(c: string) {
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  }

  const label =
    selected.length === 0 ? "All categories" : selected.length === 1 ? selected[0] : `${selected.length} categories`;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border-2 ${
          selected.length > 0 ? "bg-ink border-ink text-chalk" : "border-cardboard-dark bg-chalk opacity-70"
        }`}
      >
        {label}
        <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 top-full left-0 mt-1.5 bg-white border-2 border-cardboard-dark rounded-lg shadow-tag p-2 min-w-[190px] max-h-64 overflow-y-auto">
          {categories.length === 0 ? (
            <div className="text-xs opacity-60 px-2 py-1">No categories yet.</div>
          ) : (
            categories.map((c) => (
              <label
                key={c}
                className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-chalk cursor-pointer"
              >
                <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)} />
                {c}
              </label>
            ))
          )}
          <div className="border-t border-chalk-dim mt-1 pt-1">
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selected.length === 0}
              className="w-full text-left px-2 py-1.5 text-xs font-bold opacity-70 disabled:opacity-30"
            >
              Clear filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Tag({ item, idx, onClick }: { item: Item; idx: number; onClick: () => void }) {
  const rot = ((idx % 5) - 2) * 0.6;
  const photo = item.item_photos?.[0];
  return (
    <div
      onClick={onClick}
      style={{ transform: `rotate(${rot}deg)` }}
      className={`relative bg-cardboard rounded-tr-[10px] rounded-br-[10px] rounded-bl-[10px] shadow-tag overflow-hidden flex flex-col cursor-pointer ${
        item.status === "sold" ? "grayscale-[0.55] opacity-75" : ""
      }`}
    >
      <div className="absolute top-2.5 left-2.5 w-2.5 h-2.5 rounded-full border-2 border-ink/35 bg-chalk z-10" />

      <div className="p-2.5 pb-0 flex-shrink-0">
        <div className="relative w-full h-36 rounded-lg border-2 border-cardboard-dark bg-chalk-dim overflow-hidden flex items-center justify-center">
          {photo ? (
            <img src={photoUrl(photo.storage_path)} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="text-5xl">{item.icon}</div>
          )}
          {item.status === "sold" && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] border-[3px] border-marker text-marker font-marker text-lg px-2.5 py-0.5 rounded-md bg-chalk/70">
              SOLD
            </div>
          )}
        </div>
      </div>

      <div className="p-3 flex flex-col flex-1">
        <div className="text-[10px] uppercase tracking-wide font-bold opacity-55">{item.category}</div>
        <div className="text-sm font-bold leading-tight mt-0.5">{item.name}</div>
        <div className="flex items-end justify-between flex-wrap gap-x-2 gap-y-1 mt-auto pt-2.5">
          <div className="font-marker text-2xl text-marker leading-none">{money(item.price)}</div>
          <StatusPill item={item} />
        </div>
      </div>
    </div>
  );
}

function StatusPill({ item }: { item: Item }) {
  if (item.status === "available") {
    return (
      <div className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-grass/20 text-grass-dark">
        ● Available
      </div>
    );
  }
  if (item.status === "reserved") {
    return (
      <div className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber/20 text-amber">● Reserved</div>
    );
  }
  return (
    <div className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-marker/20 text-marker">● Sold</div>
  );
}

function DetailSheet({
  item,
  sale,
  onClose,
  onReserved,
}: {
  item: Item;
  sale: Sale;
  onClose: () => void;
  onReserved: (item: Item) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const supabase = useMemo(() => createClient(), []);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("garage-sale-my-info");
      if (saved) {
        const info = JSON.parse(saved);
        setName(info.name || "");
        setPhone(info.phone || "");
      }
    } catch {}
  }, []);

  const photos = item.item_photos || [];

  function prevPhoto() {
    setPhotoIdx((i) => (i - 1 + photos.length) % photos.length);
  }

  function nextPhoto() {
    setPhotoIdx((i) => (i + 1) % photos.length);
  }

  function onPhotoTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onPhotoTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    const SWIPE_THRESHOLD = 40;
    if (dx > SWIPE_THRESHOLD) prevPhoto();
    else if (dx < -SWIPE_THRESHOLD) nextPhoto();
  }

  async function reserve() {
    setError("");
    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 7) {
      setError("Enter a valid phone number.");
      return;
    }
    setLoading(true);
    const { data, error: rpcErr } = await supabase.rpc("reserve_item", {
      p_item_id: item.id,
      p_name: name.trim(),
      p_phone: phone.trim(),
    });
    setLoading(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    if (!data?.success) {
      setError(data?.error || "Couldn't reserve this item.");
      return;
    }
    try {
      localStorage.setItem("garage-sale-my-info", JSON.stringify({ name: name.trim(), phone: phone.trim() }));
    } catch {}
    onReserved({
      ...item,
      status: "reserved",
      reserved_name: name.trim(),
      reserved_phone: phone.trim(),
      reserved_at: new Date().toISOString(),
    });
  }

  return (
    <div className="fixed inset-0 bg-ink/50 z-40 flex items-end justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-slideup bg-chalk w-full max-w-lg rounded-t-2xl p-6 pb-8 max-h-[88vh] overflow-y-auto relative"
      >
        <button onClick={onClose} className="absolute top-3.5 right-4 text-xl opacity-50">
          ✕
        </button>
        <div className="w-9 h-1 bg-cardboard-dark rounded-full mx-auto mb-4" />

        {photos.length > 0 ? (
          <div className="mb-3 relative" onTouchStart={onPhotoTouchStart} onTouchEnd={onPhotoTouchEnd}>
            <img
              src={photoUrl(photos[photoIdx].storage_path)}
              alt=""
              className="w-full h-56 object-cover rounded-lg border-2 border-cardboard-dark select-none"
              draggable={false}
            />
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevPhoto}
                  aria-label="Previous photo"
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-ink/60 text-chalk text-2xl font-bold active:bg-ink/80"
                >
                  &lt;
                </button>
                <button
                  type="button"
                  onClick={nextPhoto}
                  aria-label="Next photo"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-ink/60 text-chalk text-2xl font-bold active:bg-ink/80"
                >
                  &gt;
                </button>
                <div className="absolute bottom-2 right-2.5 bg-ink/60 text-chalk text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {photoIdx + 1} / {photos.length}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="text-5xl text-center mb-1">{item.icon}</div>
        )}

        <div className="text-[11px] uppercase tracking-wide font-bold opacity-55 text-center mt-1">{item.category}</div>
        <div className="text-lg font-extrabold text-center my-1">{item.name}</div>
        <div className="font-marker text-4xl text-marker text-center mb-2.5">{money(item.price)}</div>
        {item.description && <p className="text-sm opacity-85 text-center leading-relaxed">{item.description}</p>}

        {item.status === "sold" ? (
          <div className="bg-marker/10 border border-marker/30 rounded-lg p-3.5 text-center text-sm mt-3">
            This item has already sold.
          </div>
        ) : item.status === "reserved" ? (
          <>
            <div className="font-mono text-2xl text-amber bg-amber/10 rounded-lg text-center py-3.5 my-2">
              {fmtMMSS(reservationDeadline(item, sale) - Date.now())}
            </div>
            <div className="text-xs opacity-60 text-center">
              Reserved by someone else — it&apos;ll pop back up here if they don&apos;t claim it in time.
            </div>
          </>
        ) : sale.status !== "live" ? (
          <div className="bg-marker/10 border border-marker/30 rounded-lg p-3.5 text-center text-sm mt-3">
            This sale has ended and isn&apos;t accepting reservations.
          </div>
        ) : (
          <>
            <div className="mt-3">
              <label className="block text-xs font-bold opacity-70 mb-1">Your name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jamie"
                className="w-full px-3 py-2.5 border-2 border-cardboard-dark rounded-lg bg-white"
              />
            </div>
            <div className="mt-2.5">
              <label className="block text-xs font-bold opacity-70 mb-1">Phone number</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                type="tel"
                className="w-full px-3 py-2.5 border-2 border-cardboard-dark rounded-lg bg-white"
              />
            </div>
            <button
              onClick={reserve}
              disabled={loading}
              className="w-full bg-grass text-white font-bold py-3 rounded-lg shadow-tag mt-3.5 disabled:opacity-60"
            >
              {loading ? "Holding…" : `Hold for ${item.reservation_minutes ?? sale.default_reservation_minutes} min`}
            </button>
            {error && <div className="text-marker text-sm font-semibold mt-2">{error}</div>}
            <div className="text-xs opacity-60 text-center mt-2">
              Show your name at pickup — we&apos;ll only use your number if we need to reach you.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
