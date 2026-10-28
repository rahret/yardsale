import "server-only";
import Stripe from "stripe";

/** Server-side Stripe client, or null when STRIPE_SECRET_KEY isn't set (the
 * app then hides/declines Buy Now instead of crashing). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key, { appInfo: { name: "Yard Sale QR" } }) : null;
}
