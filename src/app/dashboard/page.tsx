import { createClient } from "@/lib/supabase/server";
import DashboardHome from "@/components/DashboardHome";
import { accessFor } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: sales }, { data: billing }, { data: profile }] = await Promise.all([
    // only this seller's sales — RLS also lets anyone read every published sale
    supabase.from("sales").select("*").eq("owner_id", user?.id ?? "").order("created_at", { ascending: false }),
    supabase.from("account_billing").select("*").eq("user_id", user?.id ?? "").maybeSingle(),
    supabase.from("profiles").select("street, city, state, zip").eq("id", user?.id ?? "").maybeSingle(),
  ]);

  return (
    <DashboardHome
      initialSales={sales || []}
      displayName={user?.user_metadata?.display_name}
      access={accessFor(billing)}
      profileAddress={profile}
    />
  );
}
