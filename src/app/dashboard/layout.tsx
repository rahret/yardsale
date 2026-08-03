import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
      <div className="flex items-center justify-between px-5 py-4 border-b-2 border-cardboard-dark bg-white">
        <a href="/dashboard" className="font-marker text-2xl text-marker -rotate-1 inline-block">
          Garage Sale HQ
        </a>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm font-semibold border-2 border-cardboard-dark rounded-full px-4 py-1.5"
          >
            Log out
          </button>
        </form>
      </div>
      <div className="max-w-3xl mx-auto">{children}</div>
    </div>
  );
}
