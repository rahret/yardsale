"use client";

import { useState } from "react";
import { money } from "@/lib/utils";
import { SOURCE_LABELS } from "@/lib/share";
import { LockedBadge, UpgradeNote } from "@/components/PlanOptions";
import { busiestDay, dayLabel, pct, printedShare, type SaleStats, type StatsDay } from "@/lib/saleStats";

/** The seller's stats page for one sale. */
export default function SaleStatsView({
  saleId,
  saleName,
  stats,
}: {
  saleId: string;
  saleName: string;
  stats: SaleStats | null;
}) {
  return (
    <div className="p-5 max-w-3xl">
      <a href={`/dashboard/sales/${saleId}`} className="text-sm opacity-60 hover:opacity-90">
        ← {saleName}
      </a>
      <h1 className="text-xl font-bold mt-1">📊 Stats</h1>
      <p className="text-sm opacity-70 mb-4">
        How buyers found your sale and what caught their eye. Your own visits aren&apos;t counted, and each visit is one
        person&apos;s browsing session.
      </p>

      {!stats ? (
        <p className="text-sm text-marker font-semibold">
          Couldn&apos;t load your stats. Refresh the page to try again.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
            <Tile label="Visits" value={stats.visits} />
            <Tile label="Items sold" value={`${stats.items_sold} / ${stats.items}`} />
            <Tile label="Collected" value={money(Number(stats.revenue) || 0)} />
            <Tile label="Item views" value={stats.item_views} locked={stats.locked} />
            <Tile label="Holds placed" value={stats.holds} locked={stats.locked} />
            <Tile
              label="Bought online"
              value={stats.locked ? 0 : `${stats.orders} · ${money(stats.online_cents / 100)}`}
              locked={stats.locked}
            />
          </div>

          {stats.locked ? (
            <div className="bg-white border-2 border-cardboard-dark rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold">Visits by day, where buyers came from, most viewed items</span>
                <LockedBadge />
              </div>
              <UpgradeNote>
                See which signs, flyers and posts bring buyers in, and which items they look at most, with Pro or the
                Sale Pass.
              </UpgradeNote>
            </div>
          ) : (
            <>
              <VisitsByDay days={stats.days || []} />
              <Sources sources={stats.sources || []} />
              <TopItems items={stats.top_items || []} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, locked = false }: { label: string; value: string | number; locked?: boolean }) {
  return (
    <div className="bg-white border-2 border-cardboard-dark rounded-lg px-3 py-2.5">
      <div className="font-mono font-bold text-lg">{locked ? <span className="opacity-40">🔒</span> : value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-60 font-semibold">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border-2 border-cardboard-dark rounded-xl p-4 mb-4">
      <h2 className="text-sm font-bold mb-3">{title}</h2>
      {children}
    </section>
  );
}

/** Visits per day as bars (one series), with holds and orders in the tooltip
 * and the table view. */
function VisitsByDay({ days }: { days: StatsDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...days.map((d) => d.visits));
  const best = busiestDay(days);
  const shown = hover !== null ? days[hover] : null;

  return (
    <Card title="Visits by day">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <p className="text-xs opacity-70">
          {best ? `Busiest: ${dayLabel(best.day)} with ${best.visits} visit${best.visits === 1 ? "" : "s"}.` : "No visits yet."}
        </p>
        <button type="button" onClick={() => setAsTable((t) => !t)} className="text-xs font-bold underline">
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs opacity-60">
                <th className="py-1 pr-3 font-semibold">Day</th>
                <th className="py-1 pr-3 font-semibold text-right">Visits</th>
                <th className="py-1 pr-3 font-semibold text-right">Holds</th>
                <th className="py-1 font-semibold text-right">Bought online</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.day} className="border-t border-chalk-dim">
                  <td className="py-1 pr-3">{dayLabel(d.day)}</td>
                  <td className="py-1 pr-3 text-right font-mono">{d.visits}</td>
                  <td className="py-1 pr-3 text-right font-mono">{d.holds}</td>
                  <td className="py-1 text-right font-mono">{d.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          {/* tooltip: fixed above the plot so it never covers the bars */}
          <div className="h-5 text-xs mb-1" aria-live="polite">
            {shown && (
              <span>
                <strong>{dayLabel(shown.day)}</strong> · {shown.visits} visit{shown.visits === 1 ? "" : "s"} ·{" "}
                {shown.holds} hold{shown.holds === 1 ? "" : "s"} · {shown.orders} bought online
              </span>
            )}
          </div>
          <div className="flex">
            <div className="flex flex-col justify-between text-[10px] opacity-60 pr-1.5 h-36 font-mono text-right">
              <span>{max}</span>
              <span>0</span>
            </div>
            <div
              className="flex-1 h-36 flex items-end gap-[2px] border-b border-l border-cardboard-dark/30"
              onMouseLeave={() => setHover(null)}
              role="img"
              aria-label={`Visits per day over the last ${days.length} days`}
            >
              {days.map((d, i) => (
                <button
                  key={d.day}
                  type="button"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onClick={() => setHover(i)}
                  aria-label={`${dayLabel(d.day)}: ${d.visits} visits`}
                  className="flex-1 h-full flex items-end group"
                >
                  <span
                    className={`w-full rounded-t-[4px] ${hover === i ? "bg-grass-dark" : "bg-grass"}`}
                    style={{ height: d.visits ? `${Math.max(2, (d.visits / max) * 100)}%` : "0%" }}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between text-[10px] opacity-60 mt-1 pl-6">
            <span>{days[0] && dayLabel(days[0].day, { month: "short", day: "numeric" })}</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function Sources({ sources }: { sources: { src: string; visits: number }[] }) {
  const { printed, total } = printedShare(sources);
  const max = Math.max(1, ...sources.map((s) => Number(s.visits)));
  return (
    <Card title="Where buyers came from">
      {total === 0 ? (
        <p className="text-sm opacity-60">No visits yet.</p>
      ) : (
        <>
          <p className="text-xs opacity-70 mb-3">
            {pct(printed, total)}% came from something you printed (signs, price tags, flyers).
          </p>
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.src} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span>{SOURCE_LABELS[s.src] ?? s.src}</span>
                  <span className="font-mono font-bold">
                    {s.visits} <span className="font-normal opacity-60">· {pct(Number(s.visits), total)}%</span>
                  </span>
                </div>
                <div className="h-2 bg-chalk rounded-full mt-1">
                  <div className="h-2 bg-grass rounded-full" style={{ width: `${(Number(s.visits) / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function TopItems({ items }: { items: NonNullable<SaleStats["top_items"]> }) {
  const max = Math.max(1, ...items.map((i) => Number(i.views)));
  return (
    <Card title="Most viewed items">
      {items.length === 0 ? (
        <p className="text-sm opacity-60">No item views yet. They&apos;re counted when a buyer opens an item.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((i, n) => (
            <li key={i.id} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span className="opacity-50 font-mono mr-1.5">{n + 1}.</span>
                  {i.name} <span className="opacity-60">· {money(Number(i.price))}</span>
                  {i.status === "sold" && <span className="ml-1.5 text-marker font-bold text-xs">sold</span>}
                  {i.status === "reserved" && <span className="ml-1.5 text-amber font-bold text-xs">on hold</span>}
                </span>
                <span className="font-mono font-bold shrink-0">
                  {i.views} <span className="font-normal opacity-60">view{Number(i.views) === 1 ? "" : "s"}</span>
                </span>
              </div>
              <div className="h-2 bg-chalk rounded-full mt-1">
                <div className="h-2 bg-grass rounded-full" style={{ width: `${(Number(i.views) / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
