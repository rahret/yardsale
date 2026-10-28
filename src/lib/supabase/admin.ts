import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client: bypasses Row Level Security. Server-only —
 * used by the Stripe routes and webhook to record payments and payout
 * accounts, which users must never be able to write themselves. Returns null
 * when SUPABASE_SERVICE_ROLE_KEY isn't configured.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
