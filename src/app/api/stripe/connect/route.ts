import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { requestOrigin } from "@/lib/saleData";

// "Set up with Stripe" on the Account page. POST (a form submit) creates the
// seller's Stripe Express account the first time; both POST and GET (Stripe's
// refresh_url, used when an onboarding link expires) send them to Stripe's
// hosted onboarding to add their bank and identity details.
async function startOnboarding(request: NextRequest, allowCreate: boolean) {
  const origin = requestOrigin();
  const fail = (reason: string, detail?: string) => onboardingFailed(origin, reason, detail);

  const stripe = getStripe();
  const admin = createAdminClient();
  if (!stripe || !admin) return fail("unavailable");

  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`, { status: 303 });

  const { data: billing } = await admin
    .from("account_billing")
    .select("stripe_connect_account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  let accountId: string | null = billing?.stripe_connect_account_id ?? null;

  if (!accountId) {
    if (!allowCreate) return fail("error");
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: user.email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_type: "individual",
      business_profile: { product_description: "Personal yard / garage sale items" },
      metadata: { user_id: user.id },
    });
    accountId = account.id;
    const { error } = await admin
      .from("account_billing")
      .upsert({ user_id: user.id, stripe_connect_account_id: accountId }, { onConflict: "user_id" });
    if (error) {
      console.error("Stripe onboarding: couldn't save the account id", error);
      return fail("error", `Couldn't save your Stripe account: ${error.message}`);
    }
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${origin}/api/stripe/connect`,
    return_url: `${origin}/api/stripe/connect/return`,
  });
  return NextResponse.redirect(link.url, { status: 303 });
}

/** Back to the Account page with a reason. Stripe's own message (e.g. that
 * the platform's Connect setup isn't finished) is passed along so it's
 * visible, and logged for the Vercel logs. */
function onboardingFailed(origin: string, reason: string, detail?: string) {
  const url = new URL(`${origin}/dashboard/account`);
  url.searchParams.set("stripe", reason);
  if (detail) url.searchParams.set("detail", detail.slice(0, 300));
  return NextResponse.redirect(url, { status: 303 });
}

function stripeFailure(e: unknown) {
  console.error("Stripe onboarding failed", e);
  const detail = e instanceof Stripe.errors.StripeError ? e.message : undefined;
  return onboardingFailed(requestOrigin(), "error", detail);
}

export async function POST(request: NextRequest) {
  try {
    return await startOnboarding(request, true);
  } catch (e) {
    return stripeFailure(e);
  }
}

export async function GET(request: NextRequest) {
  try {
    return await startOnboarding(request, false);
  } catch (e) {
    return stripeFailure(e);
  }
}
