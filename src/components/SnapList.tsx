"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { shrinkImage } from "@/lib/shrinkImage";
import { photoUrl } from "@/components/PhotoUploader";
import {
  COMMON_CATEGORIES,
  PRICE_PRESETS,
  PRICE_STEPS,
  groupNumbers,
  listingsFromPhotos,
  nudgePrice,
  type SnapSuggestion,
} from "@/lib/snapList";
import { ITEM_SELECT, friendlyDbError, money } from "@/lib/utils";
import type { Item, SellMode } from "@/lib/types";
import SellModePicker, { sellModeError } from "@/components/SellModePicker";

const BUCKET = "item-photos";
/** Photos sent to Claude at the same time. */
const PARALLEL = 3;

type Status = "uploading" | "thinking" | "ready" | "error" | "adding";

interface Draft {
  id: string;
  status: Status;
  /** Storage paths once uploaded (in the sale's own folder), first = cover. */
  paths: string[];
  /** Local previews while uploading. */
  previews?: string[];
  error?: string;
  name: string;
  price: string;
  category: string;
  description: string;
  /** A bulk lot of identical items (always first come, first served). */
  isBulk: boolean;
  quantity: number;
  /** How buyers get it (single items only). */
  sellMode: SellMode;
  issue?: SnapSuggestion["issue"];
  confidence?: SnapSuggestion["confidence"];
}

const ISSUE_NOTES: Record<string, string> = {
  blurry: "The photo looks blurry — check the details, or retake it.",
  multiple_items: "This photo shows several different items; the suggestion is for the main one.",
  not_an_item: "We couldn't see an item to sell in this photo.",
};

/** A photo in the sorting grid, before it becomes part of a card. */
interface Staged {
  id: string;
  file: File;
  preview: string;
  /** Photos with the same group become one listing. */
  group: string | null;
}

/** Colours for group badges in the sorting grid. */
const GROUP_COLORS = ["#2f7d32", "#c8102e", "#0b4fa8", "#b26a00", "#6a1b9a", "#00796b", "#ad1457", "#455a64"];

/** Snap & list: take or pick photos, sort them in a grid (group several
 * photos of one item, remove extras), then each group or single photo becomes
 * a card: uploaded, optionally given a Claude suggestion, and reviewed
 * (adjusting the price with quick buttons) before adding. Cards are kept on
 * this device until added or discarded. */
export default function SnapList({
  saleId,
  itemCount,
  itemLimit,
  onAdded,
  ai,
  categories,
  payoutsReady,
  premium,
}: {
  saleId: string;
  itemCount: number;
  /** Items still allowed (the trial's 25), or null for no limit. */
  itemLimit: number | null;
  onAdded: (item: Item) => void;
  /** Ask Claude for suggestions; without it the seller fills each card in. */
  ai: boolean;
  /** The sale's existing categories, offered as quick picks. */
  categories: string[];
  /** The seller can take card payments (Buy Now). */
  payoutsReady: boolean;
  /** The seller's plan includes Holds and Buy Now. */
  premium: boolean;
}) {
  const storageKey = `snap:${saleId}`;
  const [drafts, setDrafts] = useState<Draft[]>([]);
  // photos waiting their turn, worked through a few at a time
  const queue = useRef<{ id: string; files: File[] }[]>([]);
  // the sorting grid
  const [staged, setStaged] = useState<Staged[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // new cards start with the "how buyers get it" the seller last picked
  const lastMode = useRef<SellMode>("in_person");
  const running = useRef(0);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);

  // drafts that were waiting for review when the page was closed; nothing is
  // saved back until they've been read, so they can't be overwritten first
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]") as Draft[];
      if (Array.isArray(saved)) {
        const restored = saved
          // cards saved before photo groups had a single `path`
          .map((d) => ({ ...d, paths: d.paths ?? ((d as { path?: string }).path ? [(d as { path?: string }).path!] : []) }))
          .filter((d) => d.paths.length > 0 && d.status === "ready")
          .map((d) => ({ ...d, isBulk: d.isBulk ?? d.quantity > 1, sellMode: d.sellMode ?? "in_person" }));
        setDrafts((ds) => [...restored.filter((r) => !ds.some((d) => d.id === r.id)), ...ds]);
      }
    } catch {}
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (!loaded) return;
    try {
      const keep = drafts.filter((d) => d.status === "ready").map(({ previews: _p, ...d }) => d);
      localStorage.setItem(storageKey, JSON.stringify(keep));
    } catch {}
  }, [drafts, storageKey, loaded]);

  const patch = (id: string, p: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)));

  // new photos go into the sorting grid first
  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const added = Array.from(list)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), group: null }));
    setStaged((st) => [...st, ...added]);
  }

  function toggleSelected(id: string) {
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function groupSelected() {
    const group = crypto.randomUUID();
    setStaged((st) => st.map((p) => (selected.has(p.id) ? { ...p, group } : p)));
    setSelected(new Set());
  }

  function ungroupSelected() {
    setStaged((st) => st.map((p) => (selected.has(p.id) ? { ...p, group: null } : p)));
    setSelected(new Set());
  }

  function removeSelected() {
    setStaged((st) => {
      st.filter((p) => selected.has(p.id)).forEach((p) => URL.revokeObjectURL(p.preview));
      return st.filter((p) => !selected.has(p.id));
    });
    setSelected(new Set());
  }

  function cancelSorting() {
    staged.forEach((p) => URL.revokeObjectURL(p.preview));
    setStaged([]);
    setSelected(new Set());
  }

  /** Each group (and each photo on its own) becomes one card. */
  function finishSorting() {
    const units = listingsFromPhotos(staged);
    setDrafts((ds) => [
      ...ds,
      ...units.map((photos) => ({
        id: photos[0].id,
        status: "uploading" as Status,
        paths: [],
        previews: photos.map((p) => p.preview),
        name: "",
        price: "",
        category: "",
        description: "",
        isBulk: false,
        quantity: 1,
        sellMode: lastMode.current,
      })),
    ]);
    queue.current.push(...units.map((photos) => ({ id: photos[0].id, files: photos.map((p) => p.file) })));
    setStaged([]);
    setSelected(new Set());
    pump();
  }

  function pump() {
    while (running.current < PARALLEL && queue.current.length > 0) {
      const next = queue.current.shift()!;
      running.current++;
      process(next.id, next.files).finally(() => {
        running.current--;
        pump();
      });
    }
  }

  async function process(id: string, originals: File[]) {
    const paths: string[] = [];
    try {
      for (const original of originals) {
        const file = await shrinkImage(original);
        const path = `${saleId}/snap/${crypto.randomUUID()}.jpg`;
        const { error } = await createClient().storage.from(BUCKET).upload(path, file, {
          contentType: file.type,
          cacheControl: "3600",
        });
        if (error) return patch(id, { paths, status: "error", error: friendlyDbError(error.message) });
        paths.push(path);
      }
      if (!ai) return patch(id, { paths, status: "ready" });
      patch(id, { paths, status: "thinking" });
      // the first photo of a group is the one Claude looks at
      await suggest(id, paths[0]);
    } catch {
      patch(id, { paths, status: "error", error: "Couldn't upload a photo — check your connection." });
    }
  }

  async function suggest(id: string, path: string, attempt = 0): Promise<void> {
    const res = await fetch("/api/items/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saleId, path }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (res?.status === 429 && attempt < 3 && /retry/.test(body.error || "")) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      return suggest(id, path, attempt + 1);
    }
    if (!res?.ok || !body.suggestion) {
      // still reviewable: the seller can fill it in by hand
      return patch(id, { status: "ready", error: body.error || "Couldn't get a suggestion — fill it in yourself." });
    }
    const s = body.suggestion as SnapSuggestion;
    patch(id, {
      status: "ready",
      name: s.name,
      price: String(s.price),
      category: s.category,
      description: s.description,
      quantity: s.quantity,
      isBulk: s.quantity > 1,
      issue: s.issue,
      confidence: s.confidence,
    });
  }

  async function add(d: Draft) {
    if (!d.name.trim()) return patch(d.id, { error: "Give it a name first." });
    // bulk lots are always first come, first served (as in the add-item form)
    const sellMode: SellMode = d.isBulk ? "in_person" : d.sellMode;
    const modeError = sellModeError(sellMode, d.price, payoutsReady, premium);
    if (modeError) return patch(d.id, { error: modeError });
    patch(d.id, { status: "adding", error: undefined });
    const supabase = createClient();
    const quantity = d.isBulk ? Math.max(2, Math.round(d.quantity) || 2) : 1;
    const { data: item, error } = await supabase
      .from("items")
      .insert({
        sale_id: saleId,
        name: d.name.trim().slice(0, 60),
        price: Number(d.price) || 0,
        category: d.category.trim() || "Misc",
        description: d.description.trim(),
        icon: "📦",
        quantity_total: quantity,
        quantity_available: quantity,
        sell_mode: sellMode,
      })
      .select("id")
      .single();
    if (error || !item) return patch(d.id, { status: "ready", error: friendlyDbError(error?.message) });
    if (d.paths.length) {
      await supabase
        .from("item_photos")
        .insert(d.paths.map((storage_path, position) => ({ item_id: item.id, storage_path, position })));
    }
    const { data: full } = await supabase.from("items").select(ITEM_SELECT).eq("id", item.id).single();
    setDrafts((ds) => ds.filter((x) => x.id !== d.id));
    if (full) onAdded(full as Item);
  }

  async function discard(d: Draft) {
    setDrafts((ds) => ds.filter((x) => x.id !== d.id));
    if (d.paths.length) await createClient().storage.from(BUCKET).remove(d.paths);
  }

  async function addAll() {
    const ready = drafts.filter((d) => d.status === "ready" && d.name.trim() && !d.error);
    const room = itemLimit === null ? ready.length : Math.max(0, itemLimit - itemCount);
    for (const d of ready.slice(0, room)) await add(d);
  }

  const busy = drafts.filter((d) => d.status === "uploading" || d.status === "thinking").length;
  const readyCount = drafts.filter((d) => d.status === "ready" && d.name.trim() && !d.error).length;
  const unnamed = drafts.filter((d) => d.status === "ready" && !d.name.trim()).length;
  const full = itemLimit !== null && itemCount >= itemLimit;
  const btn = "border-2 border-cardboard-dark bg-white font-bold px-2 py-1 rounded-lg text-xs";

  return (
    <div className="border-2 border-dashed border-grass rounded-xl p-3 mb-4 bg-grass/5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="font-bold text-sm">📸 Snap &amp; list</div>
          <div className="text-xs opacity-70">
            {ai
              ? "Photograph items, group the photos of each one, and we suggest a name, category and price. You check them before they're added."
              : "Photograph items, group the photos of each one, then give each a name and price."}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={full}
            onClick={() => cameraRef.current?.click()}
            className="bg-grass text-white font-bold px-3 py-2 rounded-lg text-sm shadow-tag disabled:opacity-50"
          >
            📷 Take photo
          </button>
          <button type="button" disabled={full} onClick={() => pickRef.current?.click()} className={`${btn} text-sm px-3 py-2 disabled:opacity-50`}>
            🖼️ Choose photos
          </button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={pickRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {staged.length > 0 && (
        <PhotoSorter
          staged={staged}
          selected={selected}
          room={itemLimit === null ? null : Math.max(0, itemLimit - itemCount - drafts.length)}
          onToggle={toggleSelected}
          onGroup={groupSelected}
          onUngroup={ungroupSelected}
          onRemove={removeSelected}
          onCancel={cancelSorting}
          onDone={finishSorting}
        />
      )}

      <datalist id="snap-categories">
        {Array.from(new Set([...categories, ...COMMON_CATEGORIES])).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {drafts.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
            <div className="text-xs font-semibold opacity-70" aria-live="polite">
              {busy > 0 ? `Working on ${busy} photo${busy === 1 ? "" : "s"}… ` : ""}
              {ai
                ? readyCount > 0
                  ? `${readyCount} ready to review`
                  : ""
                : [readyCount > 0 ? `${readyCount} ready` : "", unnamed > 0 ? `${unnamed} need${unnamed === 1 ? "s" : ""} a name` : ""]
                    .filter(Boolean)
                    .join(" · ")}
            </div>
            {readyCount > 1 && (
              <button type="button" onClick={addAll} disabled={full} className="bg-ink text-chalk font-bold px-3 py-1.5 rounded-lg text-xs disabled:opacity-50">
                Add all {readyCount}
              </button>
            )}
          </div>
          <div className="grid gap-3 mt-2">
            {drafts.map((d) => (
              <DraftCard
                key={d.id}
                d={d}
                onChange={(p) => {
                  if (p.sellMode) lastMode.current = p.sellMode;
                  patch(d.id, p);
                }}
                onAdd={() => add(d)}
                onDiscard={() => discard(d)}
                disabled={full}
                payoutsReady={payoutsReady}
                premium={premium}
              />
            ))}
          </div>
        </>
      )}
      {full && (
        <div className="text-xs font-semibold text-marker mt-2">
          You&apos;ve reached your plan&apos;s item limit — upgrade to add more.
        </div>
      )}
    </div>
  );
}

function DraftCard({
  d,
  onChange,
  onAdd,
  onDiscard,
  disabled,
  payoutsReady,
  premium,
}: {
  d: Draft;
  onChange: (p: Partial<Draft>) => void;
  onAdd: () => void;
  onDiscard: () => void;
  disabled: boolean;
  payoutsReady: boolean;
  premium: boolean;
}) {
  const src = d.previews?.[0] || (d.paths[0] ? photoUrl(d.paths[0]) : undefined);
  const photoCount = Math.max(d.paths.length, d.previews?.length ?? 0);
  const working = d.status === "uploading" || d.status === "thinking";
  const input = "w-full px-2 py-1.5 border-2 border-cardboard-dark rounded-lg text-sm";
  const price = Number(d.price) || 0;

  return (
    <div className="bg-white border-2 border-cardboard-dark rounded-xl p-2.5 flex gap-3">
      <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-chalk-dim relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt="" className="w-full h-full object-cover" />}
        {photoCount > 1 && (
          <span className="absolute bottom-1 right-1 bg-ink/80 text-chalk text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            📷 {photoCount}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {working ? (
          <div className="text-sm opacity-70 py-6">{d.status === "uploading" ? "Uploading…" : "✨ Looking at your photo…"}</div>
        ) : (
          <>
            <input
              value={d.name}
              maxLength={60}
              onChange={(e) => onChange({ name: e.target.value, error: undefined })}
              placeholder="Item name"
              className={`${input} font-bold`}
              aria-label="Item name"
            />
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-sm font-bold">$</span>
              <input
                type="number"
                min={0}
                step="0.25"
                value={d.price}
                onChange={(e) => onChange({ price: e.target.value })}
                className="w-20 px-2 py-1.5 border-2 border-cardboard-dark rounded-lg text-sm"
                aria-label="Price"
              />
              {PRICE_STEPS.map((s) => (
                <button key={s} type="button" onClick={() => onChange({ price: String(nudgePrice(price, s)) })} className="border-2 border-cardboard-dark/60 rounded-full px-2 py-0.5 text-xs font-bold">
                  {s > 0 ? `+$${s}` : `−$${-s}`}
                </button>
              ))}
              {PRICE_PRESETS.map((p) => (
                <button key={p} type="button" onClick={() => onChange({ price: String(p) })} className={`border-2 rounded-full px-2 py-0.5 text-xs font-bold ${price === p ? "bg-ink text-chalk border-ink" : "border-cardboard-dark/60"}`}>
                  {money(p)}
                </button>
              ))}
            </div>
            <input
              value={d.category}
              onChange={(e) => onChange({ category: e.target.value })}
              placeholder="Category"
              className={`${input} mt-1.5`}
              aria-label="Category"
              list="snap-categories"
            />
            <label className="flex items-center gap-2 text-xs font-bold opacity-80 mt-2">
              <input
                type="checkbox"
                checked={d.isBulk}
                onChange={(e) =>
                  onChange({ isBulk: e.target.checked, quantity: e.target.checked ? Math.max(2, d.quantity) : 1, error: undefined })
                }
              />
              Sell as a bulk lot
            </label>
            {d.isBulk ? (
              <div className="flex items-center gap-2 mt-1.5 mb-1">
                <label className="text-xs font-bold opacity-70" htmlFor={`qty-${d.id}`}>
                  How many
                </label>
                <input
                  id={`qty-${d.id}`}
                  type="number"
                  min={2}
                  value={d.quantity}
                  onChange={(e) => onChange({ quantity: Number(e.target.value) || 0 })}
                  className="w-20 px-2 py-1.5 border-2 border-cardboard-dark rounded-lg text-sm"
                />
              </div>
            ) : null}
            {d.isBulk ? (
              <div className="text-[11px] opacity-60 mb-1">Bulk lots are first come, first served; the price is for one.</div>
            ) : (
              <div className="mt-2">
                <SellModePicker
                  value={d.sellMode}
                  onChange={(sellMode) => onChange({ sellMode, error: undefined })}
                  payoutsReady={payoutsReady}
                  premium={premium}
                  price={d.price}
                  compact
                />
              </div>
            )}
            <textarea
              value={d.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Description (optional)"
              rows={2}
              className={`${input} mt-1.5`}
              aria-label="Description"
            />
            {d.issue && d.issue !== "none" && <div className="text-[11px] font-semibold text-amber mt-1">{ISSUE_NOTES[d.issue]}</div>}
            {d.confidence === "low" && d.issue === "none" && (
              <div className="text-[11px] opacity-70 mt-1">Not too sure about this one — double-check the name and price.</div>
            )}
            {d.error && <div className="text-[11px] font-semibold text-marker mt-1">{d.error}</div>}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={onAdd}
                disabled={disabled || d.status === "adding" || !d.name.trim()}
                className="bg-grass text-white font-bold px-3 py-1.5 rounded-lg text-xs disabled:opacity-50"
              >
                {d.status === "adding" ? "Adding…" : "✓ Add item"}
              </button>
              <button type="button" onClick={onDiscard} className="text-xs font-semibold opacity-70 underline">
                Discard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The sorting step: pick photos of the same item and group them (each group
 * becomes one listing), remove photos that aren't wanted, then Done. */
function PhotoSorter({
  staged,
  selected,
  room,
  onToggle,
  onGroup,
  onUngroup,
  onRemove,
  onCancel,
  onDone,
}: {
  staged: Staged[];
  selected: Set<string>;
  /** Listings still allowed by the plan, or null for no limit. */
  room: number | null;
  onToggle: (id: string) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onRemove: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const numbers = groupNumbers(staged);
  const listings = listingsFromPhotos(staged).length;
  const selectedGrouped = staged.some((p) => selected.has(p.id) && p.group);
  const color = (group: string | null) => (group ? GROUP_COLORS[((numbers.get(group) ?? 1) - 1) % GROUP_COLORS.length] : undefined);
  const btn = "border-2 border-cardboard-dark bg-white font-bold px-3 py-1.5 rounded-lg text-xs disabled:opacity-40";

  return (
    <div className="bg-white border-2 border-cardboard-dark rounded-xl p-3 mt-3">
      <div className="font-bold text-sm">Sort your photos</div>
      <p className="text-xs opacity-70 mb-2">
        Tap the photos of one item, then <strong>Group photos</strong>. Each group — and each photo on its own — becomes
        one listing.
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {staged.map((p) => {
          const isSelected = selected.has(p.id);
          const c = color(p.group);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              aria-pressed={isSelected}
              aria-label={`Photo${p.group ? `, group ${numbers.get(p.group)}` : ""}${isSelected ? ", selected" : ""}`}
              className="relative aspect-square rounded-lg overflow-hidden border-4 bg-chalk-dim"
              style={{ borderColor: c ?? "transparent" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className={`w-full h-full object-cover ${isSelected ? "opacity-70" : ""}`} />
              {p.group && (
                <span
                  className="absolute bottom-1 left-1 text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: c }}
                >
                  Group {numbers.get(p.group)}
                </span>
              )}
              <span
                className={`absolute top-1 right-1 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold ${
                  isSelected ? "bg-grass text-white" : "bg-black/30"
                }`}
                aria-hidden
              >
                {isSelected ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="text-xs font-semibold opacity-70 mt-2" aria-live="polite">
        {staged.length} photo{staged.length === 1 ? "" : "s"} → {listings} listing{listings === 1 ? "" : "s"}
        {selected.size > 0 && ` · ${selected.size} selected`}
      </div>
      {room !== null && listings > room && (
        <div className="text-xs font-semibold text-marker mt-1">
          Your plan has room for {room} more item{room === 1 ? "" : "s"} — group or remove some photos.
        </div>
      )}

      <div className="flex gap-2 flex-wrap mt-2">
        <button type="button" onClick={onGroup} disabled={selected.size < 2} className={btn}>
          🔗 Group photos
        </button>
        <button type="button" onClick={onUngroup} disabled={!selectedGrouped} className={btn}>
          Ungroup
        </button>
        <button type="button" onClick={onRemove} disabled={selected.size === 0} className={btn}>
          🗑️ Remove
        </button>
      </div>
      <div className="flex gap-2 justify-end mt-3 border-t-2 border-dashed border-cardboard/60 pt-3">
        <button type="button" onClick={onCancel} className="text-sm font-semibold opacity-70 underline px-2">
          Cancel
        </button>
        <button type="button" onClick={onDone} className="bg-grass text-white font-bold px-4 py-2 rounded-lg text-sm shadow-tag">
          Done
        </button>
      </div>
    </div>
  );
}
