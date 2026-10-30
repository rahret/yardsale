import { createClient } from "@/lib/supabase/server";
import DashboardHome from "@/components/DashboardHome";
import { accessFor } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: sales }, { data: billing }] = await Promise.all([
    supabase.from("sales").select("*").order("created_at", { ascending: false }),
    supabase.from("account_billing").select("*").eq("user_id", user?.id ?? "").maybeSingle(),
  ]);

  return (
    <DashboardHome
      initialSales={sales || []}
      displayName={user?.user_metadata?.display_name}
      access={accessFor(billing)}
    />
  );
}
