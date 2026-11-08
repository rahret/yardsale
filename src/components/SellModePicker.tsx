"use client";

import type { SellMode } from "@/lib/types";
import { MIN_CHARGE_CENTS, toCents } from "@/lib/fees";
import { money } from "@/lib/utils";
import { LockedBadge } from "@/components/PlanOptions";

export const SELL_MODE_LABELS: Record<SellMode, string> = {
  in_person: "🏃 First come, first served",
  hold: "✋ Hold",
  buy_now: "💳 Buy Now",
};

/** Why an item can't use this mode, or "" if it can. An item that already
 * has the mode can keep it (so editing other fields never fails). */
export function sellModeError(
  mode: SellMode,
  price: string,
  payoutsReady: boolean,
  premium: boolean,
  currentMode?: SellMode
): string {
  if (mode !== "in_person" && !premium && currentMode !== mode) {
    return "Holds and Buy Now are part of Pro and the Sale Pass — see plans on your Account page.";
  }
  if (mode !== "buy_now") return "";
  if (!payoutsReady && currentMode !== "buy_now") return "Set up payouts on your Account page to use Buy Now.";
  if (toCents(Number(price) || 0) < MIN_CHARGE_CENTS) {
    return `Buy Now needs a price of at least ${money(MIN_CHARGE_CENTS / 100)} — use Hold for cheaper items.`;
  }
  return "";
}

/** "How buyers get it": first come, first served; Hold (reserve, pay in
 * person); or Buy Now (pay online). Exactly one per item. */
export default function SellModePicker({
  value,
  onChange,
  payoutsReady,
  premium,
  price,
  currentMode,
}: {
  value: SellMode;
  onChange: (mode: SellMode) => void;
  payoutsReady: boolean;
  /** The seller's plan includes Holds and Buy Now. */
  premium: boolean;
  price: string;
  currentMode?: SellMode;
}) {
  const locked = (mode: SellMode) => !premium && currentMode !== mode;
  const buyNowBlocked = !payoutsReady && currentMode !== "buy_now";
  const tooCheap = price !== "" && toCents(Number(price) || 0) < MIN_CHARGE_CENTS;
  const option = (mode: SellMode, title: string, hint: string, disabled = false, lock = false) => (
    <label
      className={`flex items-start gap-2 border-2 rounded-lg px-3 py-2 cursor-pointer ${
        value === mode ? "border-ink bg-chalk" : "border-cardboard-dark/50 bg-white"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <input
        type="radio"
        className="mt-1"
        checked={value === mode}
        disabled={disabled}
        onChange={() => onChange(mode)}
      />
      <span>
        <span className="block text-sm font-bold">
          {title} {lock && <LockedBadge className="ml-1 align-middle" />}
        </span>
        <span className="block text-[11px] opacity-60">{hint}</span>
      </span>
    </label>
  );
  return (
    <div className="mb-2.5">
      <div className="text-xs font-bold opacity-70 mb-1">How buyers get it</div>
      <div className="grid gap-2 sm:grid-cols-3">
        {option("in_person", SELL_MODE_LABELS.in_person, "No holds or online payment — buyers just show up")}
        {option("hold", SELL_MODE_LABELS.hold, "Buyer reserves it, pays you in person", locked("hold"), locked("hold"))}
        {option(
          "buy_now",
          SELL_MODE_LABELS.buy_now,
          "Buyer pays online, picks up with a code",
          buyNowBlocked || locked("buy_now"),
          locked("buy_now")
        )}
      </div>
      {buyNowBlocked && !locked("buy_now") && (
        <div className="text-[11px] opacity-60 mt-1">
          To use Buy Now,{" "}
          <a href="/dashboard/account" className="underline">
            set up payouts on your Account page
          </a>
          .
        </div>
      )}
      {value === "buy_now" && tooCheap && (
        <div className="text-[11px] text-marker font-semibold mt-1">
          Buy Now needs a price of at least {money(MIN_CHARGE_CENTS / 100)}.
        </div>
      )}
    </div>
  );
}
