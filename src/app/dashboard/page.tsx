import { createClient } from "@/lib/supabase/server";
import DashboardHome from "@/components/DashboardHome";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: sales } = await supabase
    .from("sales")
    .select("*")
    .order("created_at", { ascending: false });

  return <DashboardHome initialSales={sales || []} displayName={user?.user_metadata?.display_name} />;
}
