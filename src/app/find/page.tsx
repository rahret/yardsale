import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import FindSales from "@/components/FindSales";
import { isSignedIn } from "@/lib/currentUser";
import { toListing, type Listing } from "@/lib/directory";
import type { Item, Sale, SaleDay } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find yard sales near you · Yard Sale QR",
  description: "Search upcoming yard sales by ZIP or city and see photos and prices before you go.",
};

// Buyers: search upcoming sales that sellers have listed.
export default async function FindPage() {
  const signedIn = await isSignedIn();
  const { data } = await createClient()
    .from("sales")
    .select(
      "slug, name, tagline, street, city, state, zip, show_full_address, timezone, status, sale_days(date, start_time, end_time), items(category, status, item_photos(storage_path, position))"
    )
    .eq("status", "live")
    .eq("listed", true)
    .order("updated_at", { ascending: false })
    .limit(200);

  const listings = (data || [])
    .map((s) => toListing(s as unknown as Sale, (s.sale_days || []) as SaleDay[], (s.items || []) as unknown as Item[]))
    .filter((l): l is Listing => !!l)
    .sort((a, b) => a.days[0].date.localeCompare(b.days[0].date));

  return (
    <div className="min-h-screen">
      <SiteHeader signedIn={signedIn} />
      <main className="max-w-5xl mx-auto px-5 pb-12">
        <FindSales listings={listings} />
      </main>
    </div>
  );
}
