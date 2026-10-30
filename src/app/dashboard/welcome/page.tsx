import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WelcomeWizard from "@/components/WelcomeWizard";
import PlanOptions from "@/components/PlanOptions";
import { TRIAL_DAYS, TRIAL_LIMITS, accessFor } from "@/lib/billing";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  canceled: "Checkout canceled — nothing was charged. Pick an option when you're ready.",
  unavailable: "Plans aren't switched on for this site yet.",
  error: "Something went wrong talking to Stripe — please try again.",
  success: "Thanks! Your plan will be ready in a moment — refresh this page if it doesn't continue.",
  subscribed: "Thanks! Your plan will be ready in a moment — refresh this page if it doesn't continue.",
  pass: "Thanks! Your Sale Pass will be ready in a moment — refresh this page if it doesn't continue.",
};

// First-time sellers land here after confirming their email: pick a plan
// (the free trial or a Sale Pass), then a short wizard creates their first
// sale.
export default async function WelcomePage({ searchParams }: { searchParams: { billing?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: billing }, { data: sales }] = await Promise.all([
    supabase.from("account_billing").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("sales").select("id").eq("owner_id", user.id).limit(1),
  ]);
  const access = accessFor(billing);

  // the trial includes one sale; if it already exists, go straight to it
  if (access === "trial" && sales && sales.length >= TRIAL_LIMITS.sales) {
    redirect(`/dashboard/sales/${sales[0].id}`);
  }

  if (access === "none") {
    const name = user.user_metadata?.display_name || "";
    const notice = searchParams.billing ? NOTICES[searchParams.billing] : undefined;
    return (
      <div className="p-5 max-w-lg mx-auto">
        <div className="text-xs font-bold opacity-60 mb-1">First, pick a plan</div>
        <div className="font-marker text-3xl text-marker mb-1">Welcome{name ? `, ${name}` : ""}!</div>
        <p className="text-sm opacity-75 mb-4">
          Try Yard Sale QR free for {TRIAL_DAYS} days, or get a Sale Pass if you&apos;re holding just one sale. Then
          we&apos;ll set up your sale in three quick steps.
        </p>
        {notice && <div className="text-xs font-semibold bg-sun/30 rounded-lg px-3 py-2 mb-3">{notice}</div>}
        <PlanOptions billing={billing} returnTo="/dashboard/welcome" />
        <p className="text-xs opacity-60 mt-4">
          Payments are handled securely by Stripe. Cancel anytime from your Account page.
        </p>
      </div>
    );
  }

  return <WelcomeWizard displayName={user.user_metadata?.display_name || ""} />;
}
