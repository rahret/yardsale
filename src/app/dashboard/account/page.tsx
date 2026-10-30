import { createClient } from "@/lib/supabase/server";
import AccountSettings from "@/components/AccountSettings";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: { stripe?: string; detail?: string; billing?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The dashboard layout already redirects signed-out visitors.
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const { data: billing } = await supabase
    .from("account_billing")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  const { count: saleCount } = await supabase
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);

  return (
    <AccountSettings
      email={user.email || ""}
      pendingEmail={user.new_email || ""}
      memberSince={user.created_at}
      initialProfile={profile}
      fallbackDisplayName={user.user_metadata?.display_name || ""}
      billing={billing}
      saleCount={saleCount || 0}
      stripeNotice={searchParams.stripe}
      stripeDetail={searchParams.detail}
      billingNotice={searchParams.billing}
    />
  );
}
