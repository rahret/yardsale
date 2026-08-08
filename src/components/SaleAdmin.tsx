"use client";

import { useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { createClient } from "@/lib/supabase/client";
import type { Item, Sale, SaleStatus, SavedLocation } from "@/lib/types";
import { EMOJI_PRESETS, money, siteOrigin } from "@/lib/utils";
import PhotoUploader, { photoUrl } from "@/components/PhotoUploader";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(val: string): string | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const STATUS_OPTIONS: { value: SaleStatus; label: string; hint: string }[] = [
  { value: "draft", label: "Draft", hint: "Only you can see it while you set it up." },
  { value: "live", label: "Live", hint: "Public — buyers can view and reserve items." },
  { value: "ended", label: "Ended", hint: "Public read-only — no new reservations." },
];

const emptyForm = { name: "", price: "", category: "", description: "", reservationMinutes: "", icon: "📦" };

export default function SaleAdmin({
  sale: initialSale,
  initialItems,
  initialSavedLocations,
}: {
  sale: Sale;
  initialItems: Item[];
  initialSavedLocations: SavedLocation[];
}) {
  const [sale, setSale] = useState<Sale>(initialSale);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [form, setForm] = useState(emptyForm);
  const [addError, setAddError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [photosOpenId, setPhotosOpenId] = useState<string | null>(null);
  const [saleForm, setSaleForm] = useState({
    name: sale.name,
    tagline: sale.tagline,
    address: sale.address || "",
    starts_at: toLocalInput(sale.starts_at),
    ends_at: toLocalInput(sale.ends_at),
    default_reservation_minutes: String(sale.default_reservation_minutes),
  });
  const [savingSale, setSavingSale] = useState(false);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(initialSavedLocations);
  const [locationLabel, setLocationLabel] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  const siteUrl = siteOrigin(typeof window !== "undefined" ? window.location.origin : "");
  const shareUrl = `${siteUrl}/s/${sale.slug}`;

  const stats = useMemo(() => {
    const sold = items.filter((i) => i.status === "sold");
    const revenue = sold.reduce((s, i) => s + (Number(i.price) || 0), 0);
    return {
      total: items.length,
      available: items.filter((i) => i.status === "available").length,
      reserved: items.filter((i) => i.status === "reserved").length,
      sold: sold.length,
      revenue,
    };
  }, [items]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)),
    [items]
  );

  async function saveSaleSettings() {
    setSavingSale(true);
    const supabase = createClient();
    const patch = {
      name: saleForm.name.trim() || sale.name,
      tagline: saleForm.tagline.trim(),
      address: saleForm.address.trim(),
      starts_at: fromLocalInput(saleForm.starts_at),
      ends_at: fromLocalInput(saleForm.ends_at),
      default_reservation_minutes: Number(saleForm.default_reservation_minutes) || 30,
    };
    const { data, error } = await supabase.from("sales").update(patch).eq("id", sale.id).select().single();
    setSavingSale(false);
    if (!error && data) setSale(data);
  }

  function selectSavedLocation(loc: SavedLocation) {
    setSaleForm((prev) => ({ ...prev, address: loc.address }));
  }

  async function saveCurrentLocation() {
    const address = saleForm.address.trim();
    if (!address) return;
    setSavingLocation(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("saved_locations")
      .insert({ owner_id: sale.owner_id, label: locationLabel.trim(), address })
      .select()
      .single();
    setSavingLocation(false);
    if (!error && data) {
      setSavedLocations((prev) => [data, ...prev]);
      setLocationLabel("");
    }
  }

  async function deleteSavedLocation(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("saved_locations").delete().eq("id", id);
    if (!error) setSavedLocations((prev) => prev.filter((l) => l.id !== id));
  }

  async function setSaleStatus(status: SaleStatus) {
    const supabase = createClient();
    const { data, error } = await supabase.from("sales").update({ status }).eq("id", sale.id).select().single();
    if (!error && data) setSale(data);
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setAddError("");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("items")
      .insert({
        sale_id: sale.id,
        name: form.name.trim(),
        price: Number(form.price) || 0,
        category: form.category.trim() || "Misc",
        description: form.description.trim(),
        reservation_minutes: form.reservationMinutes ? Number(form.reservationMinutes) : null,
        icon: form.icon || "📦",
      })
      .select("*, item_photos(*)")
      .single();
    if (error) {
      setAddError(error.message);
      return;
    }
    setItems((prev) => [data, ...prev]);
    setForm(emptyForm);
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      price: String(item.price),
      category: item.category,
      description: item.description,
      reservationMinutes: item.reservation_minutes ? String(item.reservation_minutes) : "",
      icon: item.icon,
      status: item.status,
    });
  }

  async function saveEdit(id: string) {
    const supabase = createClient();
    const patch = {
      name: editForm.name.trim(),
      price: Number(editForm.price) || 0,
      category: editForm.category.trim() || "Misc",
      description: editForm.description,
      reservation_minutes: editForm.reservationMinutes ? Number(editForm.reservationMinutes) : null,
      icon: editForm.icon || "📦",
      status: editForm.status,
    };
    const { data, error } = await supabase
      .from("items")
      .update(patch)
      .eq("id", id)
      .select("*, item_photos(*)")
      .single();
    if (!error && data) {
      setItems((prev) => prev.map((i) => (i.id === id ? data : i)));
      setEditingId(null);
    }
  }

  async function markSold(id: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("items")
      .update({ status: "sold", sold_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, item_photos(*)")
      .single();
    if (!error && data) setItems((prev) => prev.map((i) => (i.id === id ? data : i)));
  }

  async function cancelReservation(id: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("items")
      .update({ status: "available", reserved_name: null, reserved_phone: null, reserved_at: null })
      .eq("id", id)
      .select("*, item_photos(*)")
      .single();
    if (!error && data) setItems((prev) => prev.map((i) => (i.id === id ? data : i)));
  }

  async function deleteItem(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (!error) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setConfirmDeleteId(null);
    }
  }

  function copyLink() {
    navigator.clipboard?.writeText(shareUrl);
  }

  return (
    <div className="p-5 pb-20">
      <a href="/dashboard" className="text-sm font-semibold opacity-70">
        ← All sales
      </a>
      <div className="font-marker text-3xl text-marker -rotate-1 mt-2 mb-5">{sale.name}</div>

      {/* stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
        <Stat num={stats.total} label="Items" />
        <Stat num={stats.available} label="Available" />
        <Stat num={stats.reserved} label="Reserved" />
        <Stat num={stats.sold} label="Sold" />
        <Stat num={money(stats.revenue)} label="Revenue" />
      </div>

      {/* status */}
      <Card title="🚦 Sale status">
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSaleStatus(opt.value)}
              className={`px-4 py-2 rounded-lg text-sm font-bold border-2 ${
                sale.status === opt.value
                  ? "bg-ink text-chalk border-ink"
                  : "border-cardboard-dark bg-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="text-xs opacity-60 mt-2">
          {STATUS_OPTIONS.find((o) => o.value === sale.status)?.hint}
        </div>
      </Card>

      {/* share + qr */}
      <Card title="📣 Share your sale">
        <div className="flex gap-2 mb-3">
          <input readOnly value={shareUrl} className="flex-1 px-3 py-2 border-2 border-cardboard-dark rounded-lg text-sm" />
          <button onClick={copyLink} className="bg-ink text-chalk font-bold px-4 rounded-lg text-sm">
            Copy
          </button>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="bg-white p-2 rounded-lg border-2 border-cardboard-dark">
            <QRCodeCanvas value={shareUrl} size={120} fgColor="#33312E" />
          </div>
          <div className="text-xs opacity-70 flex-1 min-w-[160px]">
            Print this QR code on your signs. It always points to the link above.
          </div>
        </div>
      </Card>

      {/* sale settings */}
      <Card title="🏷️ Sale details">
        <Field label="Sale name">
          <input
            value={saleForm.name}
            onChange={(e) => setSaleForm({ ...saleForm, name: e.target.value })}
            className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
          />
        </Field>
        <Field label="Tagline">
          <input
            value={saleForm.tagline}
            onChange={(e) => setSaleForm({ ...saleForm, tagline: e.target.value })}
            className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
          />
        </Field>
        <Field label="Address">
          <textarea
            value={saleForm.address}
            onChange={(e) => setSaleForm({ ...saleForm, address: e.target.value })}
            placeholder="123 Main St, Springfield"
            className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg min-h-[50px]"
          />
        </Field>

        {savedLocations.length > 0 && (
          <div className="mb-2.5">
            <label className="block text-xs font-bold opacity-70 mb-1">Saved locations</label>
            <div className="flex gap-1.5 flex-wrap">
              {savedLocations.map((loc) => (
                <div
                  key={loc.id}
                  className="flex items-center gap-1 border-2 border-cardboard-dark bg-white rounded-lg pl-2.5 pr-1 py-1"
                >
                  <button
                    type="button"
                    onClick={() => selectSavedLocation(loc)}
                    className="text-xs font-bold text-left max-w-[180px] truncate"
                    title={loc.address}
                  >
                    {loc.label || loc.address}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSavedLocation(loc.id)}
                    className="text-xs opacity-50 hover:opacity-90 px-1"
                    aria-label="Delete saved location"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-2.5">
          <input
            value={locationLabel}
            onChange={(e) => setLocationLabel(e.target.value)}
            placeholder="Label (optional)"
            className="flex-1 px-3 py-2 border-2 border-cardboard-dark rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={saveCurrentLocation}
            disabled={savingLocation || !saleForm.address.trim()}
            className="border-2 border-cardboard-dark bg-white font-bold px-3 rounded-lg text-sm disabled:opacity-50"
          >
            {savingLocation ? "Saving…" : "💾 Save location"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Sale starts">
            <input
              type="datetime-local"
              value={saleForm.starts_at}
              onChange={(e) => setSaleForm({ ...saleForm, starts_at: e.target.value })}
              className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
            />
          </Field>
          <Field label="Sale ends">
            <input
              type="datetime-local"
              value={saleForm.ends_at}
              onChange={(e) => setSaleForm({ ...saleForm, ends_at: e.target.value })}
              className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
            />
          </Field>
        </div>
        <Field label="Default reservation window (minutes)">
          <input
            type="number"
            min={1}
            value={saleForm.default_reservation_minutes}
            onChange={(e) => setSaleForm({ ...saleForm, default_reservation_minutes: e.target.value })}
            className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
          />
        </Field>
        <button
          onClick={saveSaleSettings}
          disabled={savingSale}
          className="bg-ink text-chalk font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-60"
        >
          {savingSale ? "Saving…" : "Save details"}
        </button>
      </Card>

      {/* add item */}
      <Card title="➕ Add an item">
        <form onSubmit={addItem}>
          <div className="flex gap-1.5 flex-wrap mb-3">
            {EMOJI_PRESETS.map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => setForm({ ...form, icon: e })}
                className={`text-lg px-2 py-1 border-2 rounded-lg ${
                  form.icon === e ? "border-grass bg-grass/15" : "border-cardboard-dark bg-white"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Oak side table"
                className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
              />
            </Field>
            <Field label="Price ($)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="15"
                className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Category">
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Furniture"
                className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
              />
            </Field>
            <Field label="Reservation minutes (optional)">
              <input
                type="number"
                min={1}
                value={form.reservationMinutes}
                onChange={(e) => setForm({ ...form, reservationMinutes: e.target.value })}
                placeholder="uses default"
                className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
              />
            </Field>
          </div>
          <Field label="Description (optional)">
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Solid wood, minor scratch on top"
              className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg min-h-[60px]"
            />
          </Field>
          {addError && <div className="text-marker text-sm font-semibold mb-2">{addError}</div>}
          <button type="submit" className="bg-grass text-white font-bold px-5 py-2.5 rounded-lg shadow-tag">
            Add item
          </button>
          <div className="text-xs opacity-60 mt-2">You can add photos once the item is created, below.</div>
        </form>
      </Card>

      {/* item list */}
      <Card title={`📋 Items (${items.length})`}>
        {sortedItems.length === 0 && <div className="text-sm opacity-60">No items yet — add your first one above.</div>}
        <div className="divide-y divide-chalk-dim">
          {sortedItems.map((item) => (
            <div key={item.id} className="py-3">
              <div className="flex items-center gap-3">
                <Thumb item={item} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{item.name}</div>
                  <div className="text-xs opacity-60">
                    {money(item.price)} · {item.category} · <StatusBadge status={item.status} />
                    {item.status === "reserved" && <> · held by {item.reserved_name}</>}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap mt-2">
                <SmallBtn onClick={() => (editingId === item.id ? setEditingId(null) : startEdit(item))}>
                  Edit
                </SmallBtn>
                <SmallBtn onClick={() => setPhotosOpenId(photosOpenId === item.id ? null : item.id)}>
                  Photos ({item.item_photos?.length || 0})
                </SmallBtn>
                {item.status !== "sold" && (
                  <SmallBtn dark onClick={() => markSold(item.id)}>
                    Mark sold
                  </SmallBtn>
                )}
                {item.status === "reserved" && <SmallBtn onClick={() => cancelReservation(item.id)}>Cancel hold</SmallBtn>}
                {confirmDeleteId === item.id ? (
                  <SmallBtn danger onClick={() => deleteItem(item.id)}>
                    Confirm delete
                  </SmallBtn>
                ) : (
                  <SmallBtn onClick={() => setConfirmDeleteId(item.id)}>Delete</SmallBtn>
                )}
              </div>

              {photosOpenId === item.id && (
                <div className="mt-3 bg-chalk rounded-lg p-3">
                  <PhotoUploader
                    saleId={sale.id}
                    itemId={item.id}
                    photos={item.item_photos || []}
                    onChange={(photos) =>
                      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, item_photos: photos } : i)))
                    }
                  />
                </div>
              )}

              {editingId === item.id && editForm && (
                <div className="mt-3 bg-chalk rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Name">
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
                      />
                    </Field>
                    <Field label="Price ($)">
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.price}
                        onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Category">
                      <input
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
                      />
                    </Field>
                    <Field label="Reservation minutes">
                      <input
                        type="number"
                        min={1}
                        value={editForm.reservationMinutes}
                        onChange={(e) => setEditForm({ ...editForm, reservationMinutes: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
                      />
                    </Field>
                  </div>
                  <Field label="Icon (emoji fallback)">
                    <input
                      value={editForm.icon}
                      onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
                    />
                  </Field>
                  <Field label="Status">
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
                    >
                      <option value="available">available</option>
                      <option value="reserved">reserved</option>
                      <option value="sold">sold</option>
                    </select>
                  </Field>
                  <button
                    onClick={() => saveEdit(item.id)}
                    className="bg-grass text-white font-bold px-4 py-2 rounded-lg text-sm"
                  >
                    Save changes
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Stat({ num, label }: { num: number | string; label: string }) {
  return (
    <div className="bg-white border-2 border-cardboard-dark rounded-lg px-3 py-2.5">
      <div className="font-mono font-bold text-lg">{num}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-60 font-semibold">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border-2 border-cardboard-dark rounded-xl p-4 mb-4">
      <h3 className="text-sm font-bold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <label className="block text-xs font-bold opacity-70 mb-1">{label}</label>
      {children}
    </div>
  );
}

function SmallBtn({
  children,
  onClick,
  dark,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  dark?: boolean;
  danger?: boolean;
}) {
  const cls = danger
    ? "bg-marker text-white"
    : dark
    ? "bg-ink text-chalk"
    : "border-2 border-cardboard-dark bg-white";
  return (
    <button onClick={onClick} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${cls}`}>
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: Item["status"] }) {
  const map = {
    available: "text-grass-dark",
    reserved: "text-amber",
    sold: "text-marker",
  };
  return <span className={`font-bold ${map[status]}`}>{status}</span>;
}

function Thumb({ item }: { item: Item }) {
  const first = item.item_photos?.[0];
  if (first) {
    return (
      <img
        src={photoUrl(first.storage_path)}
        alt=""
        className="w-11 h-11 object-cover rounded-lg border-2 border-cardboard-dark flex-shrink-0"
      />
    );
  }
  return <div className="w-11 h-11 flex items-center justify-center text-2xl flex-shrink-0">{item.icon}</div>;
}
