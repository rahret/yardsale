import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SaleStatsView from "@/components/SaleStatsView";
import type { SaleStats } from "@/lib/saleStats";

export const dynamic = "force-dynamic";

// The seller's stats for one sale: visits, where they came from, the most
// viewed items, holds and sales.
export default async function SaleStatsPage({ params: paramsIn }: { params: Promise<{ saleId: string }> }) {
  const params = await paramsIn;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: sale } = await supabase.from("sales").select("id, name, owner_id").eq("id", params.saleId).maybeSingle();
  // published sales are readable by anyone, so check ownership explicitly
  if (!sale || !user || sale.owner_id !== user.id) notFound();

  const { data: stats, error } = await supabase.rpc("sale_stats", { p_sale_id: sale.id });
  return <SaleStatsView saleId={sale.id} saleName={sale.name} stats={error ? null : (stats as SaleStats)} />;
}
