"use client";

export interface ChecklistStep {
  key: string;
  label: string;
  done: boolean;
  /** Where the step's button takes the seller (an anchor on the sale page). */
  href: string;
  action: string;
}

/** "Getting started" for a new sale: ticks itself off as the seller works,
 * and links each open step to the part of the page that finishes it. */
export default function SaleChecklist({
  steps,
  justCreated,
  onDismiss,
}: {
  steps: ChecklistStep[];
  /** Arrived from the welcome wizard. */
  justCreated: boolean;
  onDismiss: () => void;
}) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  return (
    <div className="bg-white border-2 border-grass rounded-xl p-4 mb-4 shadow-tag">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">
            {justCreated ? "🎉 Your sale is created — here's what's next" : "🚀 Getting started"}
          </h3>
          <div className="text-xs opacity-60 mt-0.5">
            {done} of {steps.length} done
          </div>
        </div>
        <button type="button" onClick={onDismiss} className="text-xs font-semibold opacity-60 underline shrink-0">
          Hide
        </button>
      </div>

      <div className="h-1.5 rounded-full bg-cardboard/40 mt-2 mb-3 overflow-hidden">
        <div className="h-full bg-grass transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>

      <ul className="space-y-1.5">
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                s.done ? "bg-grass text-white" : "border-2 border-cardboard-dark"
              }`}
            >
              {s.done ? "✓" : ""}
            </span>
            <span className={`flex-1 ${s.done ? "line-through opacity-50" : s === next ? "font-bold" : ""}`}>
              {s.label}
              <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
            </span>
            {!s.done && (
              <a
                href={s.href}
                className={`text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ${
                  s === next ? "bg-grass text-white" : "border-2 border-cardboard-dark"
                }`}
              >
                {s.action}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
