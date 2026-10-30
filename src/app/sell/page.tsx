import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { isSignedIn } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sell at your yard sale · Yard Sale QR",
  description: "Build your yard sale page in minutes, print a QR sign, and let buyers hold or buy items online.",
};

const BENEFITS = [
  ["🪧", "A sign with a QR code", "Print a sign and QR code that link to your sale page."],
  ["📸", "Buyers browse first", "Photos, prices and what's left — so the right buyers show up."],
  ["💳", "Holds & Buy Now", "Let buyers hold items or pay online and pick up with a code."],
  ["📣", "Easy to share", "Link previews and ready-to-paste posts for Facebook, Nextdoor and texts."],
  ["🔍", "Found by nearby buyers", "List your sale so buyers searching your area can find it."],
  ["📊", "See what's working", "Visits from your sign, posts and searches, plus what sold."],
];

// New sellers: what they get, and how to start.
export default async function SellPage() {
  const signedIn = await isSignedIn();

  return (
    <div className="min-h-screen">
      <SiteHeader signedIn={signedIn} />
      <main className="max-w-5xl mx-auto px-5 pb-12">
        <div className="pt-4 pb-6">
          <h1 className="font-marker text-4xl sm:text-5xl text-marker -rotate-1 leading-tight">Having a yard sale?</h1>
          <p className="opacity-75 mt-2 max-w-xl">
            Turn your sign into a storefront. Buyers see what you&apos;re selling before they drive over — and it&apos;s
            free to start.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-8">
          {BENEFITS.map(([icon, title, body]) => (
            <div key={title} className="bg-white border-2 border-cardboard-dark rounded-xl p-4 shadow-tag">
              <div className="text-2xl mb-1">{icon}</div>
              <div className="font-bold">{title}</div>
              <div className="text-sm opacity-70 mt-0.5">{body}</div>
            </div>
          ))}
        </div>

        <div className="bg-white border-2 border-cardboard-dark rounded-2xl p-6 shadow-tag">
          <div className="font-bold text-lg mb-1">Get set up in a few minutes</div>
          <ol className="text-sm opacity-80 list-decimal ml-5 space-y-0.5 mb-5">
            <li>Create your free account.</li>
            <li>Add your sale&apos;s address, dates and items (snap photos as you go).</li>
            <li>Print your QR sign and share your link.</li>
          </ol>
          <div className="flex gap-3 flex-wrap">
            <Link
              href={signedIn ? "/dashboard" : "/signup"}
              className="bg-grass text-white font-bold px-6 py-3 rounded-lg shadow-tag"
            >
              {signedIn ? "Go to my sales" : "Get started — it's free"}
            </Link>
            {!signedIn && (
              <Link href="/login" className="border-2 border-cardboard-dark font-bold px-6 py-3 rounded-lg bg-white">
                I already have an account
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
