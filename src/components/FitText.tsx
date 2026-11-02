"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { bestWrap } from "@/lib/textWrap";

const MEASURE_SIZE = 100;
const LINE_GAP = 0.25; // extra space between lines, as a fraction of the font size

type Metrics = { width: number; ascent: number; descent: number; lines: string[] };

/** Renders one or more lines of text at the largest size that keeps every
 * line on a single line within the container's width. Lines share one font
 * size (sized by the longest line). Drawn as an SVG scaled to 100% width, so
 * it fits whatever page size is picked in Print Setup. With `fill`, it scales
 * to fit both the width and the height of its box; with `wrap` as well, it
 * also chooses where to break the text into lines so it comes out biggest. */
export default function FitText({
  lines,
  fontWeight = 600,
  className,
  fill = false,
  wrap = false,
}: {
  lines: string[];
  fontWeight?: number;
  className?: string;
  /** Fit the parent box's width and height (the parent must have a height),
   * instead of just its width. */
  fill?: boolean;
  /** With fill: break the text into whichever lines make it biggest. */
  wrap?: boolean;
}) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // only the box's shape matters for choosing line breaks
  const [boxRatio, setBoxRatio] = useState<number | null>(null);
  const key = lines.join("\n");
  const wrapping = fill && wrap;

  useLayoutEffect(() => {
    if (!wrapping || !boxRef.current) return;
    const el = boxRef.current;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setBoxRatio(Math.round((width / height) * 50) / 50);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrapping]);

  useLayoutEffect(() => {
    let cancelled = false;
    const family = getComputedStyle(document.body).fontFamily;
    const font = `${fontWeight} ${MEASURE_SIZE}px ${family}`;

    function measure() {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx || cancelled) return;
      ctx.font = font;
      const probe = ctx.measureText(lines.join(" ") || "M");
      const ascent = probe.fontBoundingBoxAscent || MEASURE_SIZE * 0.8;
      const descent = probe.fontBoundingBoxDescent || MEASURE_SIZE * 0.2;
      const lineHeight = ascent + descent;
      const chosen =
        wrapping && boxRatio
          ? bestWrap(
              lines.join(" "),
              (l) => ctx.measureText(l).width,
              { width: boxRatio, height: 1 },
              lineHeight,
              lineHeight + MEASURE_SIZE * LINE_GAP
            )
          : lines;
      const width = Math.max(...chosen.map((l) => ctx.measureText(l).width), 1);
      setMetrics({ width: Math.ceil(width), ascent, descent, lines: chosen });
    }

    measure();
    // Re-measure once the web font has loaded, in case the first pass used a fallback.
    document.fonts?.load(font).then(measure, () => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fontWeight, wrapping, boxRatio]);

  const svg = metrics && (() => {
    const lineHeight = metrics.ascent + metrics.descent;
    const step = lineHeight + MEASURE_SIZE * LINE_GAP;
    const height = lineHeight + step * (metrics.lines.length - 1);
    return (
      <svg
        viewBox={`0 0 ${metrics.width} ${height}`}
        className={className}
        style={fill ? { width: "100%", height: "100%", display: "block" } : { width: "100%", height: "auto", display: "block" }}
      >
        {metrics.lines.map((line, i) => (
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
  })();

  if (!wrapping) return svg || null;
  return (
    <div ref={boxRef} style={{ width: "100%", height: "100%" }}>
      {svg}
    </div>
  );
}
