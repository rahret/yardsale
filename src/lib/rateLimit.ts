import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/** Per-visitor limits for the server's public routes, counted in the
 * database (public.rate_limit_hit). Keys use a hash of the IP or the user id,
 * never the raw address. If the limiter itself is unavailable the request is
 * allowed: a limiter outage shouldn't take the site down with it. */

export const LIMITS = {
  checkout: { limit: 15, windowSeconds: 3600 },
  holdAlert: { limit: 30, windowSeconds: 3600 },
  testEmail: { limit: 1, windowSeconds: 60 },
  testEmailDaily: { limit: 10, windowSeconds: 86400 },
  geocode: { limit: 30, windowSeconds: 60 },
  addressVerify: { limit: 30, windowSeconds: 600 },
  search: { limit: 120, windowSeconds: 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

/** The visitor's IP as Vercel reports it (Vercel sets these headers itself). */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() ||
    headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

export function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/** Counts one use of `name` for `who` (an IP or a user id); false = over the limit. */
export async function allow(
  name: LimitName,
  who: string,
  admin: SupabaseClient | null = createAdminClient()
): Promise<boolean> {
  if (!admin) return true;
  const { limit, windowSeconds } = LIMITS[name];
  const { data, error } = await admin.rpc("rate_limit_hit", {
    p_key: `${name}:${hashKey(who)}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("Rate limiter unavailable:", error.message);
    return true;
  }
  return data !== false;
}

export const TOO_MANY = "Too many tries — please wait a little and try again.";
