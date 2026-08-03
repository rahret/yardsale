import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="font-marker text-5xl text-marker -rotate-1 mb-3">Yard Sale QR</div>
        <p className="text-base opacity-75 mb-8">
          Build a mobile-friendly garage sale page in minutes. Print a QR code, let buyers browse
          and reserve items in real time, and track what sold — all from your phone.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/signup" className="bg-grass text-white font-bold px-6 py-3 rounded-lg shadow-tag">
            Get started
          </Link>
          <Link href="/login" className="border-2 border-cardboard-dark font-bold px-6 py-3 rounded-lg">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
