import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import FindSales from "@/components/FindSales";
import { isSignedIn } from "@/lib/currentUser";
import { searchListings } from "@/lib/directorySearch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find yard sales near you · Yard Sale QR",
  description: "Search upcoming yard sales near you and see photos and prices before you go.",
};

// Buyers: search upcoming sales that sellers have listed. The first page
// (soonest first, no location) is rendered here; the rest comes from
// /api/sales/search as the buyer changes filters.
export default async function FindPage() {
  const [signedIn, first] = await Promise.all([isSignedIn(), searchListings(createClient(), {})]);
  return (
    <div className="min-h-screen">
      <SiteHeader signedIn={signedIn} />
      <main className="max-w-5xl mx-auto px-5 pb-12">
        <FindSales initialListings={first.listings} initialTotal={first.total} />
      </main>
    </div>
  );
}
