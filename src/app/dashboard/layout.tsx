import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteMenu from "@/components/SiteMenu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <div className="relative z-40 flex items-center justify-between px-5 py-3 border-b-2 border-cardboard-dark bg-white">
        <a href="/dashboard" className="font-marker text-2xl text-marker -rotate-1 inline-block">
          Yard Sale QR
        </a>
        <SiteMenu signedIn />
      </div>
      <div className="max-w-3xl mx-auto">{children}</div>
    </div>
  );
}
