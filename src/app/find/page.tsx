import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import FindSales from "@/components/FindSales";
import { isSignedIn } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find yard sales near you · Yard Sale QR",
  description: "Search upcoming yard sales near you and see photos and prices before you go.",
};

// Buyers: search upcoming sales that sellers have listed, near a place the
// buyer types or their current location. Nothing is listed until they pick
// one; results come from /api/sales/search.
export default async function FindPage() {
  const signedIn = await isSignedIn();
  return (
    <div className="min-h-screen">
      <SiteHeader signedIn={signedIn} />
      <main className="max-w-5xl mx-auto px-5 pb-12">
        <FindSales />
      </main>
    </div>
  );
}
