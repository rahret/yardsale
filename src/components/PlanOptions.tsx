import type { AccountBilling } from "@/lib/types";
import { PASS_DAYS, PRICES, TRIAL_DAYS, TRIAL_LIMITS, UPGRADE_HREF } from "@/lib/billing";

/** The plan choices for a seller without one: start the trial (monthly or
 * yearly), or buy a one-time Sale Pass. Plain form posts to Stripe Checkout. */
export default function PlanOptions({
  billing,
  returnTo,
}: {
  billing: Pick<AccountBilling, "trial_used"> | null;
  /** Where to land after Checkout. */
  returnTo: string;
}) {
  const trial = !billing?.trial_used;
  const yearlySaving = Math.round((1 - PRICES.year.cents / (PRICES.month.cents * 12)) * 100);

  return (
    <div className="space-y-3">
      <div className="bg-chalk border-2 border-grass rounded-lg p-3">
        <div className="font-bold text-sm">⭐ Pro {trial && <span className="text-grass-dark">— {TRIAL_DAYS} days free</span>}</div>
        <p className="text-xs opacity-75 mt-1 mb-2">
          Unlimited sales and items, Holds, Buy Now, and a listing in Find yard sales.{" "}
          {trial
            ? `Card required; you won't be charged if you cancel within ${TRIAL_DAYS} days. Cancel anytime.`
            : "Cancel anytime."}
        </p>
        <div className="flex gap-2 flex-wrap">
          <CheckoutButton choice="month" returnTo={returnTo} primary>
            {trial ? "Start free trial" : "Subscribe"} · {PRICES.month.label}
          </CheckoutButton>
          <CheckoutButton choice="year" returnTo={returnTo}>
            {PRICES.year.label} <span className="font-semibold opacity-70">(save {yearlySaving}%)</span>
          </CheckoutButton>
        </div>
        {trial && (
          <p className="text-[11px] opacity-60 mt-2">
            During the trial: {TRIAL_LIMITS.sales} sale and up to {TRIAL_LIMITS.items} items, first come, first
            served. Holds, Buy Now and Find yard sales unlock when the trial ends — or right away with &ldquo;Unlock
            everything now&rdquo;.
          </p>
        )}
      </div>

      <div className="bg-white border-2 border-cardboard-dark/50 rounded-lg p-3">
        <div className="font-bold text-sm">🎟️ Sale Pass</div>
        <p className="text-xs opacity-75 mt-1 mb-2">
          Just one sale? Everything in Pro for {PASS_DAYS} days, paid once. No subscription — it simply ends.
        </p>
        <CheckoutButton choice="pass" returnTo={returnTo}>
          Get a Sale Pass · {PRICES.pass.label}
        </CheckoutButton>
      </div>
    </div>
  );
}

function CheckoutButton({
  choice,
  returnTo,
  primary,
  children,
}: {
  choice: "month" | "year" | "pass";
  returnTo: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action="/api/billing/checkout" method="post">
      <input type="hidden" name="choice" value={choice} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        className={
          primary
            ? "bg-grass text-white font-bold px-4 py-2 rounded-lg text-sm shadow-tag"
            : "border-2 border-cardboard-dark bg-white font-bold px-4 py-2 rounded-lg text-sm"
        }
      >
        {children}
      </button>
    </form>
  );
}

/** "🔒 Pro" next to a feature the seller's plan doesn't include yet. */
export function LockedBadge({ className = "" }: { className?: string }) {
  return (
    <a
      href={UPGRADE_HREF}
      className={`inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide bg-sun/40 text-ink px-1.5 py-0.5 rounded ${className}`}
      title="Included with Pro and the Sale Pass"
    >
      🔒 Pro
    </a>
  );
}

/** A short "this needs Pro" line with an upgrade link. */
export function UpgradeNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs bg-sun/20 border border-sun rounded-lg px-3 py-2">
      {children}{" "}
      <a href={UPGRADE_HREF} className="font-bold underline">
        See plans
      </a>
    </div>
  );
}
