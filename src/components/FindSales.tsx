"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  matchesDates,
  matchesQuery,
  popularCategories,
  type DateFilter,
  type Listing,
} from "@/lib/directory";
import { openStatus, type OpenStatus } from "@/lib/saleInfo";
import { formatSignTime } from "@/lib/utils";
import { shortDate } from "@/lib/share";

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: "any", label: "Any day" },
  { key: "today", label: "Today" },
  { key: "weekend", label: "This weekend" },
  { key: "week", label: "Next 7 days" },
];

/** Buyer search: upcoming listed sales, filtered by place, date and category. */
export default function FindSales({ listings }: { listings: Listing[] }) {
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [category, setCategory] = useState<string | null>(null);
  // the buyer's own date/time, known only in the browser
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const today = now
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    : null;
  const categories = useMemo(() => popularCategories(listings), [listings]);

  const results = listings.filter(
    (l) =>
      matchesQuery(l, query) &&
      (!today || matchesDates(l, dateFilter, today)) &&
      (!category || l.categories.some((c) => c.toLowerCase() === category.toLowerCase()))
  );

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-bold border-2 whitespace-nowrap ${
      active ? "bg-ink text-chalk border-ink" : "bg-white border-cardboard-dark/60"
    }`;

  return (
    <section>
      <div className="pt-4 pb-6">
        <h1 className="font-marker text-4xl sm:text-5xl text-marker -rotate-1 leading-tight">
          Find yard sales near you
        </h1>
        <p className="opacity-70 mt-2">See what&apos;s for sale before you go — photos, prices and what&apos;s left.</p>
      </div>

      <div className="bg-white border-2 border-cardboard-dark rounded-2xl p-4 shadow-tag">
        <label className="sr-only" htmlFor="sale-search">
          ZIP code, city or street
        </label>
        <input
          id="sale-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍  ZIP code, city or street"
          className="w-full px-4 py-3 border-2 border-cardboard-dark rounded-xl text-base"
        />
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
      </div>

      <div className="flex items-baseline justify-between mt-6 mb-3">
        <h2 className="font-bold">
          {results.length} {results.length === 1 ? "sale" : "sales"}
          {query.trim() ? ` matching “${query.trim()}”` : " coming up"}
        </h2>
      </div>

      {results.length === 0 ? (
        <div className="border-2 border-dashed border-cardboard-dark rounded-xl p-8 text-center opacity-80">
          <span className="font-marker text-xl text-marker block mb-2">no sales found</span>
          {listings.length === 0
            ? "No sales are listed yet — check back soon, or list your own below."
            : "Try a nearby ZIP or city, or a different day."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((l) => (
            <SaleCard key={l.slug} listing={l} now={now} />
          ))}
        </div>
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
