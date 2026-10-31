"use client";

import { useState } from "react";
import { type BillingChoice, PASS_DAYS, PRICES, priceText } from "@/lib/billing";
import Modal, { PlanRadio } from "@/components/Modal";


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

  const isPass = choice === "pass";
  const amount = priceText(choice);

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
        <Modal title="Unlock everything now" onClose={() => setOpen(false)} locked={submitting}>
          <p className="text-xs opacity-70 mb-3">
            More sales, unlimited items, Holds, Buy Now and a listing in Find yard sales — right away.
          </p>

          <fieldset className="space-y-2 mb-4">
            <legend className="text-xs font-bold opacity-70 mb-1">Choose your plan</legend>
            {OPTIONS.map((o) => (
              <PlanRadio
                key={o.choice}
                checked={choice === o.choice}
                onChange={() => setChoice(o.choice)}
                title={o.title}
                detail={o.detail}
              />
            ))}
          </fieldset>

          <div className="text-sm bg-sun/20 border border-sun rounded-lg px-3 py-2 mb-4" aria-live="polite">
            {isPass ? (
              <>
                <strong>Your free trial will end</strong> and your Pro subscription will be canceled, so you
                won&apos;t be billed for Pro. You&apos;ll be upgraded to a <strong>Sale Pass</strong> and{" "}
                <strong>charged {amount} once</strong> on Stripe&apos;s secure payment page, for {PASS_DAYS} days of
                everything. If you don&apos;t finish paying, your trial carries on as before.
              </>
            ) : (
              <>
                <strong>Your free trial will end today</strong> and you&apos;ll be upgraded to{" "}
                <strong>Pro ({choice === "year" ? "yearly" : "monthly"})</strong>. Your card on file will be{" "}
                <strong>charged {amount} now</strong>, then {amount} every {choice} until you cancel.
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
        </Modal>
      )}
    </>
  );
}
