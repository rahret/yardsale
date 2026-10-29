import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { isSignedIn } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// The front door: what the site is, then one big button per audience.
export default async function HomePage() {
  const signedIn = await isSignedIn();

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader signedIn={signedIn} />
      <main className="flex-1 flex items-center justify-center px-5 pb-16">
        <div className="max-w-2xl w-full text-center">
          <h1 className="font-marker text-5xl sm:text-6xl text-marker -rotate-1 mb-4">Yard Sale QR</h1>
          <p className="text-lg opacity-80 mb-2">
            Yard sales with a QR code on the sign — see what&apos;s for sale before you go.
          </p>
          <p className="opacity-65 mb-10 max-w-lg mx-auto">
            Buyers find nearby sales and browse photos and prices. Sellers build their sale in minutes, print a
            sign, and let buyers hold or buy items online.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/find"
              className="block bg-white border-2 border-cardboard-dark rounded-2xl p-6 shadow-tag hover:-translate-y-0.5 transition-transform"
            >
              <div className="text-5xl mb-2">🔍</div>
              <div className="font-marker text-3xl text-marker">Buyers</div>
              <div className="text-sm opacity-70 mt-1">Find yard sales near you</div>
            </Link>
            <Link
              href="/sell"
              className="block bg-grass text-white border-2 border-grass-dark rounded-2xl p-6 shadow-tag hover:-translate-y-0.5 transition-transform"
            >
              <div className="text-5xl mb-2">🏷️</div>
              <div className="font-marker text-3xl">New Sellers</div>
              <div className="text-sm opacity-90 mt-1">Set up your yard sale</div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
