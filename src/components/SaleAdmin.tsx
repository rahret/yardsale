"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { createClient } from "@/lib/supabase/client";
import type { Item, Sale, SaleDay, SaleStatus, SavedLocation } from "@/lib/types";
import { EMOJI_PRESETS, formatSaleDay, isBulkItem, money, siteOrigin, sortSaleDays } from "@/lib/utils";
import PhotoUploader, { photoUrl } from "@/components/PhotoUploader";

const MAX_SALE_DAYS = 7;

type DayRow = { key: string; date: string; start_time: string; end_time: string };

function toDayRows(days: SaleDay[]): DayRow[] {
  return sortSaleDays(days).map((d) => ({
    key: d.id,
    date: d.date,
    start_time: d.start_time.slice(0, 5),
    end_time: d.end_time.slice(0, 5),
  }));
}

const STATUS_OPTIONS: { value: SaleStatus; label: string; hint: string }[] = [
  { value: "draft", label: "Draft", hint: "Only you can see it while you set it up." },
  { value: "live", label: "Live", hint: "Public — buyers can view and reserve items." },
  { value: "ended", label: "Ended", hint: "Public read-only — no new reservations." },
];

const emptyForm = {
  name: "",
  price: "",
  category: "",
  description: "",
  reservationMinutes: "",
  icon: "📦",
  isBulk: false,
  quantity: "",
};

export default function SaleAdmin({
  sale: initialSale,
  initialItems,
  initialSavedLocations,
  initialSaleDays,
}: {
  sale: Sale;
  initialItems: Item[];
  initialSavedLocations: SavedLocation[];
  initialSaleDays: SaleDay[];
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
    default_reservation_minutes: String(sale.default_reservation_minutes),
  });
  const [savingSale, setSavingSale] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(initialSavedLocations);
  const [locationLabel, setLocationLabel] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [dayRows, setDayRows] = useState<DayRow[]>(toDayRows(initialSaleDays));
  const [printJob, setPrintJob] = useState<"qr" | "sign" | null>(null);

  const siteUrl = siteOrigin(typeof window !== "undefined" ? window.location.origin : "");
  const shareUrl = `${siteUrl}/s/${sale.slug}`;

  const sortedDayRows = useMemo(
    () => [...dayRows].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date)),
    [dayRows]
  );

  useEffect(() => {
    if (!printJob) return;
    const t = setTimeout(() => window.print(), 60);
    function onAfterPrint() {
      setPrintJob(null);
    }
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [printJob]);

  const stats = useMemo(() => {
    const unitsSold = (i: Item) =>
      isBulkItem(i) ? i.quantity_total - i.quantity_available : i.status === "sold" ? 1 : 0;
    const revenue = items.reduce((s, i) => s + unitsSold(i) * (Number(i.price) || 0), 0);
    return {
      total: items.length,
      available: items.filter((i) => i.status === "available").length,
      reserved: items.filter((i) => i.status === "reserved").length,
      lowStock: items.filter((i) => i.status === "low_stock").length,
      sold: items.filter((i) => i.status === "sold").length,
      revenue,
    };
  }, [items]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)),
    [items]
  );

  function addDay() {
    setDayRows((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          key: Math.random().toString(36).slice(2),
          date: "",
          start_time: last?.start_time || "09:00",
          end_time: last?.end_time || "14:00",
        },
      ];
    });
  }

  function updateDay(key: string, patch: Partial<DayRow>) {
    setDayRows((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function removeDay(key: string) {
    setDayRows((prev) => prev.filter((d) => d.key !== key));
  }

  async function saveSaleSettings() {
    setSaveError("");
    const validDays = dayRows.filter((d) => d.date && d.start_time && d.end_time);
    const dates = validDays.map((d) => d.date);
    if (new Set(dates).size !== dates.length) {
      setSaveError("Each day can only be listed once — remove the duplicate date.");
      return;
    }

    setSavingSale(true);
    const supabase = createClient();
    const patch = {
      name: saleForm.name.trim().slice(0, 50) || sale.name,
      tagline: saleForm.tagline.trim().slice(0, 75),
      address: saleForm.address.trim(),
      default_reservation_minutes: Number(saleForm.default_reservation_minutes) || 30,
    };
    const { data, error } = await supabase.from("sales").update(patch).eq("id", sale.id).select().single();

    await supabase.from("sale_days").delete().eq("sale_id", sale.id);
    let savedDays: SaleDay[] = [];
    if (validDays.length > 0) {
      const { data: daysData, error: daysError } = await supabase
        .from("sale_days")
        .insert(
          validDays.map((d) => ({
            sale_id: sale.id,
            date: d.date,
            start_time: d.start_time,
            end_time: d.end_time,
          }))
        )
        .select();
      if (daysError) setSaveError(daysError.message);
      savedDays = daysData || [];
    }
    setDayRows(toDayRows(savedDays));

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
    const quantityTotal = form.isBulk ? Math.max(2, Number(form.quantity) || 2) : 1;
    const { data, error } = await supabase
      .from("items")
      .insert({
        sale_id: sale.id,
        name: form.name.trim(),
        price: Number(form.price) || 0,
        category: form.category.trim() || "Misc",
        description: form.description.trim(),
        reservation_minutes: form.isBulk ? null : form.reservationMinutes ? Number(form.reservationMinutes) : null,
        icon: form.icon || "📦",
        quantity_total: quantityTotal,
        quantity_available: quantityTotal,
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
    const bulk = isBulkItem(item);
    setEditForm({
      name: item.name,
      price: String(item.price),
      category: item.category,
      description: item.description,
      reservationMinutes: item.reservation_minutes ? String(item.reservation_minutes) : "",
      icon: item.icon,
      status: item.status === "low_stock" ? "available" : item.status,
      isBulk: bulk,
      quantityTotal: String(bulk ? item.quantity_total : 2),
      quantityAvailable: String(item.quantity_available),
    });
  }

  async function saveEdit(id: string) {
    const supabase = createClient();
    const isBulk = editForm.isBulk;
    const quantityTotal = isBulk ? Math.max(2, Number(editForm.quantityTotal) || 2) : 1;
    const quantityAvailable = isBulk
      ? Math.min(quantityTotal, Math.max(0, Number(editForm.quantityAvailable) || 0))
      : 1;
    const patch: Record<string, unknown> = {
      name: editForm.name.trim(),
      price: Number(editForm.price) || 0,
      category: editForm.category.trim() || "Misc",
      description: editForm.description,
      reservation_minutes: isBulk ? null : editForm.reservationMinutes ? Number(editForm.reservationMinutes) : null,
      icon: editForm.icon || "📦",
      quantity_total: quantityTotal,
      quantity_available: quantityAvailable,
    };
    if (!isBulk) patch.status = editForm.status;
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

  async function adjustQuantity(id: string, delta: number) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("adjust_item_quantity", { p_item_id: id, p_delta: delta });
    if (!error && data) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...data } : i)));
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
      <div className="font-marker text-3xl text-marker -rotate-1 mt-2 mb-5 break-words">{sale.name}</div>

      {/* stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
        <Stat num={stats.total} label="Items" />
        <Stat num={stats.available} label="Available" />
        <Stat num={stats.reserved} label="Reserved" />
        <Stat num={stats.lowStock} label="Low qty" />
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
          <button
            type="button"
            onClick={() => setPrintJob("qr")}
            className="bg-white p-2 rounded-lg border-2 border-cardboard-dark cursor-pointer"
            title="Click to print this QR code"
          >
            <QRCodeCanvas value={shareUrl} size={120} fgColor="#33312E" />
          </button>
          <div className="text-xs opacity-70 flex-1 min-w-[160px]">
            Click the QR code, or use the buttons below, to print it for your signs. It always points to the link
            above.
          </div>
        </div>
        <div className="flex gap-2 flex-wrap mt-3">
          <button
            type="button"
            onClick={() => setPrintJob("qr")}
            className="border-2 border-cardboard-dark bg-white font-bold px-4 py-2 rounded-lg text-sm"
          >
            🖨️ Print QR code
          </button>
          <button
            type="button"
            onClick={() => setPrintJob("sign")}
            className="bg-grass text-white font-bold px-4 py-2 rounded-lg text-sm shadow-tag"
          >
            🪧 Create sign
          </button>
        </div>
      </Card>

      {/* sale settings */}
      <Card title="🏷️ Sale details">
        <Field label="Sale name">
          <input
            value={saleForm.name}
            onChange={(e) => setSaleForm({ ...saleForm, name: e.target.value.slice(0, 50) })}
            maxLength={50}
            className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
          />
          <div className="text-[11px] opacity-50 mt-1 text-right">{saleForm.name.length}/50</div>
        </Field>
        <Field label="Tagline">
          <input
            value={saleForm.tagline}
            onChange={(e) => setSaleForm({ ...saleForm, tagline: e.target.value.slice(0, 75) })}
            maxLength={75}
            className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
          />
          <div className="text-[11px] opacity-50 mt-1 text-right">{saleForm.tagline.length}/75</div>
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

        <div className="mb-2.5">
          <label className="block text-xs font-bold opacity-70 mb-1">Sale days</label>
          {dayRows.length === 0 && <div className="text-xs opacity-60 mb-2">No days added yet.</div>}
          <div className="space-y-2">
            {dayRows.map((day) => (
              <div key={day.key} className="flex gap-1.5 items-center flex-wrap">
                <input
                  type="date"
                  value={day.date}
                  onChange={(e) => updateDay(day.key, { date: e.target.value })}
                  className="flex-1 min-w-[140px] px-2 py-2 border-2 border-cardboard-dark rounded-lg text-sm"
                />
                <input
                  type="time"
                  value={day.start_time}
                  onChange={(e) => updateDay(day.key, { start_time: e.target.value })}
                  className="w-[110px] px-2 py-2 border-2 border-cardboard-dark rounded-lg text-sm"
                />
                <span className="text-xs opacity-60">to</span>
                <input
                  type="time"
                  value={day.end_time}
                  onChange={(e) => updateDay(day.key, { end_time: e.target.value })}
                  className="w-[110px] px-2 py-2 border-2 border-cardboard-dark rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeDay(day.key)}
                  className="text-xs opacity-50 hover:opacity-90 px-1.5"
                  aria-label="Remove day"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addDay}
            disabled={dayRows.length >= MAX_SALE_DAYS}
            className="mt-2 border-2 border-cardboard-dark bg-white font-bold px-3 py-1.5 rounded-lg text-xs disabled:opacity-50"
          >
            + Add a day
          </button>
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
        {saveError && <div className="text-marker text-sm font-semibold mb-2">{saveError}</div>}
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
            {form.isBulk ? (
              <Field label="Starting quantity">
                <input
                  type="number"
                  min={2}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="20"
                  className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
                />
              </Field>
            ) : (
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
            )}
          </div>
          <label className="flex items-center gap-2 text-xs font-bold opacity-80 mb-2.5">
            <input
              type="checkbox"
              checked={form.isBulk}
              onChange={(e) =>
                setForm({ ...form, isBulk: e.target.checked, quantity: e.target.checked ? form.quantity || "2" : "" })
              }
            />
            Sell as a bulk lot (multiple identical items, e.g. 20 books)
          </label>
          {form.isBulk && (
            <div className="text-xs opacity-60 mb-2.5 -mt-1.5">
              Buyers see it&apos;s available (and when it&apos;s running low) but can&apos;t reserve it — bulk items
              are first come, first served.
            </div>
          )}
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
                    {isBulkItem(item) && (
                      <>
                        {" "}
                        · {item.quantity_available}/{item.quantity_total} left
                      </>
                    )}
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
                {!isBulkItem(item) && item.status !== "sold" && (
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
              {isBulkItem(item) && <BulkQuantityControls item={item} onAdjust={adjustQuantity} />}

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
                    {!editForm.isBulk && (
                      <Field label="Reservation minutes">
                        <input
                          type="number"
                          min={1}
                          value={editForm.reservationMinutes}
                          onChange={(e) => setEditForm({ ...editForm, reservationMinutes: e.target.value })}
                          className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
                        />
                      </Field>
                    )}
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
                  <label className="flex items-center gap-2 text-xs font-bold opacity-80">
                    <input
                      type="checkbox"
                      checked={editForm.isBulk}
                      onChange={(e) => setEditForm({ ...editForm, isBulk: e.target.checked })}
                    />
                    Bulk lot (multiple identical items)
                  </label>
                  {editForm.isBulk ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Starting quantity">
                        <input
                          type="number"
                          min={2}
                          value={editForm.quantityTotal}
                          onChange={(e) => setEditForm({ ...editForm, quantityTotal: e.target.value })}
                          className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
                        />
                      </Field>
                      <Field label="Currently available">
                        <input
                          type="number"
                          min={0}
                          value={editForm.quantityAvailable}
                          onChange={(e) => setEditForm({ ...editForm, quantityAvailable: e.target.value })}
                          className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
                        />
                      </Field>
                    </div>
                  ) : (
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
                  )}
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

      {printJob === "qr" && (
        <div className="hidden print:block print-area p-10 text-center">
          <div className="text-3xl font-extrabold mb-6">{sale.name}</div>
          <div className="flex justify-center mb-6">
            <QRCodeCanvas value={shareUrl} size={280} fgColor="#000000" />
          </div>
          <div className="text-xl font-semibold">Scan to see photos &amp; prices</div>
          <div className="text-sm opacity-70 mt-2">{shareUrl}</div>
        </div>
      )}

      {printJob === "sign" && (
        <div className="hidden print:flex print-area p-10 flex-col items-center justify-center text-center gap-5">
          <div className="text-7xl font-extrabold uppercase tracking-wide">Yard Sale</div>
          <div className="text-3xl font-bold">{sale.name}</div>
          {sale.tagline && <div className="text-xl italic opacity-80">{sale.tagline}</div>}
          {sale.address && <div className="text-2xl font-semibold">📍 {sale.address}</div>}
          {sortedDayRows.length > 0 && (
            <div className="text-xl font-semibold space-y-1">
              {sortedDayRows.map((d) => (
                <div key={d.key}>{formatSaleDay(d)}</div>
              ))}
            </div>
          )}
          <QRCodeCanvas value={shareUrl} size={220} fgColor="#000000" />
          <div className="text-lg font-bold">Scan for photos &amp; the full item list!</div>
        </div>
      )}
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
    low_stock: "text-amber",
  };
  const label = status === "low_stock" ? "low quantities" : status;
  return <span className={`font-bold ${map[status]}`}>{label}</span>;
}

function BulkQuantityControls({
  item,
  onAdjust,
}: {
  item: Item;
  onAdjust: (id: string, delta: number) => void;
}) {
  const [n, setN] = useState("1");
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-2 bg-chalk rounded-lg p-2">
      <span className="text-xs font-bold opacity-70 mr-1">
        {item.quantity_available} / {item.quantity_total} left
      </span>
      <SmallBtn onClick={() => onAdjust(item.id, -1)}>− sold 1</SmallBtn>
      <SmallBtn onClick={() => onAdjust(item.id, 1)}>+ restock 1</SmallBtn>
      <input
        type="number"
        min={1}
        value={n}
        onChange={(e) => setN(e.target.value)}
        className="w-16 px-2 py-1.5 border-2 border-cardboard-dark rounded-lg text-xs bg-white"
      />
      <SmallBtn
        dark
        onClick={() => {
          const qty = Math.max(1, Number(n) || 1);
          onAdjust(item.id, -qty);
        }}
      >
        Record sale
      </SmallBtn>
    </div>
  );
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
