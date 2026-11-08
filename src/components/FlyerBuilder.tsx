"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import FitText from "@/components/FitText";
import { Chip, Row, Section, Segmented } from "@/components/BuilderControls";
import { LETTER_NO_MARGIN_CSS, usePrintJob } from "@/components/usePrintJob";
import { DEFAULT_FLYER, flyerBlocks, normalizeFlyer, type FlyerBlock, type FlyerDesign } from "@/lib/flyerDesign";
import { FLYER_LAYOUTS, perSheet, slotBox } from "@/lib/printSheets";
import { TITLE_MAX, TITLE_PRESETS } from "@/lib/signDesign";

/** Design and print handout flyers for one sale: title, sale name, tagline,
 * dates, address, categories and a QR code to the sale page. No photos. */
export default function FlyerBuilder({
  saleId,
  qrUrl,
  sale,
  dateLines,
  categories,
}: {
  saleId: string;
  qrUrl: string;
  sale: { name: string; tagline: string | null; street: string; city: string };
  dateLines: string[];
  categories: string[];
}) {
  const storageKey = `flyer:${saleId}`;
  const [design, setDesign] = useState<FlyerDesign>(DEFAULT_FLYER);
  const { printRoot, printing, print } = usePrintJob();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setDesign(normalizeFlyer(JSON.parse(saved)));
    } catch {}
  }, [storageKey]);

  function update(patch: Partial<FlyerDesign>) {
    setDesign((d) => {
      const next = normalizeFlyer({ ...d, ...patch });
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const blocks = flyerBlocks(design, sale, dateLines, categories);
  const page = <FlyerPage design={design} blocks={blocks} qrUrl={qrUrl} />;

  return (
    <div className="p-5">
      <a href={`/dashboard/sales/${saleId}#share`} className="text-sm opacity-60 hover:opacity-90">
        ← {sale.name}
      </a>
      <h1 className="text-xl font-bold mt-1">📄 Flyer</h1>
      <p className="text-sm opacity-70 mb-4">
        Hand out flyers, pin them on notice boards or leave them with neighbours. The QR code opens your sale page
        with all the photos and prices.
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr] items-start">
        <div className="bg-white border-2 border-cardboard-dark rounded-xl p-4 space-y-4">
          <Section title="Title">
            <input
              value={design.title}
              maxLength={TITLE_MAX}
              onChange={(e) => update({ title: e.target.value })}
              className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg font-bold uppercase"
              aria-label="Flyer title"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {TITLE_PRESETS.map((t) => (
                <Chip key={t} active={design.title.toUpperCase() === t} onClick={() => update({ title: t })}>
                  {t}
                </Chip>
              ))}
            </div>
            <Row label="Colour">
              <Segmented
                value={design.color}
                options={["black", "red", "blue"]}
                labels={{ black: "⚫ Black", red: "🔴 Red", blue: "🔵 Blue" }}
                onChange={(v) => update({ color: v })}
              />
            </Row>
          </Section>

          <Section title="Include">
            <div className="space-y-1.5 text-sm">
              <Check checked={design.showName} onChange={(v) => update({ showName: v })}>
                Sale name <span className="opacity-60">({sale.name || "none yet"})</span>
              </Check>
              <Check checked={design.showTagline} onChange={(v) => update({ showTagline: v })}>
                Tagline
              </Check>
              {design.showTagline && !sale.tagline?.trim() && (
                <p className="text-[11px] text-marker font-semibold ml-6">Your sale has no tagline yet — add one in Sale details.</p>
              )}
              <Check checked={design.showDates} onChange={(v) => update({ showDates: v })}>
                Dates &amp; times
              </Check>
              <Check checked={design.showCategories} onChange={(v) => update({ showCategories: v })}>
                Top categories
                {categories.length ? <span className="opacity-60"> ({categories.join(", ")})</span> : null}
              </Check>
              <Check checked={design.qr} onChange={(v) => update({ qr: v })}>
                QR code to your sale page
              </Check>
            </div>
          </Section>

          <Section title="Address">
            <Segmented
              value={design.address}
              options={["off", "street", "full"]}
              labels={{ off: "Off", street: "Street", full: "Street + city" }}
              onChange={(v) => update({ address: v })}
            />
            {!sale.street?.trim() && design.address !== "off" && (
              <p className="text-[11px] text-marker font-semibold mt-1">Add your address in Sale details to show it.</p>
            )}
          </Section>

          <Section title="Paper">
            <Segmented
              value={design.layout}
              options={["quarter", "full"]}
              labels={{ quarter: "4 per sheet", full: "1 per sheet" }}
              onChange={(v) => update({ layout: v })}
            />
          </Section>

          <button type="button" onClick={() => update(DEFAULT_FLYER)} className="text-xs font-semibold underline opacity-60">
            Start over
          </button>
        </div>

        <div className="order-first lg:order-none lg:sticky lg:top-4">
          <div
            className="bg-white border-2 border-cardboard-dark rounded-lg shadow-tag mx-auto overflow-hidden relative"
            style={{ aspectRatio: "8.5 / 11", maxWidth: "min(100%, 520px)" }}
            aria-label="Flyer preview"
          >
            {page}
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button type="button" onClick={print} className="bg-grass text-white font-bold px-5 py-2.5 rounded-lg shadow-tag">
              🖨️ Print flyer{design.layout === "quarter" ? "s" : ""}
            </button>
            <span className="text-xs opacity-60">
              {design.layout === "quarter" ? "Cut along the dashed lines. " : ""}Print at 100% scale with no margins.
            </span>
          </div>
        </div>
      </div>

      {printRoot &&
        printing &&
        createPortal(
          <>
            <style>{LETTER_NO_MARGIN_CSS}</style>
            <div className="print-stage" aria-hidden>
              <div className="print-page">{page}</div>
            </div>
          </>,
          printRoot
        )}
    </div>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** A full Letter page holding one flyer, or four with dashed cut lines. */
function FlyerPage({ design, blocks, qrUrl }: { design: FlyerDesign; blocks: FlyerBlock[]; qrUrl: string }) {
  const layout = FLYER_LAYOUTS.find((l) => l.key === design.layout) ?? FLYER_LAYOUTS[0];
  return (
    <div className="absolute inset-0 bg-white text-black">
      {Array.from({ length: perSheet(layout) }, (_, i) => {
        const box = slotBox(layout, i);
        return (
          <div
            key={i}
            className="absolute"
            style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
          >
            <Flyer blocks={blocks} qrUrl={qrUrl} />
          </div>
        );
      })}
      {layout.cutLines && (
        <>
          <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-black/40" aria-hidden />
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-black/40" aria-hidden />
        </>
      )}
    </div>
  );
}

function Flyer({ blocks, qrUrl }: { blocks: FlyerBlock[]; qrUrl: string }) {
  return (
    <div className="w-full h-full flex flex-col" style={{ padding: "7% 8%", gap: "2.5%" }}>
      {blocks.map((b) => (
        <div key={b.kind} className="min-h-0" style={{ flex: b.weight }}>
          <Block block={b} qrUrl={qrUrl} />
        </div>
      ))}
    </div>
  );
}

function Block({ block, qrUrl }: { block: FlyerBlock; qrUrl: string }) {
  switch (block.kind) {
    case "title":
      return (
        <div className="w-full h-full" style={{ color: block.color }}>
          <FitText lines={[block.text]} fontWeight={900} fill wrap />
        </div>
      );
    case "name":
      return <FitText lines={[block.text]} fontWeight={700} fill wrap />;
    case "tagline":
      return (
        <div className="w-full h-full italic">
          <FitText lines={[block.text]} fontWeight={500} fill wrap />
        </div>
      );
    case "dates":
      return <FitText lines={block.lines} fontWeight={700} fill />;
    case "address":
      return <FitText lines={[`📍 ${block.text}`]} fontWeight={600} fill wrap />;
    case "categories":
      return <FitText lines={[block.text]} fontWeight={500} fill wrap />;
    case "qr":
      return (
        <div className="w-full h-full flex flex-col items-center" style={{ gap: "4%" }}>
          <div className="min-h-0 flex-1 aspect-square">
            <QRCodeSVG value={qrUrl} style={{ width: "100%", height: "100%" }} />
          </div>
          <div className="w-full" style={{ height: "12%" }}>
            <FitText lines={["Scan for photos & prices"]} fontWeight={600} fill />
          </div>
        </div>
      );
  }
}
