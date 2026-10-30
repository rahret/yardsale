import Link from "next/link";
import SiteMenu from "@/components/SiteMenu";

/** Top bar for the public pages: logo and the ☰ menu. */
export default function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="relative z-40 w-full flex items-center justify-between gap-3 px-5 py-4 max-w-5xl mx-auto">
      <Link href="/" className="font-marker text-xl sm:text-2xl text-marker -rotate-1 inline-block whitespace-nowrap">
        Yard Sale QR
      </Link>
      <SiteMenu signedIn={signedIn} />
    </header>
  );
}
