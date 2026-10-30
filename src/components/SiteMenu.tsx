"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** The ☰ menu in the top bar. Signed-out visitors get the buyer and seller
 * pages plus Log in / Get started; signed-in sellers get their sales,
 * account and Log out. */
export default function SiteMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // close on navigation, outside click, or Escape
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "block w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-chalk-dim";
  const links: { href: string; label: string }[] = signedIn
    ? [
        { href: "/dashboard", label: "🏷️ My sales" },
        { href: "/dashboard/account", label: "👤 Account" },
        { href: "/find", label: "🔍 Find yard sales" },
      ]
    : [
        { href: "/find", label: "🔍 Find yard sales" },
        { href: "/sell", label: "🏷️ Sell at a yard sale" },
      ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => setOpen((o) => !o)}
        className="w-11 h-11 flex items-center justify-center rounded-full border-2 border-cardboard-dark bg-white"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          {open ? (
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          ) : (
            <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {open && (
        <div
          id="site-menu"
          className="absolute right-0 mt-2 w-60 bg-white border-2 border-cardboard-dark rounded-xl shadow-tag overflow-hidden z-50 animate-slideup"
        >
          <nav className="py-1.5">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={pathname === l.href ? "page" : undefined}
                className={`${item} ${pathname === l.href ? "text-grass-dark" : ""}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className={`border-t-2 border-dashed border-cardboard/60 ${signedIn ? "py-1.5" : "p-2"}`}>
            {signedIn ? (
              <form action="/auth/signout" method="post">
                <button type="submit" className={item}>
                  ↩️ Log out
                </button>
              </form>
            ) : (
              <div className="grid gap-2">
                <Link href="/login" className="text-center border-2 border-cardboard-dark rounded-lg py-2 text-sm font-bold">
                  Log in
                </Link>
                <Link href="/signup" className="text-center bg-grass text-white rounded-lg py-2 text-sm font-bold">
                  Get started
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
