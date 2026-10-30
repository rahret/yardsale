"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { HOUR_OPTIONS } from "@/lib/hours";
import { randomSuffix, slugify } from "@/lib/utils";

type Day = { date: string; start: string; end: string };

const STEPS = ["Name your sale", "Where is it?", "When is it?"] as const;
const INPUT = "w-full px-3 py-2.5 border-2 border-cardboard-dark rounded-lg";

function nextSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Three quick steps that create a seller's first sale (as a draft), then
 * hand them to the sale page, where the Getting started checklist takes over. */
export default function WelcomeWizard({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(displayName ? `${displayName}'s Yard Sale` : "");
  const [tagline, setTagline] = useState("");
  const [address, setAddress] = useState({ street: "", city: "", state: "", zip: "" });
  const [days, setDays] = useState<Day[]>([{ date: nextSaturday(), start: "08:00", end: "14:00" }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function next() {
    setError("");
    if (step === 0 && !name.trim()) return setError("Give your sale a name.");
    if (step === 1 && !address.street.trim()) return setError("Add a street address so buyers can find you.");
    setStep((s) => s + 1);
  }

  async function finish() {
    setError("");
    const valid = days.filter((d) => d.date);
    if (valid.length === 0) return setError("Pick at least one day.");
    if (valid.some((d) => d.end <= d.start)) return setError("Each day needs to end after it starts.");
    if (new Set(valid.map((d) => d.date)).size !== valid.length) return setError("Each day can only be listed once.");

    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return setError("You're signed out — please log in again.");
    }
    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .insert({
        owner_id: user.id,
        slug: `${slugify(name) || "sale"}-${randomSuffix(4)}`,
        name: name.trim().slice(0, 50),
        tagline: tagline.trim().slice(0, 75),
        street: address.street.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        zip: address.zip.trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      })
      .select()
      .single();
    if (saleError || !sale) {
      setSaving(false);
      return setError(saleError?.message || "Couldn't create your sale — try again.");
    }
    await supabase
      .from("sale_days")
      .insert(valid.map((d) => ({ sale_id: sale.id, date: d.date, start_time: d.start, end_time: d.end })));
    // place the address on the map (for buyer search) in the background
    fetch(`/api/sales/${sale.id}/geocode`, { method: "POST" }).catch(() => {});
    router.push(`/dashboard/sales/${sale.id}?welcome=1`);
  }

  return (
    <div className="p-5">
      <div className="text-sm opacity-60">{displayName ? `Welcome, ${displayName}!` : "Welcome!"}</div>
      <h1 className="font-marker text-3xl text-marker -rotate-1 mt-1 mb-4">Let&apos;s set up your yard sale</h1>

      <ol className="flex gap-2 mb-5" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-grass" : "bg-cardboard/50"}`} />
            <div className={`text-[11px] font-bold mt-1 ${i === step ? "" : "opacity-50"}`}>
              {i + 1}. {label}
            </div>
          </li>
        ))}
      </ol>

      <div className="bg-white border-2 border-cardboard-dark rounded-xl p-5 shadow-tag">
        {step === 0 && (
          <>
            <label className="block text-xs font-bold opacity-70 mb-1">Sale name</label>
            <input
              autoFocus
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Big Driveway Sale"
              className={INPUT}
            />
            <label className="block text-xs font-bold opacity-70 mb-1 mt-3">A short line about it (optional)</label>
            <input
              value={tagline}
              maxLength={75}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Furniture, tools, kids' clothes — everything must go"
              className={INPUT}
            />
            <p className="text-xs opacity-60 mt-3">You can change these any time.</p>
          </>
        )}

        {step === 1 && (
          <>
            <label className="block text-xs font-bold opacity-70 mb-1">Street address</label>
            <input
              autoFocus
              value={address.street}
              onChange={(e) => setAddress({ ...address, street: e.target.value })}
              placeholder="123 Maple St"
              autoComplete="address-line1"
              className={INPUT}
            />
            <div className="grid grid-cols-[1fr_70px_90px] gap-2 mt-2">
              <input
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
                placeholder="City"
                autoComplete="address-level2"
                className={INPUT}
              />
              <input
                value={address.state}
                onChange={(e) => setAddress({ ...address, state: e.target.value })}
                placeholder="State"
                autoComplete="address-level1"
                className={INPUT}
              />
              <input
                value={address.zip}
                onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                placeholder="ZIP"
                autoComplete="postal-code"
                inputMode="numeric"
                className={INPUT}
              />
            </div>
            <p className="text-xs opacity-60 mt-3">
              Your sale page shows the full address. Link previews and the Buyers search show only the street name.
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-2">
              {days.map((d, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1.5 border-2 border-cardboard/50 rounded-lg p-2">
                  <input
                    type="date"
                    aria-label={`Day ${i + 1}`}
                    value={d.date}
                    onChange={(e) => setDays(days.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
                    className="col-span-4 px-2 py-2 border-2 border-cardboard-dark rounded-lg text-sm"
                  />
                  {(["start", "end"] as const).map((k, n) => (
                    <span key={k} className="contents">
                      {n === 1 && <span className="text-xs opacity-60">to</span>}
                      <select
                        aria-label={k === "start" ? "Opens at" : "Closes at"}
                        value={d[k]}
                        onChange={(e) => setDays(days.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                        className="px-2 py-2 border-2 border-cardboard-dark rounded-lg text-sm bg-white"
                      >
                        {HOUR_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </span>
                  ))}
                  {days.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setDays(days.filter((_, j) => j !== i))}
                      aria-label="Remove day"
                      className="text-xs opacity-50 px-1.5"
                    >
                      ✕
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
            {days.length < 3 && (
              <button
                type="button"
                onClick={() => setDays([...days, { ...days[days.length - 1], date: "" }])}
                className="mt-2 border-2 border-cardboard-dark bg-white font-bold px-3 py-1.5 rounded-lg text-xs"
              >
                + Add another day
              </button>
            )}
            <p className="text-xs opacity-60 mt-3">Your sale starts as a draft — only you can see it until you set it Live.</p>
          </>
        )}

        {error && <div className="text-marker text-sm font-semibold mt-3">{error}</div>}

        <div className="flex items-center gap-2 mt-5">
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => s - 1)} className="border-2 border-cardboard-dark px-4 py-2.5 rounded-lg font-semibold">
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="bg-grass text-white font-bold px-5 py-2.5 rounded-lg shadow-tag">
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={saving}
              className="bg-grass text-white font-bold px-5 py-2.5 rounded-lg shadow-tag disabled:opacity-60 whitespace-nowrap"
            >
              {saving ? "Creating…" : "Create my sale"}
            </button>
          )}
          <a href="/dashboard" className="ml-auto text-xs font-semibold opacity-60 underline">
            Skip for now
          </a>
        </div>
      </div>
    </div>
  );
}
