import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SaleAdmin from "@/components/SaleAdmin";
import { ITEM_SELECT } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SaleAdminPage({ params }: { params: { saleId: string } }) {
  const supabase = createClient();

  const { data: sale } = await supabase.from("sales").select("*").eq("id", params.saleId).single();

  if (!sale) notFound();

  const { data: items } = await supabase
    .from("items")
    .select(ITEM_SELECT)
    .eq("sale_id", params.saleId)
    .order("created_at", { ascending: false });

  const { data: savedLocations } = await supabase
    .from("saved_locations")
    .select("*")
    .eq("owner_id", sale.owner_id)
    .order("created_at", { ascending: false });

  const { data: saleDays } = await supabase
    .from("sale_days")
    .select("*")
    .eq("sale_id", params.saleId)
    .order("date", { ascending: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("payment_options")
    .eq("id", sale.owner_id)
    .maybeSingle();

  // the seller's own payout status (RLS: owners can read their billing row)
  const { data: billing } = await supabase
    .from("account_billing")
    .select("connect_charges_enabled")
    .eq("user_id", sale.owner_id)
    .maybeSingle();

  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("sale_id", sale.id)
    .in("status", ["paid", "picked_up", "refunded", "conflict"])
    .order("created_at", { ascending: false });

  return (
    <SaleAdmin
      sale={sale}
      initialItems={items || []}
      initialSavedLocations={savedLocations || []}
      initialSaleDays={saleDays || []}
      profilePaymentOptions={profile?.payment_options}
      payoutsReady={!!billing?.connect_charges_enabled}
      initialOrders={orders || []}
    />
  );
}
