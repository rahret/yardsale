import { createClient } from "@/lib/supabase/server";
import WelcomeWizard from "@/components/WelcomeWizard";

export const dynamic = "force-dynamic";

// First-time sellers land here after confirming their email: a short wizard
// that creates their first sale.
export default async function WelcomePage() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  return <WelcomeWizard displayName={user?.user_metadata?.display_name || ""} />;
}
