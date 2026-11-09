/** Thin-line chevrons for collapsible sections (drawn here, so they're crisp
 * at any size and take the text colour). */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** One chevron: up = the section is open (tap to collapse), down = collapsed. */
export function ChevronIcon({ up, className = "w-7 h-7" }: { up: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE} aria-hidden>
      <path d={up ? "M5.5 15l6.5-6.5 6.5 6.5" : "M5.5 9l6.5 6.5 6.5-6.5"} />
    </svg>
  );
}

/** Two stacked chevrons: pointing apart = expand all, together = collapse all. */
export function ChevronPairIcon({ apart, className = "w-5 h-5" }: { apart: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE} aria-hidden>
      {apart ? (
        <>
          <path d="M6.5 9.5L12 4l5.5 5.5" />
          <path d="M6.5 14.5L12 20l5.5-5.5" />
        </>
      ) : (
        <>
          <path d="M6.5 3.5L12 9l5.5-5.5" />
          <path d="M6.5 20.5L12 15l5.5 5.5" />
        </>
      )}
    </svg>
  );
}
