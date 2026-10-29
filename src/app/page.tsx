import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FindSales from "@/components/FindSales";
import { toListing, type Listing } from "@/lib/directory";
import type { Item, Sale, SaleDay } from "@/lib/types";

export const dynamic = "force-dynamic";

// Home page for both audiences: buyers search upcoming listed sales; sellers
// log in or get started.
export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
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
      <header className="flex items-center justify-between gap-3 px-5 py-4 max-w-5xl mx-auto">
        <Link href="/" className="font-marker text-xl sm:text-2xl text-marker -rotate-1 inline-block whitespace-nowrap">
          Yard Sale QR
        </Link>
        <nav className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap">
          {user ? (
            <Link href="/dashboard" className="bg-ink text-chalk font-bold px-4 py-2 rounded-full text-sm">
              My sales
            </Link>
          ) : (
            <>
              <Link href="/login" className="font-semibold px-2 sm:px-3 py-2 text-sm">
                Log in
              </Link>
              <Link href="/signup" className="bg-grass text-white font-bold px-3.5 sm:px-4 py-2 rounded-full text-sm shadow-tag">
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-5 pb-12">
        <FindSales listings={listings} />

        <section className="mt-12 bg-white border-2 border-cardboard-dark rounded-2xl p-6 shadow-tag">
          <div className="font-marker text-3xl text-marker -rotate-1 mb-2">Having a yard sale?</div>
          <p className="opacity-75 mb-5 max-w-xl">
            Turn your sign into a storefront. Buyers see what you&apos;re selling before they drive over.
          </p>
          <div className="grid gap-3 sm:grid-cols-3 mb-6">
            {[
              ["🪧", "A sign with a QR code", "Print a sign and QR code that link to your sale page."],
              ["📸", "Buyers browse first", "Photos, prices and what's left — so the right buyers show up."],
              ["💳", "Holds & Buy Now", "Let buyers hold items or pay online and pick up with a code."],
            ].map(([icon, title, body]) => (
              <div key={title} className="bg-chalk border-2 border-cardboard-dark/50 rounded-xl p-4">
                <div className="text-2xl mb-1">{icon}</div>
                <div className="font-bold text-sm">{title}</div>
                <div className="text-xs opacity-70 mt-0.5">{body}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 flex-wrap">
            <Link
              href={user ? "/dashboard" : "/signup"}
              className="bg-grass text-white font-bold px-6 py-3 rounded-lg shadow-tag"
            >
              {user ? "Go to my sales" : "Get started — it's free"}
            </Link>
            {!user && (
              <Link href="/login" className="border-2 border-cardboard-dark font-bold px-6 py-3 rounded-lg bg-white">
                Log in
              </Link>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
