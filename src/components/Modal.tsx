"use client";

import { useEffect, useRef } from "react";

/** A centered pop-up (bottom sheet on phones). Escape or a click outside
 * closes it unless `locked` (e.g. while a form is submitting). */
export default function Modal({
  title,
  onClose,
  locked = false,
  children,
}: {
  title: string;
  onClose: () => void;
  locked?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !locked && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/50 flex items-end sm:items-center justify-center p-4"
      onClick={() => !locked && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl border-2 border-cardboard-dark shadow-tag w-full max-w-md p-5 outline-none max-h-[90vh] overflow-y-auto"
      >
        <h2 id="modal-title" className="text-lg font-bold mb-1">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/** One choice in a pop-up's list of plans. */
export function PlanRadio({
  checked,
  onChange,
  title,
  detail,
  badge,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  detail: string;
  badge?: string;
}) {
  return (
    <label
      className={`flex items-start gap-2 border-2 rounded-lg px-3 py-2 cursor-pointer ${
        checked ? "border-ink bg-chalk" : "border-cardboard-dark/50"
      }`}
    >
      <input type="radio" className="mt-1" checked={checked} onChange={onChange} />
      <span>
        <span className="block text-sm font-bold">
          {title}{" "}
          {badge && (
            <span className="text-[10px] font-bold uppercase tracking-wide bg-cardboard/40 px-1.5 py-0.5 rounded align-middle">
              {badge}
            </span>
          )}
        </span>
        <span className="block text-[11px] opacity-70">{detail}</span>
      </span>
    </label>
  );
}
