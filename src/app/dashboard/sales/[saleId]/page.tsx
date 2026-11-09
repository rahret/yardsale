import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accessFor } from "@/lib/billing";
import { snapAiEnabled } from "@/lib/snapListServer";
import SaleAdmin from "@/components/SaleAdmin";
import { ITEM_SELECT } from "@/lib/utils";
import { SELLER_ORDER_STATUSES } from "@/lib/liveUpdates";
import { serverSetup } from "@/lib/serverSetup";

export const dynamic = "force-dynamic";

export default async function SaleAdminPage(props: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: sale } = await supabase.from("sales").select("*").eq("id", params.saleId).maybeSingle();

  // published sales are readable by anyone, so check ownership explicitly
  if (!sale || !user || sale.owner_id !== user.id) notFound();

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
    .select("*")
    .eq("user_id", sale.owner_id)
    .maybeSingle();

  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("sale_id", sale.id)
    .in("status", SELLER_ORDER_STATUSES)
    .order("created_at", { ascending: false });

  // the seller's other sales, for "move unsold items"
  const { data: otherSales } = await supabase
    .from("sales")
    .select("id, name, status, created_at")
    .eq("owner_id", sale.owner_id)
    .neq("id", sale.id)
    .is("archived_at", null)
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
      justCreated={searchParams.welcome === "1"}
      access={accessFor(billing)}
      snapAi={snapAiEnabled()}
      otherSales={otherSales || []}
      setup={serverSetup()}
    />
  );
}
