"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_METHODS, type Item, type Order, type SellMode, type Sale, type SaleDay, type SaleStatus, type SavedLocation } from "@/lib/types";
import { PAYMENT_LABELS, paymentMethodsFromProfile } from "@/lib/saleInfo";
import { EMOJI_PRESETS, ITEM_SELECT, formatAddress, formatPhone, formatSignSaleDay, isBulkItem, money, siteOrigin, sortSaleDays } from "@/lib/utils";
import PhotoUploader, { photoUrl } from "@/components/PhotoUploader";
import FitText from "@/components/FitText";
import ShareSaleCard from "@/components/ShareSaleCard";
import BuyNowCard from "@/components/BuyNowCard";
import { MIN_CHARGE_CENTS, toCents } from "@/lib/fees";

const MAX_SALE_DAYS = 7;
const MAX_FEATURED = 3;
const NOTE_MAX = 120;

type DayRow = { key: string; date: string; start_time: string; end_time: string };

// Sale times are picked by the hour only, so stored times are snapped to "HH:00".
const toHour = (t: string) => `${t.slice(0, 2)}:00`;

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: `${String(h).padStart(2, "0")}:00`,
  label: `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`,
}));

function toDayRows(days: SaleDay[]): DayRow[] {
  return sortSaleDays(days).map((d) => ({
    key: d.id,
    date: d.date,
    start_time: toHour(d.start_time),
    end_time: toHour(d.end_time),
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
  sellMode: "in_person" as SellMode,
};

export default function SaleAdmin({
  sale: initialSale,
  initialItems,
  initialSavedLocations,
  initialSaleDays,
  profilePaymentOptions,
  payoutsReady = false,
  initialOrders = [],
}: {
  sale: Sale;
  initialItems: Item[];
  initialSavedLocations: SavedLocation[];
  initialSaleDays: SaleDay[];
  /** Payment options from the seller's Account page, used to pre-tick methods. */
  profilePaymentOptions?: Record<string, unknown> | null;
  /** The seller's Stripe account can take payments. */
  payoutsReady?: boolean;
  initialOrders?: Order[];
}) {
  const [sale, setSale] = useState<Sale>(initialSale);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [form, setForm] = useState(emptyForm);
  const [addError, setAddError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [editError, setEditError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [photosOpenId, setPhotosOpenId] = useState<string | null>(null);
  const [saleModal, setSaleModal] = useState<{ item: Item; mode: "sell" | "restock" } | null>(null);
  const [saleForm, setSaleForm] = useState({
    name: sale.name,
    tagline: sale.tagline,
    street: sale.street || "",
    city: sale.city || "",
    state: sale.state || "",
    zip: sale.zip || "",
    default_reservation_minutes: String(sale.default_reservation_minutes),
    accepted_payments:
      sale.accepted_payments?.length > 0 ? sale.accepted_payments : paymentMethodsFromProfile(profilePaymentOptions),
  });
  const [note, setNote] = useState(sale.note || "");
  const [noteStatus, setNoteStatus] = useState("");
  const [savingSale, setSavingSale] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(initialSavedLocations);
  const [locationLabel, setLocationLabel] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [dayRows, setDayRows] = useState<DayRow[]>(toDayRows(initialSaleDays));
  const [printJob, setPrintJob] = useState<"qr" | "sign" | null>(null);
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);

  const siteUrl = siteOrigin(typeof window !== "undefined" ? window.location.origin : "");
  const shareUrl = `${siteUrl}/s/${sale.slug}`;
  // printed QR codes / signs are tagged so visits from them can be counted
  const qrUrl = `${shareUrl}?src=qr`;

  const sortedDayRows = useMemo(
    () => [...dayRows].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date)),
    [dayRows]
  );

  // Print content is portaled onto <body> (outside the app's layout tree) so
  // printing it doesn't leave the rest of the (visually hidden but still
  // space-occupying) dashboard page around to generate extra blank pages.
  useEffect(() => {
    let el = document.getElementById("print-root");
    if (!el) {
      el = document.createElement("div");
      el.id = "print-root";
      document.body.appendChild(el);
    }
    setPrintRoot(el);
  }, []);

  useEffect(() => {
    if (!printJob) return;
    // Wait for web fonts so the sign's fit-to-width text is measured with the
    // real font before the print dialog snapshots the page.
    let t: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (!cancelled) t = setTimeout(() => window.print(), 60);
    });
    function onAfterPrint() {
      setPrintJob(null);
    }
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [printJob]);

  const featuredCount = items.filter((i) => i.featured && i.status !== "sold").length;

  const stats = useMemo(() => {
    const revenue = items.reduce((s, i) => s + (Number(i.revenue) || 0), 0);
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
      street: saleForm.street.trim(),
      city: saleForm.city.trim(),
      state: saleForm.state.trim(),
      zip: saleForm.zip.trim(),
      default_reservation_minutes: Number(saleForm.default_reservation_minutes) || 30,
      timezone: browserTimeZone() ?? sale.timezone,
      accepted_payments: PAYMENT_METHODS.filter((m) => saleForm.accepted_payments.includes(m)),
    };
    const { data, error } = await supabase.from("sales").update(patch).eq("id", sale.id).select().single();
    if (error) setSaveError(error.message);

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
    setSaleForm((prev) => ({ ...prev, street: loc.street, city: loc.city, state: loc.state, zip: loc.zip }));
  }

  async function saveCurrentLocation() {
    const street = saleForm.street.trim();
    if (!street) return;
    setLocationError("");
    setSavingLocation(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("saved_locations")
      .insert({
        owner_id: sale.owner_id,
        label: locationLabel.trim(),
        street,
        city: saleForm.city.trim(),
        state: saleForm.state.trim(),
        zip: saleForm.zip.trim(),
      })
      .select()
      .single();
    setSavingLocation(false);
    if (error) {
      setLocationError(error.message);
      return;
    }
    if (data) {
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
    const { data, error } = await supabase
      .from("sales")
      .update({ status, timezone: browserTimeZone() ?? sale.timezone })
      .eq("id", sale.id)
      .select()
      .single();
    if (!error && data) setSale(data);
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setAddError("");
    const sellMode: SellMode = form.isBulk ? "in_person" : form.sellMode;
    const modeError = sellModeError(sellMode, form.price, payoutsReady);
    if (modeError) {
      setAddError(modeError);
      return;
    }
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
        reservation_minutes: sellMode === "hold" && !form.isBulk && form.reservationMinutes ? Number(form.reservationMinutes) : null,
        icon: form.icon || "📦",
        quantity_total: quantityTotal,
        quantity_available: quantityTotal,
        sell_mode: sellMode,
      })
      .select(ITEM_SELECT)
      .single();
    if (error) {
      setAddError(error.message);
      return;
    }
    setItems((prev) => [data, ...prev]);
    // keep the Buy Now / Hold choice for the next item
    setForm({ ...emptyForm, sellMode: form.sellMode });
  }

  function startEdit(item: Item) {
    setEditError("");
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
      sellMode: item.sell_mode ?? "hold",
      quantityTotal: String(bulk ? item.quantity_total : 2),
      quantityAvailable: String(item.quantity_available),
    });
  }

  async function saveEdit(id: string) {
    const supabase = createClient();
    const isBulk = editForm.isBulk;
    const sellMode: SellMode = isBulk ? "in_person" : editForm.sellMode;
    const modeError = sellModeError(sellMode, editForm.price, payoutsReady, items.find((i) => i.id === id)?.sell_mode);
    if (modeError) {
      setEditError(modeError);
      return;
    }
    setEditError("");
    const quantityTotal = isBulk ? Math.max(2, Number(editForm.quantityTotal) || 2) : 1;
    const quantityAvailable = isBulk
      ? Math.min(quantityTotal, Math.max(0, Number(editForm.quantityAvailable) || 0))
      : 1;
    const patch: Record<string, unknown> = {
      name: editForm.name.trim(),
      price: Number(editForm.price) || 0,
      category: editForm.category.trim() || "Misc",
      description: editForm.description,
      reservation_minutes: isBulk || sellMode !== "hold" ? null : editForm.reservationMinutes ? Number(editForm.reservationMinutes) : null,
      sell_mode: sellMode,
      icon: editForm.icon || "📦",
      quantity_total: quantityTotal,
      quantity_available: quantityAvailable,
    };
    if (!isBulk) patch.status = editForm.status;
    const { data, error } = await supabase
      .from("items")
      .update(patch)
      .eq("id", id)
      .select(ITEM_SELECT)
      .single();
    if (error || !data) {
      setEditError(error?.message || "Couldn't save — try again.");
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === id ? data : i)));
    setEditingId(null);
  }

  async function confirmSaleModal(price: number, qty: number) {
    if (!saleModal) return;
    const { item, mode } = saleModal;
    const supabase = createClient();
    if (mode === "restock") {
      const { data, error } = await supabase.rpc("restock_bulk_item", {
        p_item_id: item.id,
        p_qty: qty,
        p_unit_price: price,
      });
      if (!error && data) setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...data } : i)));
    } else if (isBulkItem(item)) {
      const { data, error } = await supabase.rpc("record_bulk_sale", {
        p_item_id: item.id,
        p_qty: qty,
        p_unit_price: price,
      });
      if (!error && data) setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...data } : i)));
    } else {
      const { data, error } = await supabase
        .from("items")
        .update({ status: "sold", sold_at: new Date().toISOString(), revenue: price })
        .eq("id", item.id)
        .select(ITEM_SELECT)
        .single();
      if (!error && data) setItems((prev) => prev.map((i) => (i.id === item.id ? data : i)));
    }
    setSaleModal(null);
  }

  async function restockItem(id: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("items")
      .update({
        status: "available",
        sold_at: null,
        revenue: 0,
        reserved_at: null,
      })
      .eq("id", id)
      .select(ITEM_SELECT)
      .single();
    if (!error && data) setItems((prev) => prev.map((i) => (i.id === id ? data : i)));
  }

  async function cancelReservation(id: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("items")
      .update({ status: "available", reserved_at: null })
      .eq("id", id)
      .select(ITEM_SELECT)
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

  async function reloadItems() {
    const { data } = await createClient()
      .from("items")
      .select(ITEM_SELECT)
      .eq("sale_id", sale.id)
      .order("created_at", { ascending: false });
    if (data) setItems(data);
  }

  async function saveNote() {
    const { data, error } = await createClient()
      .from("sales")
      .update({ note: note.trim().slice(0, NOTE_MAX) })
      .eq("id", sale.id)
      .select()
      .single();
    if (error || !data) {
      setNoteStatus("Couldn't save — try again.");
      return;
    }
    setSale(data);
    setNote(data.note);
    setNoteStatus(data.note ? "Posted to your sale page." : "Note cleared.");
  }

  async function toggleFeatured(item: Item) {
    const { data, error } = await createClient()
      .from("items")
      .update({ featured: !item.featured })
      .eq("id", item.id)
      .select(ITEM_SELECT)
      .single();
    if (!error && data) setItems((prev) => prev.map((i) => (i.id === item.id ? data : i)));
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

      {/* note to buyers */}
      <Card title="📣 Note to buyers">
        <div className="text-xs opacity-60 mb-2">
          Shown at the top of your sale page. Change it any time, e.g. &ldquo;Everything half off after noon&rdquo;.
        </div>
        <div className="flex gap-2">
          <input
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteStatus("");
            }}
            placeholder="Fill a bag for $5 after 1pm!"
            className="flex-1 min-w-0 px-3 py-2 border-2 border-cardboard-dark rounded-lg text-sm"
          />
          <button
            onClick={saveNote}
            disabled={note.trim() === (sale.note || "").trim()}
            className="bg-ink text-chalk font-bold px-4 rounded-lg text-sm disabled:opacity-40"
          >
            {note.trim() || !sale.note ? "Post" : "Clear"}
          </button>
        </div>
        <div className="flex justify-between text-[11px] mt-1">
          <span className={noteStatus.startsWith("Couldn") ? "text-marker font-semibold" : "text-grass-dark font-semibold"}>
            {noteStatus}
          </span>
          <span className="opacity-50">
            {note.length}/{NOTE_MAX}
          </span>
        </div>
      </Card>

      {/* online payments */}
      <Card title="💳 Buy Now (online payments)">
        <BuyNowCard
          sale={sale}
          payoutsReady={payoutsReady}
          initialOrders={initialOrders}
          hasBuyNowItems={items.some((i) => i.sell_mode === "buy_now")}
          onItemsChanged={reloadItems}
        />
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
            <QRCodeCanvas value={qrUrl} size={120} fgColor="#33312E" />
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
        <ShareSaleCard sale={sale} items={items} days={sortedDayRows} onSaleChange={setSale} />
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
        <Field label="Street address">
          <input
            value={saleForm.street}
            onChange={(e) => setSaleForm({ ...saleForm, street: e.target.value })}
            placeholder="123 Main St"
            className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
          />
        </Field>
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
          <Field label="City">
            <input
              value={saleForm.city}
              onChange={(e) => setSaleForm({ ...saleForm, city: e.target.value })}
              placeholder="Springfield"
              className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
            />
          </Field>
          <Field label="State">
            <input
              value={saleForm.state}
              onChange={(e) => setSaleForm({ ...saleForm, state: e.target.value })}
              placeholder="IL"
              maxLength={2}
              className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
            />
          </Field>
          <Field label="ZIP">
            <input
              value={saleForm.zip}
              onChange={(e) => setSaleForm({ ...saleForm, zip: e.target.value })}
              placeholder="62704"
              className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
            />
          </Field>
        </div>

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
                    title={formatAddress(loc)}
                  >
                    {loc.label || formatAddress(loc)}
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
            disabled={savingLocation || !saleForm.street.trim()}
            className="border-2 border-cardboard-dark bg-white font-bold px-3 rounded-lg text-sm disabled:opacity-50"
          >
            {savingLocation ? "Saving…" : "💾 Save location"}
          </button>
        </div>
        {locationError && <div className="text-marker text-xs font-semibold mb-2.5">{locationError}</div>}

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
                <select
                  value={day.start_time}
                  onChange={(e) => updateDay(day.key, { start_time: e.target.value })}
                  className="w-[110px] px-2 py-2 border-2 border-cardboard-dark rounded-lg text-sm bg-white"
                >
                  {HOUR_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs opacity-60">to</span>
                <select
                  value={day.end_time}
                  onChange={(e) => updateDay(day.key, { end_time: e.target.value })}
                  className="w-[110px] px-2 py-2 border-2 border-cardboard-dark rounded-lg text-sm bg-white"
                >
                  {HOUR_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
        <Field label="Payment methods shown to buyers">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {PAYMENT_METHODS.map((m) => (
              <label key={m} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={saleForm.accepted_payments.includes(m)}
                  onChange={(e) =>
                    setSaleForm({
                      ...saleForm,
                      accepted_payments: e.target.checked
                        ? [...saleForm.accepted_payments, m]
                        : saleForm.accepted_payments.filter((x) => x !== m),
                    })
                  }
                />
                {PAYMENT_LABELS[m].icon} {PAYMENT_LABELS[m].label}
              </label>
            ))}
          </div>
          <div className="text-[11px] opacity-50 mt-1">
            Buyers see only these names, never your handles.
            {!(sale.accepted_payments?.length > 0) && " Pre-ticked from your Account page — save to show them."}
          </div>
        </Field>
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
            ) : form.sellMode !== "hold" ? null : (
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
          {!form.isBulk && (
            <SellModePicker
              value={form.sellMode}
              onChange={(sellMode) => setForm({ ...form, sellMode })}
              payoutsReady={payoutsReady}
              price={form.price}
            />
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
                    {!isBulkItem(item) && <> · {SELL_MODE_LABELS[item.sell_mode] ?? SELL_MODE_LABELS.hold}</>}
                    {item.status === "reserved" && item.item_holds && (
                      <>
                        {" "}
                        · held by {item.item_holds.name} ·{" "}
                        <a href={`tel:${item.item_holds.phone}`} className="underline">
                          {formatPhone(item.item_holds.phone)}
                        </a>
                      </>
                    )}
                    {isBulkItem(item) && (
                      <>
                        {" "}
                        · {item.quantity_available}/{item.quantity_total} left
                      </>
                    )}
                    {Number(item.revenue) > 0 && <> · {money(item.revenue)} collected</>}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap mt-2">
                <SmallBtn
                  onClick={() => toggleFeatured(item)}
                  disabled={!item.featured && featuredCount >= MAX_FEATURED}
                >
                  {item.featured ? "★ Featured" : "☆ Feature"}
                </SmallBtn>
                <SmallBtn onClick={() => (editingId === item.id ? setEditingId(null) : startEdit(item))}>
                  Edit
                </SmallBtn>
                <SmallBtn onClick={() => setPhotosOpenId(photosOpenId === item.id ? null : item.id)}>
                  Photos ({item.item_photos?.length || 0})
                </SmallBtn>
                {!isBulkItem(item) && item.status !== "sold" && (
                  <SmallBtn dark onClick={() => setSaleModal({ item, mode: "sell" })}>
                    Mark sold
                  </SmallBtn>
                )}
                {!isBulkItem(item) && item.status === "sold" && (
                  <SmallBtn onClick={() => restockItem(item.id)}>Restock</SmallBtn>
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
              {isBulkItem(item) && (
                <BulkQuantityControls
                  item={item}
                  onRecordSale={() => setSaleModal({ item, mode: "sell" })}
                  onRestock={() => setSaleModal({ item, mode: "restock" })}
                />
              )}

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
                    {!editForm.isBulk && editForm.sellMode === "hold" && (
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
                  {!editForm.isBulk && (
                    <SellModePicker
                      value={editForm.sellMode}
                      onChange={(sellMode) => setEditForm({ ...editForm, sellMode })}
                      payoutsReady={payoutsReady}
                      price={editForm.price}
                      currentMode={item.sell_mode}
                    />
                  )}
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
                  {editError && <div className="text-marker text-sm font-semibold mb-2">{editError}</div>}
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

      {saleModal && (
        <SalePriceOverlay
          item={saleModal.item}
          mode={saleModal.mode}
          onConfirm={confirmSaleModal}
          onCancel={() => setSaleModal(null)}
        />
      )}

      {printRoot &&
        printJob === "qr" &&
        createPortal(
          <div className="hidden print:flex items-center justify-center w-full h-full">
            {/* SVG (not canvas) so it scales losslessly to whatever page size is
                picked in Print Setup — sized relative to the printable page
                itself (vw/vh), not a fixed inch value, so it always fills most
                of the sheet on Letter, A4, A5, labels, etc. */}
            <QRCodeSVG
              value={qrUrl}
              fgColor="#000000"
              style={{ width: "min(90vw, 90vh)", height: "min(90vw, 90vh)" }}
            />
          </div>,
          printRoot
        )}

      {printRoot &&
        printJob === "sign" &&
        createPortal(
          <div className="hidden print:flex flex-col w-full h-full p-4 gap-[2vw]">
            {/* Title, address, and dates/times each render at the largest size
                that fits their width on one line (see FitText). The QR code and
                the details column each take ~half the width, with a small gap. */}
            <FitText lines={["YARD SALE"]} fontWeight={800} />
            <div className="flex flex-1 w-full items-center gap-[4%] min-h-0">
              <div className="w-[48%] h-full flex items-center justify-center min-h-0">
                <QRCodeSVG value={qrUrl} fgColor="#000000" style={{ width: "100%", height: "100%" }} />
              </div>
              <div className="w-[48%] flex flex-col items-center justify-center gap-[3vw]">
                {sale.street && <FitText lines={[sale.street]} />}
                {sortedDayRows.length > 0 ? (
                  <FitText lines={sortedDayRows.map(formatSignSaleDay)} />
                ) : (
                  <FitText lines={["Dates & times coming soon"]} className="opacity-60" />
                )}
              </div>
            </div>
          </div>,
          printRoot
        )}
    </div>
  );
}

const SELL_MODE_LABELS: Record<SellMode, string> = {
  in_person: "🏃 First come, first served",
  hold: "✋ Hold",
  buy_now: "💳 Buy Now",
};

/** Why an item can't be set to Buy Now, or "" if it can. An item that is
 * already Buy Now can keep it (so editing other fields never fails). */
function sellModeError(mode: SellMode, price: string, payoutsReady: boolean, currentMode?: SellMode): string {
  if (mode !== "buy_now") return "";
  if (!payoutsReady && currentMode !== "buy_now") return "Set up payouts on your Account page to use Buy Now.";
  if (toCents(Number(price) || 0) < MIN_CHARGE_CENTS) {
    return `Buy Now needs a price of at least ${money(MIN_CHARGE_CENTS / 100)} — use Hold for cheaper items.`;
  }
  return "";
}

/** "How buyers get it": first come, first served; Hold (reserve, pay in
 * person); or Buy Now (pay online). Exactly one per item. */
function SellModePicker({
  value,
  onChange,
  payoutsReady,
  price,
  currentMode,
}: {
  value: SellMode;
  onChange: (mode: SellMode) => void;
  payoutsReady: boolean;
  price: string;
  currentMode?: SellMode;
}) {
  const buyNowBlocked = !payoutsReady && currentMode !== "buy_now";
  const tooCheap = price !== "" && toCents(Number(price) || 0) < MIN_CHARGE_CENTS;
  const option = (mode: SellMode, title: string, hint: string, disabled = false) => (
    <label
      className={`flex items-start gap-2 border-2 rounded-lg px-3 py-2 cursor-pointer ${
        value === mode ? "border-ink bg-chalk" : "border-cardboard-dark/50 bg-white"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <input
        type="radio"
        className="mt-1"
        checked={value === mode}
        disabled={disabled}
        onChange={() => onChange(mode)}
      />
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-[11px] opacity-60">{hint}</span>
      </span>
    </label>
  );
  return (
    <div className="mb-2.5">
      <div className="text-xs font-bold opacity-70 mb-1">How buyers get it</div>
      <div className="grid gap-2 sm:grid-cols-3">
        {option("in_person", SELL_MODE_LABELS.in_person, "No holds or online payment — buyers just show up")}
        {option("hold", SELL_MODE_LABELS.hold, "Buyer reserves it, pays you in person")}
        {option("buy_now", SELL_MODE_LABELS.buy_now, "Buyer pays online, picks up with a code", buyNowBlocked)}
      </div>
      {buyNowBlocked && (
        <div className="text-[11px] opacity-60 mt-1">
          To use Buy Now,{" "}
          <a href="/dashboard/account" className="underline">
            set up payouts on your Account page
          </a>
          .
        </div>
      )}
      {value === "buy_now" && tooCheap && (
        <div className="text-[11px] text-marker font-semibold mt-1">
          Buy Now needs a price of at least {money(MIN_CHARGE_CENTS / 100)}.
        </div>
      )}
    </div>
  );
}

/** The seller's IANA time zone, used to tell buyers when a sale is "happening now". */
function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
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
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  dark?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const cls = danger
    ? "bg-marker text-white"
    : dark
    ? "bg-ink text-chalk"
    : "border-2 border-cardboard-dark bg-white";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-40 ${cls}`}
    >
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
  onRecordSale,
  onRestock,
}: {
  item: Item;
  onRecordSale: () => void;
  onRestock: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-2 bg-chalk rounded-lg p-2">
      <span className="text-xs font-bold opacity-70 mr-1">
        {item.quantity_available} / {item.quantity_total} left
      </span>
      <SmallBtn dark onClick={onRecordSale} disabled={item.quantity_available <= 0}>
        Record sale
      </SmallBtn>
      <SmallBtn onClick={onRestock} disabled={item.quantity_available >= item.quantity_total}>
        Restock
      </SmallBtn>
    </div>
  );
}

function SalePriceOverlay({
  item,
  mode,
  onConfirm,
  onCancel,
}: {
  item: Item;
  mode: "sell" | "restock";
  onConfirm: (price: number, qty: number) => void;
  onCancel: () => void;
}) {
  const bulk = isBulkItem(item);
  const restock = mode === "restock";
  const unitsSold = item.quantity_total - item.quantity_available;
  const maxQty = restock ? Math.max(1, unitsSold) : Math.max(1, item.quantity_available);
  const [price, setPrice] = useState(String(item.price));
  const [qty, setQty] = useState("1");

  function confirm() {
    const p = Math.max(0, Number(price) || 0);
    const q = bulk ? Math.min(maxQty, Math.max(1, Number(qty) || 1)) : 1;
    onConfirm(p, q);
  }

  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div
        className="bg-white border-2 border-cardboard-dark rounded-xl p-4 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold mb-3">
          {restock ? "↩️ Restock" : "💰 Record sale"} — {item.name}
        </h3>
        <Field label={restock ? "Price to reverse ($)" : "Sale price ($)"}>
          <input
            type="number"
            min={0}
            step="0.01"
            autoFocus
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirm()}
            className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg"
          />
          <div className="text-[11px] opacity-50 mt-1">List price is {money(item.price)}.</div>
        </Field>
        {bulk && (
          <Field
            label={restock ? `Quantity to restock (${unitsSold} sold)` : `Quantity sold (${item.quantity_available} available)`}
          >
            <div className="flex items-center gap-2">
              <SmallBtn onClick={() => setQty(String(Math.max(1, (Number(qty) || 1) - 1)))}>−</SmallBtn>
              <input
                type="number"
                min={1}
                max={maxQty}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-20 px-3 py-2 border-2 border-cardboard-dark rounded-lg text-center"
              />
              <SmallBtn onClick={() => setQty(String(Math.min(maxQty, (Number(qty) || 1) + 1)))}>+</SmallBtn>
            </div>
          </Field>
        )}
        <div className="flex gap-2 mt-3">
          <button onClick={confirm} className="bg-grass text-white font-bold px-4 py-2 rounded-lg text-sm flex-1">
            {restock ? "Confirm restock" : "Confirm sale"}
          </button>
          <button
            onClick={onCancel}
            className="border-2 border-cardboard-dark bg-white font-bold px-4 py-2 rounded-lg text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
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
