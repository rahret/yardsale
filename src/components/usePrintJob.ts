"use client";

import { useEffect, useState } from "react";

/** Printing a page made of components: gives the element to portal the
 * printout into (#print-root, the only thing shown when printing — see
 * globals.css) and a `print()` that waits for web fonts so fit-to-size text
 * is measured with the real font, then opens the print dialog. */
export function usePrintJob(onPrint?: () => void) {
  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);
  const [printing, setPrinting] = useState(false);

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
    if (!printing) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (!cancelled) t = setTimeout(() => window.print(), 250);
    });
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  return {
    printRoot,
    printing,
    print: () => {
      onPrint?.();
      setPrinting(true);
    },
  };
}

/** Styles for multi-page Letter printouts with no page margins (label sheets
 * need exact positions). Wrap the pages in .print-stage: while the print job
 * is open it sits off-screen at real paper size, so fit-to-size text (which
 * measures its box) is already laid out when the print dialog snapshots it. */
export const LETTER_NO_MARGIN_CSS = `
.print-page { width: 8.5in; height: 11in; position: relative; overflow: hidden; background: #fff; }
@media screen { .print-stage { position: fixed; left: -20000px; top: 0; } }
@media print {
  @page { size: letter portrait; margin: 0; }
  #print-root { height: auto !important; }
  .print-page { break-after: page; page-break-after: always; }
  .print-page:last-child { break-after: auto; page-break-after: auto; }
}`;
