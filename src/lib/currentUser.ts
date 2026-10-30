import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Whether someone is signed in (for the public pages' header). */
export async function isSignedIn(): Promise<boolean> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  return !!user;
}
