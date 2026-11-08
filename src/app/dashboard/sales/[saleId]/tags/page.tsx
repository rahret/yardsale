import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TagsBuilder from "@/components/TagsBuilder";
import { requestOrigin } from "@/lib/saleData";
import { saleLink } from "@/lib/share";

export const dynamic = "force-dynamic";

// Printable price tags for one of the seller's sales.
export default async function TagsPage({ params }: { params: { saleId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: sale } = await supabase.from("sales").select("id, name, slug, owner_id").eq("id", params.saleId).maybeSingle();
  // published sales are readable by anyone, so check ownership explicitly
  if (!sale || !user || sale.owner_id !== user.id) notFound();

  const { data: items } = await supabase
    .from("items")
    .select("id, name, price, quantity_total, status, sort_order, created_at")
    .eq("sale_id", sale.id)
    .neq("status", "sold")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const origin = requestOrigin();
  return (
    <TagsBuilder
      saleId={sale.id}
      saleName={sale.name}
      items={(items || []).map((i) => ({
        id: i.id as string,
        name: i.name as string,
        price: Number(i.price) || 0,
        bulk: (i.quantity_total as number) > 1,
        url: saleLink(origin, sale.slug, { item: i.id as string, src: "tag" }),
      }))}
    />
  );
}
