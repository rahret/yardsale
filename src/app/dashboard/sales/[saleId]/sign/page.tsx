import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignBuilder from "@/components/SignBuilder";
import { requestOrigin } from "@/lib/saleData";
import { currentDays, saleLink, topCategories } from "@/lib/share";
import { formatSignSaleDay, sortSaleDays } from "@/lib/utils";
import type { Item, SaleDay } from "@/lib/types";

export const dynamic = "force-dynamic";

// The sign builder for one of the seller's sales.
export default async function SignPage({ params }: { params: { saleId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: sale } = await supabase.from("sales").select("*").eq("id", params.saleId).maybeSingle();
  // published sales are readable by anyone, so check ownership explicitly
  if (!sale || !user || sale.owner_id !== user.id) notFound();

  const [{ data: days }, { data: items }] = await Promise.all([
    supabase.from("sale_days").select("*").eq("sale_id", sale.id),
    supabase.from("items").select("category, status, quantity_total").eq("sale_id", sale.id),
  ]);
  // the sign shows only days still to come
  const dateLines = currentDays(sale, sortSaleDays((days || []) as SaleDay[])).map(formatSignSaleDay);

  return (
    <SignBuilder
      saleId={sale.id}
      saleName={sale.name}
      qrUrl={saleLink(requestOrigin(), sale.slug, { src: "qr" })}
      sale={{ street: sale.street || "", city: sale.city || "", state: sale.state || "", tagline: sale.tagline }}
      dateLines={dateLines}
      categories={topCategories((items || []) as Item[], 3)}
    />
  );
}
