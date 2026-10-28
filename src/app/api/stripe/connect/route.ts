import { NextResponse, type NextRequest } from "next/server";
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
  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/dashboard/account?stripe=${reason}`, { status: 303 });

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
    if (error) return fail("error");
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${origin}/api/stripe/connect`,
    return_url: `${origin}/api/stripe/connect/return`,
  });
  return NextResponse.redirect(link.url, { status: 303 });
}

export async function POST(request: NextRequest) {
  try {
    return await startOnboarding(request, true);
  } catch {
    return NextResponse.redirect(`${requestOrigin()}/dashboard/account?stripe=error`, { status: 303 });
  }
}

export async function GET(request: NextRequest) {
  try {
    return await startOnboarding(request, false);
  } catch {
    return NextResponse.redirect(`${requestOrigin()}/dashboard/account?stripe=error`, { status: 303 });
  }
}
