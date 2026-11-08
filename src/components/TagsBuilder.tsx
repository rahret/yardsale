"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import FitText from "@/components/FitText";
import { Row, Section, Segmented } from "@/components/BuilderControls";
import { LETTER_NO_MARGIN_CSS, usePrintJob } from "@/components/usePrintJob";
import { TAG_LAYOUTS, paginate, perSheet, slotBox, tagPrice, type SheetLayout } from "@/lib/printSheets";

export interface TagItem {
  id: string;
  name: string;
  price: number;
  bulk: boolean;
  /** The item's page, for the QR code. */
  url: string;
}

interface TagSettings {
  layout: string;
  qr: boolean;
  /** Items left off (so items added later are included by default). */
  skipped: string[];
  /** Labels already used on the first sheet (Avery sheets are often part-used). */
  startAt: number;
}

const DEFAULTS: TagSettings = { layout: TAG_LAYOUTS[0].key, qr: true, skipped: [], startAt: 0 };

function normalize(raw: unknown): TagSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const layout = TAG_LAYOUTS.find((l) => l.key === r.layout) ?? TAG_LAYOUTS[0];
  return {
    layout: layout.key,
    qr: typeof r.qr === "boolean" ? r.qr : DEFAULTS.qr,
    skipped: Array.isArray(r.skipped) ? r.skipped.filter((s): s is string => typeof s === "string") : [],
    startAt: Math.max(0, Math.min(perSheet(layout) - 1, Math.floor(Number(r.startAt) || 0))),
  };
}

/** Pick items and print stick-on or cut-out price tags, each with the item's
 * name, price and (optionally) a QR code to its page. */
export default function TagsBuilder({ saleId, saleName, items }: { saleId: string; saleName: string; items: TagItem[] }) {
  const storageKey = `tags:${saleId}`;
  const [settings, setSettings] = useState<TagSettings>(DEFAULTS);
  const { printRoot, printing, print } = usePrintJob();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setSettings(normalize(JSON.parse(saved)));
    } catch {}
  }, [storageKey]);

  function update(patch: Partial<TagSettings>) {
    setSettings((s) => {
      const next = normalize({ ...s, ...patch });
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const layout = TAG_LAYOUTS.find((l) => l.key === settings.layout) ?? TAG_LAYOUTS[0];
  const skipped = useMemo(() => new Set(settings.skipped), [settings.skipped]);
  const chosen = items.filter((i) => !skipped.has(i.id));
  // blank slots first, for labels already peeled off the first sheet
  const slots: (TagItem | null)[] = [...Array(settings.startAt).fill(null), ...chosen];
  const pages = chosen.length ? paginate(slots, layout) : [];

  function toggle(id: string) {
    update({ skipped: skipped.has(id) ? settings.skipped.filter((s) => s !== id) : [...settings.skipped, id] });
  }

  return (
    <div className="p-5">
      <a href={`/dashboard/sales/${saleId}#share`} className="text-sm opacity-60 hover:opacity-90">
        ← {saleName}
      </a>
      <h1 className="text-xl font-bold mt-1">🏷️ Price tags</h1>
      <p className="text-sm opacity-70 mb-4">
        Print a tag for each item, on Avery label sheets or plain paper. The QR code opens that item&apos;s page, so
        buyers can see more photos or hold it.
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr] items-start">
        <div className="bg-white border-2 border-cardboard-dark rounded-xl p-4 space-y-4">
          <Section title="Paper">
            <div className="space-y-1.5" role="radiogroup">
              {TAG_LAYOUTS.map((l) => (
                <label key={l.key} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="layout"
                    className="mt-1"
                    checked={settings.layout === l.key}
                    onChange={() => update({ layout: l.key, startAt: 0 })}
                  />
                  {l.label}
                </label>
              ))}
            </div>
            {!layout.cutLines && (
              <Row label="Start at">
                <select
                  value={settings.startAt}
                  onChange={(e) => update({ startAt: Number(e.target.value) })}
                  className="px-2 py-1 border-2 border-cardboard-dark rounded-lg text-xs font-bold bg-white"
                  aria-label="First label to print on"
                >
                  {Array.from({ length: perSheet(layout) }, (_, i) => (
                    <option key={i} value={i}>
                      Label {i + 1}
                      {i === 0 ? " (full sheet)" : ""}
                    </option>
                  ))}
                </select>
              </Row>
            )}
          </Section>

          <Section title="QR code">
            <Segmented
              value={settings.qr ? "on" : "off"}
              options={["on", "off"]}
              labels={{ on: "On", off: "Off" }}
              onChange={(v) => update({ qr: v === "on" })}
            />
          </Section>

          <Section title={`Items (${chosen.length} of ${items.length})`}>
            {items.length === 0 ? (
              <p className="text-sm opacity-60">Add some items to your sale first.</p>
            ) : (
              <>
                <div className="flex gap-3 text-xs font-semibold mb-1.5">
                  <button type="button" className="underline" onClick={() => update({ skipped: [] })}>
                    Select all
                  </button>
                  <button type="button" className="underline" onClick={() => update({ skipped: items.map((i) => i.id) })}>
                    None
                  </button>
                </div>
                <ul className="max-h-80 overflow-y-auto divide-y divide-cardboard-dark/20 border-2 border-cardboard-dark/40 rounded-lg">
                  {items.map((i) => (
                    <li key={i.id}>
                      <label className="flex items-center gap-2 px-2 py-1.5 text-sm">
                        <input type="checkbox" checked={!skipped.has(i.id)} onChange={() => toggle(i.id)} />
                        <span className="flex-1 min-w-0 truncate">{i.name}</span>
                        <span className="font-bold text-xs whitespace-nowrap">{tagPrice(i.price, i.bulk)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>
        </div>

        <div className="order-first lg:order-none lg:sticky lg:top-4">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <button
              type="button"
              onClick={print}
              disabled={!chosen.length}
              className="bg-grass text-white font-bold px-5 py-2.5 rounded-lg shadow-tag disabled:opacity-50"
            >
              🖨️ Print {chosen.length} tag{chosen.length === 1 ? "" : "s"}
            </button>
            <span className="text-xs opacity-60">
              {pages.length} sheet{pages.length === 1 ? "" : "s"}. In the print dialog, set scale to 100% (not
              &ldquo;fit to page&rdquo;) and margins to none. Try one sheet on plain paper first and hold it up to a
              label sheet to check it lines up.
            </span>
          </div>
          <div className="space-y-4 lg:max-h-[80vh] lg:overflow-y-auto pb-2">
            {pages.length === 0 ? (
              <div
                className="bg-white border-2 border-cardboard-dark rounded-lg mx-auto flex items-center justify-center text-sm opacity-60"
                style={{ aspectRatio: "8.5 / 11", maxWidth: "min(100%, 520px)" }}
              >
                No items selected
              </div>
            ) : (
              pages.map((page, p) => (
                <div
                  key={p}
                  className="bg-white border-2 border-cardboard-dark rounded-lg shadow-tag mx-auto overflow-hidden relative"
                  style={{ aspectRatio: "8.5 / 11", maxWidth: "min(100%, 520px)" }}
                  aria-label={`Sheet ${p + 1} preview`}
                >
                  <TagPage layout={layout} tags={page} qr={settings.qr} preview />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {printRoot &&
        printing &&
        createPortal(
          <>
            <style>{LETTER_NO_MARGIN_CSS}</style>
            <div className="print-stage" aria-hidden>
              {pages.map((page, p) => (
                <div key={p} className="print-page">
                  <TagPage layout={layout} tags={page} qr={settings.qr} />
                </div>
              ))}
            </div>
          </>,
          printRoot
        )}
    </div>
  );
}

/** One sheet of tags; slots are positioned as percentages of the page. */
function TagPage({
  layout,
  tags,
  qr,
  preview = false,
}: {
  layout: SheetLayout;
  tags: (TagItem | null)[];
  qr: boolean;
  preview?: boolean;
}) {
  return (
    <div className="absolute inset-0 text-black">
      {Array.from({ length: perSheet(layout) }, (_, i) => {
        const tag = tags[i];
        const box = slotBox(layout, i);
        // show empty label outlines on screen so the sheet is recognisable
        if (!tag && !(preview && !layout.cutLines)) return null;
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${box.left}%`,
              top: `${box.top}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
              border: layout.cutLines
                ? "1px dashed rgba(0,0,0,0.45)"
                : preview
                  ? "1px solid rgba(0,0,0,0.12)"
                  : undefined,
              borderRadius: !layout.cutLines && preview ? "6%/15%" : undefined,
            }}
          >
            {tag && <Tag tag={tag} qr={qr} />}
          </div>
        );
      })}
    </div>
  );
}

/** One tag: QR code on the left (if on), name above a big price. */
function Tag({ tag, qr }: { tag: TagItem; qr: boolean }) {
  return (
    <div className="w-full h-full flex items-stretch" style={{ padding: "4% 4%", gap: "3%" }}>
      {qr && (
        <div className="h-full aspect-square shrink-0">
          <QRCodeSVG value={tag.url} level="L" style={{ width: "100%", height: "100%" }} />
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col" style={{ gap: "4%" }}>
        <div className="min-h-0" style={{ flex: 1.2 }}>
          <FitText lines={[tag.name]} fontWeight={600} fill wrap />
        </div>
        <div className="min-h-0" style={{ flex: 1 }}>
          <FitText lines={[tagPrice(tag.price, tag.bulk)]} fontWeight={800} fill />
        </div>
      </div>
    </div>
  );
}
