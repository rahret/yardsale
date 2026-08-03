import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SaleAdmin from "@/components/SaleAdmin";

export const dynamic = "force-dynamic";

export default async function SaleAdminPage({ params }: { params: { saleId: string } }) {
  const supabase = createClient();

  const { data: sale } = await supabase.from("sales").select("*").eq("id", params.saleId).single();

  if (!sale) notFound();

  const { data: items } = await supabase
    .from("items")
    .select("*, item_photos(*)")
    .eq("sale_id", params.saleId)
    .order("created_at", { ascending: false });

  return <SaleAdmin sale={sale} initialItems={items || []} />;
}
