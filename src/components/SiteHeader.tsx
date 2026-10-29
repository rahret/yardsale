import Link from "next/link";

/** Top bar for the public pages: logo, and Log in / Get started for sellers
 * (or "My sales" when signed in). */
export default function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="w-full flex items-center justify-between gap-3 px-5 py-4 max-w-5xl mx-auto">
      <Link href="/" className="font-marker text-xl sm:text-2xl text-marker -rotate-1 inline-block whitespace-nowrap">
        Yard Sale QR
      </Link>
      <nav className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap">
        {signedIn ? (
          <Link href="/dashboard" className="bg-ink text-chalk font-bold px-4 py-2 rounded-full text-sm">
            My sales
          </Link>
        ) : (
          <>
            <Link href="/login" className="font-semibold px-2 sm:px-3 py-2 text-sm">
              Log in
            </Link>
            <Link
              href="/signup"
              className="bg-grass text-white font-bold px-3.5 sm:px-4 py-2 rounded-full text-sm shadow-tag"
            >
              Get started
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
