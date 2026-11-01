"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  RADIUS_OPTIONS,
  dateRange,
  popularCategories,
  type DateFilter,
  type Listing,
} from "@/lib/directory";
import { openStatus, type OpenStatus } from "@/lib/saleInfo";
import { formatSignTime } from "@/lib/utils";
import { shortDate } from "@/lib/share";

// Leaflet needs the browser, so the map loads only on the client.
const SalesMap = dynamic(() => import("@/components/SalesMap"), {
  ssr: false,
  loading: () => <div className="h-[460px] rounded-xl border-2 border-cardboard-dark bg-chalk-dim animate-pulse" />,
});

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: "any", label: "Any day" },
  { key: "today", label: "Today" },
  { key: "weekend", label: "This weekend" },
  { key: "week", label: "Next 7 days" },
];

type Place = { lat: number; lng: number; label: string };

// remembers the buyer's last place on this device, so a return visit shows
// nearby sales straight away
const PLACE_KEY = "find:place";
function savedPlace(): Place | null {
  try {
    const p = JSON.parse(localStorage.getItem(PLACE_KEY) || "null");
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && typeof p.label === "string" ? p : null;
  } catch {
    return null;
  }
}
function rememberPlace(p: Place | null) {
  try {
    if (p) localStorage.setItem(PLACE_KEY, JSON.stringify(p));
    else localStorage.removeItem(PLACE_KEY);
  } catch {
    // private browsing etc. — just don't remember
  }
}

function localToday(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Buyer search: upcoming listed sales near a place (typed, or the buyer's
 * location), by date and category, as a list or a map, a page at a time.
 * Nothing is shown until a place is chosen. */
export default function FindSales() {
  const [placeText, setPlaceText] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [radius, setRadius] = useState<number>(25);
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [category, setCategory] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");

  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState<Date | null>(null); // the buyer's clock, browser only
  const request = useRef(0);

  useEffect(() => {
    const p = savedPlace();
    if (p) {
      setPlace(p);
      if (p.label !== "your location") setPlaceText(p.label);
    }
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const categories = useMemo(() => {
    const list = popularCategories(listings);
    return category && !list.some((c) => c.toLowerCase() === category.toLowerCase()) ? [category, ...list] : list;
  }, [listings, category]);

  async function load(offset: number) {
    if (!place) return;
    const id = ++request.current;
    setLoading(true);
    const params = new URLSearchParams({ offset: String(offset) });
    params.set("lat", String(place.lat));
    params.set("lng", String(place.lng));
    params.set("radius", String(radius));
    const range = dateRange(dateFilter, localToday(new Date()));
    params.set("from", range ? range[0] : localToday(new Date()));
    if (range) params.set("to", range[1]);
    if (category) params.set("category", category);
    try {
      const res = await fetch(`/api/sales/search?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { listings: Listing[]; total: number };
      if (id !== request.current) return; // a newer search started
      setListings((prev) => (offset === 0 ? data.listings : [...prev, ...data.listings]));
      setTotal(data.total);
    } catch {
      if (id === request.current) setNotice("Couldn't load sales — check your connection and try again.");
    }
    if (id === request.current) setLoading(false);
  }

  // search whenever the place or filters change; no place, no results
  useEffect(() => {
    if (!place) {
      request.current++;
      setListings([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, radius, dateFilter, category]);

  async function searchPlace(e: React.FormEvent) {
    e.preventDefault();
    const q = placeText.trim();
    setNotice("");
    if (!q) {
      setNotice("Type a ZIP code, city or address — or use your location.");
      return;
    }
    setLocating(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const c = await res.json();
        choosePlace({ lat: c.lat, lng: c.lng, label: q });
      } else {
        setNotice(`Couldn't find “${q}” — try a ZIP code, or a city and state like “Ankeny, IA”.`);
      }
    } catch {
      setNotice("Couldn't look that up — check your connection and try again.");
    }
    setLocating(false);
  }

  function useMyLocation() {
    setNotice("");
    if (!navigator.geolocation) {
      setNotice("Your browser can't share your location — type a ZIP code or city instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPlaceText("");
        choosePlace({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "your location" });
      },
      () => {
        setLocating(false);
        setNotice("Couldn't get your location — check your browser's permission, or type a ZIP code or city.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
    );
  }

  function choosePlace(p: Place) {
    setPlace(p);
    rememberPlace(p);
  }

  function clearPlace() {
    setPlaceText("");
    setPlace(null);
    rememberPlace(null);
    setNotice("");
  }

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-bold border-2 whitespace-nowrap ${
      active ? "bg-ink text-chalk border-ink" : "bg-white border-cardboard-dark/60"
    }`;

  const heading = place ? `${total} ${total === 1 ? "sale" : "sales"} within ${radius} miles of ${place.label}` : "";

  return (
    <section>
      <div className="pt-4 pb-6">
        <h1 className="font-marker text-4xl sm:text-5xl text-marker -rotate-1 leading-tight">
          Find yard sales near you
        </h1>
        <p className="opacity-70 mt-2">See what&apos;s for sale before you go — photos, prices and what&apos;s left.</p>
      </div>

      <div className="bg-white border-2 border-cardboard-dark rounded-2xl p-4 shadow-tag">
        <form onSubmit={searchPlace} className="flex gap-2">
          <label className="sr-only" htmlFor="place-search">
            ZIP code, city or address
          </label>
          <input
            id="place-search"
            type="search"
            value={placeText}
            onChange={(e) => setPlaceText(e.target.value)}
            placeholder="ZIP, city or address"
            className="flex-1 min-w-0 px-4 py-3 border-2 border-cardboard-dark rounded-xl text-base"
          />
          <button type="submit" disabled={locating} className="bg-ink text-chalk font-bold px-4 rounded-xl text-sm disabled:opacity-60">
            {locating ? "…" : "Search"}
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <button type="button" onClick={useMyLocation} disabled={locating} className={chip(place?.label === "your location")}>
            📍 Use my location
          </button>
          {place && (
            <>
              <label className="flex items-center gap-1.5 text-xs font-bold">
                within
                <select
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="border-2 border-cardboard-dark/60 rounded-full px-2 py-1 bg-white"
                >
                  {RADIUS_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r} miles
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={clearPlace} className="text-xs font-semibold underline opacity-70">
                Clear
              </button>
            </>
          )}
        </div>
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {DATE_FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setDateFilter(f.key)} className={chip(dateFilter === f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        {categories.length > 0 && (
          <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(category === c ? null : c)}
                className={chip(category === c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        {notice && <div className="text-xs font-semibold text-amber mt-2">{notice}</div>}
      </div>

      {!place ? (
        <div className="border-2 border-dashed border-cardboard-dark rounded-xl p-8 text-center mt-6">
          <div className="text-4xl mb-1">📍</div>
          <span className="font-marker text-2xl text-marker block mb-1">Where are you shopping?</span>
          <p className="text-sm opacity-75 max-w-sm mx-auto">
            Enter a ZIP code, city or address, or tap <strong>Use my location</strong>, to see yard sales in your area.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 mt-6 mb-3">
            <h2 className="font-bold" aria-live="polite">
              {loading && listings.length === 0 ? "Searching…" : heading}
            </h2>
            <div className="flex rounded-full border-2 border-cardboard-dark overflow-hidden text-xs font-bold shrink-0">
              {(["list", "map"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`px-3 py-1.5 ${view === v ? "bg-ink text-chalk" : "bg-white"}`}
                >
                  {v === "list" ? "☰ List" : "🗺️ Map"}
                </button>
              ))}
            </div>
          </div>

          {listings.length === 0 && !loading ? (
            <div className="border-2 border-dashed border-cardboard-dark rounded-xl p-8 text-center opacity-80">
              <span className="font-marker text-xl text-marker block mb-2">no sales found</span>
              Try a bigger distance, another day, or a nearby town.
            </div>
          ) : view === "map" ? (
            <SalesMap listings={listings} center={place} />
          ) : (
            <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
              {listings.map((l) => (
                <SaleCard key={l.slug} listing={l} now={now} />
              ))}
            </div>
          )}

          {listings.length < total && (
            <div className="text-center mt-6">
              <button
                type="button"
                onClick={() => load(listings.length)}
                disabled={loading}
                className="border-2 border-cardboard-dark bg-white font-bold px-6 py-2.5 rounded-lg disabled:opacity-60"
              >
                {loading ? "Loading…" : `Show more (${total - listings.length} more)`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SaleCard({ listing: l, now }: { listing: Listing; now: Date | null }) {
  const status: OpenStatus | null = now
    ? openStatus({ status: l.status, timezone: l.timezone }, l.days, now, Intl.DateTimeFormat().resolvedOptions().timeZone)
    : null;
  const first = l.days[0];
  const statusStyle =
    status?.state === "open"
      ? "bg-grass text-white"
      : status?.state === "ended"
        ? "bg-marker text-white"
        : "bg-sun text-ink";

  return (
    <Link
      href={`/s/${l.slug}?src=directory`}
      className="block bg-white border-2 border-cardboard-dark rounded-xl overflow-hidden shadow-tag hover:-translate-y-0.5 transition-transform"
    >
      <div className="relative h-36 bg-chalk-dim flex">
        {l.photos.length > 0 ? (
          l.photos.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="h-full flex-1 min-w-0 object-cover border-r-2 border-white last:border-r-0" />
          ))
        ) : (
          <div className="flex-1 flex items-center justify-center text-5xl">🏷️</div>
        )}
        {status && (
          <span className={`absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full shadow ${statusStyle}`}>
            {status.label}
          </span>
        )}
        {l.distanceMiles != null && (
          <span className="absolute top-2 right-2 text-[11px] font-bold px-2 py-0.5 rounded-full shadow bg-white text-ink">
            {l.distanceMiles < 0.1 ? "nearby" : `${l.distanceMiles.toFixed(1)} mi`}
          </span>
        )}
      </div>
      <div className="p-3.5">
        <div className="font-marker text-xl text-marker leading-tight truncate">{l.name}</div>
        {l.location && <div className="text-sm font-semibold text-grass-dark mt-0.5 truncate">📍 {l.location}</div>}
        <div className="text-xs opacity-75 mt-0.5 font-semibold">
          🗓️ {shortDate(first.date)}, {formatSignTime(first.start_time)}–{formatSignTime(first.end_time)}
          {l.days.length > 1 && ` (+${l.days.length - 1} more day${l.days.length > 2 ? "s" : ""})`}
        </div>
        <div className="text-xs opacity-60 mt-1.5 truncate">
          {[l.categories.join(" · "), `${l.itemCount} item${l.itemCount === 1 ? "" : "s"}`].filter(Boolean).join(" — ")}
        </div>
      </div>
    </Link>
  );
}
