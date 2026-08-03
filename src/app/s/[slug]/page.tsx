import { createClient } from "@/lib/supabase/server";
import ShopView from "@/components/ShopView";

export const dynamic = "force-dynamic";

export default async function PublicSalePage({ params }: { params: { slug: string } }) {
  const supabase = createClient();

  const { data: sale } = await supabase.from("sales").select("*").eq("slug", params.slug).single();

  if (!sale) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <div className="font-marker text-3xl text-marker mb-2">Sale not found</div>
          <p className="opacity-70 text-sm">This link doesn&apos;t match any garage sale. Double-check the URL or QR code.</p>
        </div>
      </div>
    );
  }

  // sweep any stale reservations before rendering so the page is accurate on first load
  await supabase.rpc("sweep_expired_reservations", { p_sale_id: sale.id });

  const { data: items } = await supabase
    .from("items")
    .select("*, item_photos(*)")
    .eq("sale_id", sale.id)
    .order("created_at", { ascending: false });

  return <ShopView sale={sale} initialItems={items || []} />;
}
