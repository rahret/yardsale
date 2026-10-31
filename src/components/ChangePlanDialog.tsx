"use client";

import { useState } from "react";
import { PRICES, priceText } from "@/lib/billing";
import Modal, { PlanRadio } from "@/components/Modal";

type Interval = "month" | "year";
const NAME: Record<Interval, string> = { month: "Pro (monthly)", year: "Pro (yearly)" };

/** "Change plan" for Pro subscribers: switch between monthly and yearly,
 * with what happens to billing spelled out before anything changes. */
export default function ChangePlanDialog({
  currentInterval,
  startsOn,
}: {
  currentInterval: Interval;
  /** Billing hasn't started yet (a Sale Pass is still running): the date it starts. */
  startsOn?: string | null;
}) {
  const other: Interval = currentInterval === "month" ? "year" : "month";
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Interval>(other);
  const [submitting, setSubmitting] = useState(false);
  const changing = choice !== currentInterval;
  const amount = priceText(choice);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setChoice(other);
          setOpen(true);
        }}
        className="border-2 border-cardboard-dark bg-white font-bold px-4 py-2 rounded-lg text-sm"
      >
        Change plan
      </button>

      {open && (
        <Modal title="Change your plan" onClose={() => setOpen(false)} locked={submitting}>
          <p className="text-xs opacity-70 mb-3">Both include everything: unlimited sales and items, Holds, Buy Now and Find yard sales.</p>

          <fieldset className="space-y-2 mb-4">
            <legend className="text-xs font-bold opacity-70 mb-1">Choose your plan</legend>
            {(["month", "year"] as const).map((i) => (
              <PlanRadio
                key={i}
                checked={choice === i}
                onChange={() => setChoice(i)}
                title={NAME[i]}
                detail={`${PRICES[i].label}, cancel anytime`}
                badge={i === currentInterval ? "Current" : undefined}
              />
            ))}
          </fieldset>

          <div className="text-sm bg-sun/20 border border-sun rounded-lg px-3 py-2 mb-4" aria-live="polite">
            {!changing ? (
              <>You&apos;re already on {NAME[choice]}.</>
            ) : startsOn ? (
              <>
                You&apos;ll switch to <strong>{NAME[choice]}</strong>. It still starts on <strong>{startsOn}</strong>, when
                your Sale Pass ends. <strong>Nothing is charged today</strong>; {amount} on {startsOn}, then {amount}{" "}
                every {choice} until you cancel.
              </>
            ) : choice === "year" ? (
              <>
                You&apos;ll switch to <strong>{NAME.year}</strong> today. Your card on file will be{" "}
                <strong>charged {amount} now, minus credit for the unused part of this month</strong>, then {amount}{" "}
                every year until you cancel.
              </>
            ) : (
              <>
                You&apos;ll switch to <strong>{NAME.month}</strong> today. <strong>Nothing is charged now</strong>: the
                unused part of your yearly plan becomes account credit, which pays your {amount} monthly charges until
                it runs out. Then {amount} every month until you cancel.
              </>
            )}
          </div>

          <form
            action="/api/billing/change"
            method="post"
            onSubmit={() => setSubmitting(true)}
            className="flex gap-2 flex-wrap"
          >
            <input type="hidden" name="choice" value={choice} />
            <button
              type="submit"
              disabled={submitting || !changing}
              className="bg-grass text-white font-bold px-4 py-2 rounded-lg text-sm shadow-tag disabled:opacity-50"
            >
              {submitting ? "Working…" : `Switch to ${choice === "year" ? "yearly" : "monthly"}`}
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
