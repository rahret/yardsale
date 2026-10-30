import "server-only";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { requestOrigin } from "@/lib/saleData";
import { billingNoticeUrl } from "@/lib/billing";
import { safeRedirectPath } from "@/lib/utils";

export interface BillingContext {
  stripe: Stripe;
  admin: SupabaseClient;
  user: User;
  origin: string;
}

const ACCOUNT_PLAN = "/dashboard/account#plan";

/** Back to a page with ?billing=<notice> (and Stripe's message, if any). */
export function billingRedirect(notice: string, to: string = ACCOUNT_PLAN, detail?: string) {
  const url = new URL(billingNoticeUrl(requestOrigin(), safeRedirectPath(to, ACCOUNT_PLAN), notice));
  if (detail) url.searchParams.set("detail", detail.slice(0, 300));
  return NextResponse.redirect(url, { status: 303 });
}

/** Runs a billing form action for the signed-in seller, turning missing
 * setup and Stripe errors into a notice on the page they came from. */
export async function withBilling(
  to: string,
  action: (ctx: BillingContext) => Promise<NextResponse>
): Promise<NextResponse> {
  const origin = requestOrigin();
  const stripe = getStripe();
  const admin = createAdminClient();
  if (!stripe || !admin) return billingRedirect("unavailable", to);

  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`, { status: 303 });

  try {
    return await action({ stripe, admin, user, origin });
  } catch (e) {
    console.error("Billing action failed", e);
    return billingRedirect("error", to, e instanceof Stripe.errors.StripeError ? e.message : undefined);
  }
}
