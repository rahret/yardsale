"use client";

import { QRCodeSVG } from "qrcode.react";
import FitText from "@/components/FitText";
import {
  ARROW_WEIGHT,
  COLORS,
  DETAIL_WEIGHT,
  QR_WEIGHT,
  QR_WIDTH,
  TITLE_WEIGHT,
  type Arrow,
  type SignDesign,
} from "@/lib/signDesign";

/** One printed sign, top to bottom: title, arrow (with its note), then the
 * QR code and the address / dates / extra line. Landscape puts the QR code
 * beside the text; portrait puts it below. Every size is a share of the
 * sheet, so the same component draws the on-screen preview and the printed
 * page, whatever paper size is chosen. */
export default function SignSheet({
  design,
  qrUrl,
  address,
  dates,
  extra,
  landscape,
}: {
  design: SignDesign;
  qrUrl: string;
  address: string | null;
  dates: string[] | null;
  extra: string | null;
  /** The sign's own shape (a half-sheet of portrait paper is landscape). */
  landscape: boolean;
}) {
  const color = COLORS[design.color];
  const details: { key: string; lines: string[]; weight: number; bold?: boolean }[] = [];
  if (address) details.push({ key: "address", lines: [address], weight: DETAIL_WEIGHT[design.address], bold: true });
  if (dates) details.push({ key: "dates", lines: dates, weight: DETAIL_WEIGHT[design.dates] * (dates.length > 1 ? 1.5 : 1) });
  if (extra) details.push({ key: "extra", lines: [extra], weight: 0.8 });
  const detailsWeight = details.reduce((n, d) => n + d.weight, 0) * 1.3;
  const showQr = design.qr !== "off";

  const detailLines = details.map((d) => (
    <div key={d.key} className="min-h-0" style={{ flex: d.weight }}>
      <FitText lines={d.lines} fontWeight={d.bold ? 800 : 700} fill />
    </div>
  ));
  const qr = (
    <div className="min-h-0 h-full w-full flex flex-col items-center justify-center">
      <div className="min-h-0 w-full flex-1">
        <QRCodeSVG value={qrUrl} fgColor="#000000" style={{ width: "100%", height: "100%" }} />
      </div>
      {design.qrCaption && (
        <div className="w-full" style={{ height: "13%" }}>
          <FitText lines={["Scan for photos & prices"]} fontWeight={700} fill />
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-white text-black overflow-hidden" style={{ padding: "3%", gap: "2.5%" }}>
      <div className="min-h-0" style={{ flex: TITLE_WEIGHT[design.titleSize], color }}>
        <FitText lines={[design.title.toUpperCase()]} fontWeight={900} fill />
      </div>

      {design.arrow !== "none" && (
        <div className="min-h-0 flex flex-col" style={{ flex: ARROW_WEIGHT[design.arrowSize], color }}>
          <div className="min-h-0 w-full flex-1">
            <ArrowShape direction={design.arrow} />
          </div>
          {design.arrowNote.trim() && (
            <div className="w-full min-h-0" style={{ height: "30%" }}>
              <FitText lines={[design.arrowNote.trim()]} fontWeight={800} fill />
            </div>
          )}
        </div>
      )}

      {landscape && (showQr || details.length > 0) && (
        <div
          className="min-h-0 flex items-stretch"
          style={{ flex: Math.max(showQr ? QR_WEIGHT[design.qr] : 0, detailsWeight), gap: "3%" }}
        >
          {showQr && (
            <div className="min-h-0" style={{ width: details.length ? `${QR_WIDTH[design.qr] * 100}%` : "100%", flexShrink: 0 }}>
              {qr}
            </div>
          )}
          {details.length > 0 && (
            <div className="min-h-0 flex-1 flex flex-col justify-center" style={{ gap: "5%" }}>
              {detailLines}
            </div>
          )}
        </div>
      )}

      {!landscape && details.length > 0 && (
        <div className="min-h-0 flex flex-col" style={{ flex: detailsWeight, gap: "4%" }}>
          {detailLines}
        </div>
      )}
      {!landscape && showQr && (
        <div className="min-h-0 flex justify-center" style={{ flex: QR_WEIGHT[design.qr] }}>
          <div className="h-full" style={{ aspectRatio: design.qrCaption ? "0.87" : "1" }}>
            {qr}
          </div>
        </div>
      )}
    </div>
  );
}

/** A bold block arrow, as wide as its box allows. */
function ArrowShape({ direction }: { direction: Exclude<Arrow, "none"> }) {
  const label = `Arrow pointing ${direction === "up" ? "straight ahead" : direction}`;
  if (direction === "up") {
    return (
      <svg viewBox="0 0 60 100" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }} role="img" aria-label={label}>
        <polygon points="30,2 58,40 40,40 40,98 20,98 20,40 2,40" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", display: "block" }} role="img" aria-label={label}>
      <g transform={direction === "left" ? "rotate(180 50 18)" : undefined}>
        <polygon points="2,11 70,11 70,2 98,18 70,34 70,25 2,25" fill="currentColor" />
      </g>
    </svg>
  );
}
