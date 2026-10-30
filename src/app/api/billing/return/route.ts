import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { requestOrigin } from "@/lib/saleData";
import { applyBillingCheckout } from "@/lib/billingServer";
import { billingNoticeUrl } from "@/lib/billing";
import { safeRedirectPath } from "@/lib/utils";

// Where Stripe Checkout sends a seller after paying or starting a trial.
// Applies the result right away (the webhook does the same, whichever comes
// first) so the new plan shows as soon as they land.
export async function GET(request: NextRequest) {
  const origin = requestOrigin();
  const params = request.nextUrl.searchParams;
  const to = safeRedirectPath(params.get("to"), "/dashboard/account#plan");
  const sessionId = params.get("session_id") || "";

  const stripe = getStripe();
  const admin = createAdminClient();
  const {
    data: { user },
  } = await createClient().auth.getUser();
  let notice = "success";
  if (stripe && admin && user && sessionId.startsWith("cs_")) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // only ever apply a seller's own checkout
      if (session.metadata?.user_id === user.id) {
        await applyBillingCheckout(session, stripe, admin);
        if (session.metadata?.kind === "sale_pass") notice = "pass";
        else notice = "subscribed";
      }
    } catch (e) {
      // the webhook will catch up
      console.error("Billing return: couldn't apply checkout", e);
    }
  }
  return NextResponse.redirect(billingNoticeUrl(origin, to, notice), { status: 303 });
}
