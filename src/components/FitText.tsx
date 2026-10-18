"use client";

import { useLayoutEffect, useState } from "react";

const MEASURE_SIZE = 100;
const LINE_GAP = 0.25; // extra space between lines, as a fraction of the font size

type Metrics = { width: number; ascent: number; descent: number };

/** Renders one or more lines of text at the largest size that keeps every
 * line on a single line within the container's width. Lines share one font
 * size (sized by the longest line). Drawn as an SVG scaled to 100% width, so
 * it fits whatever page size is picked in Print Setup. */
export default function FitText({
  lines,
  fontWeight = 600,
  className,
}: {
  lines: string[];
  fontWeight?: number;
  className?: string;
}) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const key = lines.join("\n");

  useLayoutEffect(() => {
    let cancelled = false;
    const family = getComputedStyle(document.body).fontFamily;
    const font = `${fontWeight} ${MEASURE_SIZE}px ${family}`;

    function measure() {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx || cancelled) return;
      ctx.font = font;
      let width = 0;
      let ascent = MEASURE_SIZE * 0.8;
      let descent = MEASURE_SIZE * 0.2;
      for (const line of lines) {
        const m = ctx.measureText(line);
        width = Math.max(width, m.width);
        if (m.fontBoundingBoxAscent) ascent = m.fontBoundingBoxAscent;
        if (m.fontBoundingBoxDescent) descent = m.fontBoundingBoxDescent;
      }
      setMetrics({ width: Math.ceil(width) || 1, ascent, descent });
    }

    measure();
    // Re-measure once the web font has loaded, in case the first pass used a fallback.
    document.fonts?.load(font).then(measure, () => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fontWeight]);

  if (!metrics) return null;

  const lineHeight = metrics.ascent + metrics.descent;
  const step = lineHeight + MEASURE_SIZE * LINE_GAP;
  const height = lineHeight + step * (lines.length - 1);

  return (
    <svg
      viewBox={`0 0 ${metrics.width} ${height}`}
      className={className}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {lines.map((line, i) => (
        <text
          key={i}
          x={metrics.width / 2}
          y={metrics.ascent + step * i}
          textAnchor="middle"
          fontSize={MEASURE_SIZE}
          fontWeight={fontWeight}
          fill="currentColor"
        >
          {line}
        </text>
      ))}
    </svg>
  );
}
