/** Online-payment fees for "Buy Now". Shared by the server (which charges
 * them) and the seller's settings (which shows what they'll receive). */

export interface FeeSettings {
  /** Stripe's processing fee, which the platform pays on these charges. */
  stripePercent: number;
  stripeFixedCents: number;
  /** The app's own cut, on top of Stripe's fee. */
  platformPercent: number;
  platformFixedCents: number;
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Defaults: Stripe's standard US card rate plus a 1.5% + 15¢ platform cut
 * (which covers Stripe Connect's per-seller and payout fees). Override with
 * NEXT_PUBLIC_STRIPE_FEE_PERCENT / _FIXED_CENTS and
 * NEXT_PUBLIC_PLATFORM_FEE_PERCENT / _FIXED_CENTS. */
export function feeSettings(): FeeSettings {
  return {
    stripePercent: num(process.env.NEXT_PUBLIC_STRIPE_FEE_PERCENT, 2.9),
    stripeFixedCents: num(process.env.NEXT_PUBLIC_STRIPE_FEE_FIXED_CENTS, 30),
    platformPercent: num(process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENT, 1.5),
    platformFixedCents: num(process.env.NEXT_PUBLIC_PLATFORM_FEE_FIXED_CENTS, 15),
  };
}

/** The application fee kept from a sale: Stripe's processing fee (charged to
 * the platform on destination charges) plus the platform's cut. The seller
 * receives the rest. */
export function applicationFeeCents(amountCents: number, s: FeeSettings = feeSettings()): number {
  const stripe = Math.ceil((amountCents * s.stripePercent) / 100) + s.stripeFixedCents;
  const platform = Math.round((amountCents * s.platformPercent) / 100) + s.platformFixedCents;
  return Math.min(amountCents, stripe + platform);
}

export function sellerNetCents(amountCents: number, s: FeeSettings = feeSettings()): number {
  return amountCents - applicationFeeCents(amountCents, s);
}

/** Buy Now needs a price of at least $3: below that the fixed card fee eats
 * most of the sale (Stripe's own minimum is 50¢). Cheaper items can be held
 * or sold first come, first served. */
export const MIN_CHARGE_CENTS = 300;

/** Whether an item can be bought online (when the sale has Buy Now on):
 * single items Stripe is able to charge for. */
export function canBuyOnline(item: { price: number | string; quantity_total: number }): boolean {
  return item.quantity_total === 1 && toCents(item.price) >= MIN_CHARGE_CENTS;
}

/** Dollars (as stored on items) to whole cents. */
export function toCents(dollars: number | string): number {
  return Math.round(Number(dollars) * 100);
}

/** A 4-digit code the buyer shows at pickup. */
export function pickupCode(random: () => number = Math.random): string {
  return String(Math.floor(random() * 10000)).padStart(4, "0");
}
