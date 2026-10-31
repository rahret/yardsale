"use client";

import { useEffect, useRef, useState } from "react";
import { type BillingChoice, PASS_DAYS, PRICES } from "@/lib/billing";

const PERIOD: Record<"month" | "year", string> = { month: "month", year: "year" };
const price = (choice: BillingChoice) => `$${(PRICES[choice].cents / 100).toFixed(PRICES[choice].cents % 100 ? 2 : 0)}`;

const OPTIONS: { choice: BillingChoice; title: string; detail: string }[] = [
  { choice: "month", title: "Pro — monthly", detail: `${PRICES.month.label}, cancel anytime` },
  { choice: "year", title: "Pro — yearly", detail: `${PRICES.year.label}, cancel anytime` },
  { choice: "pass", title: "Sale Pass", detail: `${PRICES.pass.label} for ${PASS_DAYS} days, no subscription` },
];

/** "Unlock everything now" during the trial: a confirmation pop-up where the
 * seller picks monthly, yearly or a Sale Pass and sees exactly what happens
 * (trial ends, which plan, what's charged) before anything changes. */
export default function UpgradeDialog({ currentInterval }: { currentInterval: "month" | "year" | null }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<BillingChoice>(currentInterval || "month");
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !submitting && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting]);

  const isPass = choice === "pass";
  const amount = price(choice);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-grass text-white font-bold px-4 py-2 rounded-lg text-sm shadow-tag"
      >
        Unlock everything now
      </button>
      <span className="block text-[11px] opacity-60 mt-1">
        Ends your trial early — choose monthly, yearly or a Sale Pass.
      </span>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/50 flex items-end sm:items-center justify-center p-4"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl border-2 border-cardboard-dark shadow-tag w-full max-w-md p-5 outline-none max-h-[90vh] overflow-y-auto"
          >
            <h2 id="upgrade-title" className="text-lg font-bold mb-1">
              Unlock everything now
            </h2>
            <p className="text-xs opacity-70 mb-3">
              More sales, unlimited items, Holds, Buy Now and a listing in Find yard sales — right away.
            </p>

            <fieldset className="space-y-2 mb-4">
              <legend className="text-xs font-bold opacity-70 mb-1">Choose your plan</legend>
              {OPTIONS.map((o) => (
                <label
                  key={o.choice}
                  className={`flex items-start gap-2 border-2 rounded-lg px-3 py-2 cursor-pointer ${
                    choice === o.choice ? "border-ink bg-chalk" : "border-cardboard-dark/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="upgrade-choice"
                    className="mt-1"
                    checked={choice === o.choice}
                    onChange={() => setChoice(o.choice)}
                  />
                  <span>
                    <span className="block text-sm font-bold">{o.title}</span>
                    <span className="block text-[11px] opacity-70">{o.detail}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="text-sm bg-sun/20 border border-sun rounded-lg px-3 py-2 mb-4" aria-live="polite">
              {isPass ? (
                <>
                  <strong>Your free trial will end</strong> and your Pro subscription will be canceled, so you
                  won&apos;t be billed for Pro. You&apos;ll be upgraded to a <strong>Sale Pass</strong> and{" "}
                  <strong>charged {amount} once</strong> on Stripe&apos;s secure payment page, for {PASS_DAYS} days
                  of everything. If you don&apos;t finish paying, your trial carries on as before.
                </>
              ) : (
                <>
                  <strong>Your free trial will end today</strong> and you&apos;ll be upgraded to{" "}
                  <strong>Pro ({choice === "year" ? "yearly" : "monthly"})</strong>. Your card on file will be{" "}
                  <strong>charged {amount} now</strong>, then {amount} every {PERIOD[choice]} until you cancel.
                </>
              )}
            </div>

            <form
              action={isPass ? "/api/billing/checkout" : "/api/billing/upgrade"}
              method="post"
              onSubmit={() => setSubmitting(true)}
              className="flex gap-2 flex-wrap"
            >
              <input type="hidden" name="choice" value={choice} />
              {isPass && <input type="hidden" name="returnTo" value="/dashboard/account#plan" />}
              <button
                type="submit"
                disabled={submitting}
                className="bg-grass text-white font-bold px-4 py-2 rounded-lg text-sm shadow-tag disabled:opacity-60"
              >
                {submitting ? "Working…" : isPass ? `Continue to payment · ${amount}` : `Upgrade and pay ${amount}`}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setOpen(false)}
                className="border-2 border-cardboard-dark font-semibold px-4 py-2 rounded-lg text-sm"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
