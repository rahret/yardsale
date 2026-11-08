"use client";

/** Small form controls shared by the print builders (signs, price tags, flyers). */

const SIZE_LABELS: Record<string, string> = { off: "Off", s: "S", m: "M", l: "L" };

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold opacity-70 mb-1.5">{title}</div>
      {children}
    </div>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-xs opacity-60 w-16 shrink-0">{label}</span>
      {children}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

export function Segmented<T extends string>({
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
          {labels?.[o] ?? SIZE_LABELS[o] ?? o}
        </button>
      ))}
    </div>
  );
}
