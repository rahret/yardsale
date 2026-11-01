"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import SignSheet from "@/components/SignSheet";
import {
  ARROW_NOTE_MAX,
  DEFAULT_DESIGN,
  EXTRA_MAX,
  SIGN_PRESETS,
  TITLE_MAX,
  TITLE_PRESETS,
  normalizeDesign,
  signContent,
  type BlockSize,
  type SignDesign,
} from "@/lib/signDesign";

const SIZE_LABELS: Record<BlockSize, string> = { off: "Off", s: "S", m: "M", l: "L" };

/** Design and print yard signs for one sale: title, arrows, and how big the
 * QR code, address and dates are, with a live preview of the sheet. */
export default function SignBuilder({
  saleId,
  saleName,
  qrUrl,
  sale,
  dateLines,
  categories,
}: {
  saleId: string;
  saleName: string;
  qrUrl: string;
  sale: { street: string; city: string; state: string; tagline: string | null };
  dateLines: string[];
  categories: string[];
}) {
  const storageKey = `sign:${saleId}`;
  const [design, setDesign] = useState<SignDesign>(DEFAULT_DESIGN);
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);
  const [printing, setPrinting] = useState(false);

  // the seller's last design for this sale (this device only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setDesign(normalizeDesign(JSON.parse(saved)));
    } catch {
      // nothing saved, or storage blocked
    }
    let el = document.getElementById("print-root");
    if (!el) {
      el = document.createElement("div");
      el.id = "print-root";
      document.body.appendChild(el);
    }
    setPrintRoot(el);
  }, [storageKey]);

  function update(patch: Partial<SignDesign>) {
    setDesign((d) => {
      const next = normalizeDesign({ ...d, ...patch });
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  useEffect(() => {
    if (!printing) return;
    // wait for web fonts so the fit-to-size text is measured with the real font
    let t: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (!cancelled) t = setTimeout(() => window.print(), 80);
    });
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  function print() {
    try {
      localStorage.setItem(`checklist:${saleId}:printed`, "1");
    } catch {}
    setPrinting(true);
  }

  const content = signContent(design, sale, dateLines, categories);
  const sheet = <Sheet design={design} qrUrl={qrUrl} content={content} />;
  const landscape = design.orientation === "landscape";

  return (
    <div className="p-5">
      <a href={`/dashboard/sales/${saleId}#share`} className="text-sm opacity-60 hover:opacity-90">
        ← {saleName}
      </a>
      <h1 className="text-xl font-bold mt-1">🪧 Sign builder</h1>
      <p className="text-sm opacity-70 mb-4">
        Make a main sign for your yard and arrow signs for nearby corners. Everything resizes to fit the page.
      </p>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        {SIGN_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => update(p.design)}
            className="whitespace-nowrap border-2 border-cardboard-dark bg-white font-bold px-3 py-1.5 rounded-full text-xs"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr] items-start">
        <div className="bg-white border-2 border-cardboard-dark rounded-xl p-4 space-y-4">
          <Section title="Title">
            <input
              value={design.title}
              maxLength={TITLE_MAX}
              onChange={(e) => update({ title: e.target.value })}
              className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg font-bold uppercase"
              aria-label="Sign title"
            />
            <div className="text-[11px] opacity-60 text-right mt-0.5">
              {design.title.length}/{TITLE_MAX}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {TITLE_PRESETS.map((t) => (
                <Chip key={t} active={design.title.toUpperCase() === t} onClick={() => update({ title: t })}>
                  {t}
                </Chip>
              ))}
            </div>
            <Row label="Size">
              <Segmented value={design.titleSize} options={["s", "m", "l"]} onChange={(v) => update({ titleSize: v })} />
            </Row>
            <Row label="Colour">
              <Segmented
                value={design.color}
                options={["black", "red", "blue"]}
                labels={{ black: "⚫ Black", red: "🔴 Red", blue: "🔵 Blue" }}
                onChange={(v) => update({ color: v })}
              />
            </Row>
          </Section>

          <Section title="Arrow">
            <Segmented
              value={design.arrow}
              options={["none", "left", "up", "right"]}
              labels={{ none: "None", left: "⬅️", up: "⬆️", right: "➡️" }}
              onChange={(v) => update({ arrow: v })}
            />
            {design.arrow !== "none" && (
              <>
                <Row label="Size">
                  <Segmented value={design.arrowSize} options={["s", "m", "l"]} onChange={(v) => update({ arrowSize: v })} />
                </Row>
                <input
                  value={design.arrowNote}
                  maxLength={ARROW_NOTE_MAX}
                  onChange={(e) => update({ arrowNote: e.target.value })}
                  placeholder="Under the arrow, e.g. 2 blocks"
                  className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg text-sm mt-2"
                  aria-label="Text under the arrow"
                />
              </>
            )}
          </Section>

          <Section title="QR code">
            <Segmented value={design.qr} options={["off", "s", "m", "l"]} onChange={(v) => update({ qr: v })} />
            {design.qr !== "off" && (
              <label className="flex items-center gap-2 text-sm mt-2">
                <input type="checkbox" checked={design.qrCaption} onChange={(e) => update({ qrCaption: e.target.checked })} />
                &ldquo;Scan for photos &amp; prices&rdquo; underneath
              </label>
            )}
          </Section>

          <Section title="Address">
            <Segmented value={design.address} options={["off", "s", "m", "l"]} onChange={(v) => update({ address: v })} />
            {design.address !== "off" && (
              <Row label="Show">
                <Segmented
                  value={design.addressStyle}
                  options={["street", "full"]}
                  labels={{ street: "Street", full: "Street + city" }}
                  onChange={(v) => update({ addressStyle: v })}
                />
              </Row>
            )}
            {!sale.street?.trim() && design.address !== "off" && (
              <p className="text-[11px] text-marker font-semibold mt-1">Add your address in Sale details to show it.</p>
            )}
          </Section>

          <Section title="Dates & times">
            <Segmented value={design.dates} options={["off", "s", "m", "l"]} onChange={(v) => update({ dates: v })} />
          </Section>

          <Section title="Extra line">
            <Segmented
              value={design.extra}
              options={["none", "tagline", "categories", "custom"]}
              labels={{ none: "None", tagline: "Tagline", categories: "Categories", custom: "Custom" }}
              onChange={(v) => update({ extra: v })}
            />
            {design.extra === "custom" && (
              <input
                value={design.extraText}
                maxLength={EXTRA_MAX}
                onChange={(e) => update({ extraText: e.target.value })}
                placeholder="e.g. Everything $1 after noon!"
                className="w-full px-3 py-2 border-2 border-cardboard-dark rounded-lg text-sm mt-2"
                aria-label="Extra line"
              />
            )}
            {design.extra === "tagline" && !sale.tagline?.trim() && (
              <p className="text-[11px] opacity-60 mt-1">Your sale has no tagline yet — add one in Sale details.</p>
            )}
          </Section>

          <Section title="Paper">
            <Segmented
              value={design.orientation}
              options={["landscape", "portrait"]}
              labels={{ landscape: "Landscape", portrait: "Portrait" }}
              onChange={(v) => update({ orientation: v })}
            />
            <Row label="Per sheet">
              <Segmented
                value={String(design.perSheet) as "1" | "2"}
                options={["1", "2"]}
                labels={{ "1": "1 sign", "2": "2 (cut in half)" }}
                onChange={(v) => update({ perSheet: v === "2" ? 2 : 1 })}
              />
            </Row>
          </Section>

          <button
            type="button"
            onClick={() => update(DEFAULT_DESIGN)}
            className="text-xs font-semibold underline opacity-60"
          >
            Start over
          </button>
        </div>

        {/* on phones the preview comes first, so changes are visible */}
        <div className="order-first lg:order-none lg:sticky lg:top-4">
          <div
            className="bg-white border-2 border-cardboard-dark rounded-lg shadow-tag mx-auto overflow-hidden"
            style={{ aspectRatio: landscape ? "11 / 8.5" : "8.5 / 11", maxWidth: landscape ? "100%" : "min(100%, 520px)" }}
            aria-label="Sign preview"
          >
            {sheet}
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button type="button" onClick={print} className="bg-grass text-white font-bold px-5 py-2.5 rounded-lg shadow-tag">
              🖨️ Print sign
            </button>
            <span className="text-xs opacity-60">
              Tip: print on bright paper or card, and slip it in a sheet protector if rain is likely.
            </span>
          </div>
        </div>
      </div>

      {printRoot &&
        printing &&
        createPortal(
          <>
            <style>{`@media print { @page { size: letter ${design.orientation}; margin: 0.2in; } }`}</style>
            <div className="hidden print:block w-full h-full">{sheet}</div>
          </>,
          printRoot
        )}
    </div>
  );
}

/** The whole sheet of paper: one sign, or two to cut apart. */
function Sheet({
  design,
  qrUrl,
  content,
}: {
  design: SignDesign;
  qrUrl: string;
  content: ReturnType<typeof signContent>;
}) {
  // two to a sheet are stacked, so each half is wider than tall either way
  const landscape = design.orientation === "landscape" || design.perSheet === 2;
  const one = <SignSheet design={design} qrUrl={qrUrl} landscape={landscape} {...content} />;
  if (design.perSheet === 1) return <div className="w-full h-full">{one}</div>;
  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 min-h-0">{one}</div>
      <div className="border-t-2 border-dashed border-black/40" aria-hidden />
      <div className="flex-1 min-h-0">{one}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold opacity-70 mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-xs opacity-60 w-16 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 rounded-full text-[11px] font-bold border-2 ${
        active ? "bg-ink text-chalk border-ink" : "bg-white border-cardboard-dark/60"
      }`}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border-2 border-cardboard-dark overflow-hidden text-xs font-bold" role="radiogroup">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={`px-2.5 py-1.5 ${value === o ? "bg-ink text-chalk" : "bg-white"}`}
        >
          {labels?.[o] ?? SIZE_LABELS[o as BlockSize] ?? o}
        </button>
      ))}
    </div>
  );
}
