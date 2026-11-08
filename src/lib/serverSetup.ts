import "server-only";

/** Which server settings (Vercel environment variables) are missing, by name
 * only, never values. Shown to sellers on their own pages so a missing key
 * shows up as a clear warning instead of a vague failure. */
export interface ServerSetup {
  /** Needed for Buy Now (and the Stripe webhook). Empty = Buy Now can run. */
  paymentsMissing: string[];
  /** Needed for seller alerts and buyer confirmation emails. */
  emailMissing: string[];
}

function missing(names: string[], env: Record<string, string | undefined>): string[] {
  return names.filter((n) => !env[n]?.trim());
}

export function serverSetup(env: Record<string, string | undefined> = process.env): ServerSetup {
  return {
    paymentsMissing: missing(["STRIPE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"], env),
    emailMissing: missing(["SUPABASE_SERVICE_ROLE_KEY", "ZEPTOMAIL_TOKEN", "ALERT_FROM_EMAIL"], env),
  };
}
