import { NextResponse } from "next/server";
import { allow } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { sendEmailDetailed } from "@/lib/email";
import { testEmail } from "@/lib/alertEmails";
import { serverSetup } from "@/lib/serverSetup";
import { siteOrigin } from "@/lib/utils";

// "Send me a test email" on the Account page: sends one email to the signed-in
// seller's own login address and reports exactly what went wrong if it didn't
// go out (a missing setting, or ZeptoMail's own error message).
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false, reason: "Log in again and retry." }, { status: 401 });

  // one test email a minute and ten a day, per seller
  if (!(await allow("testEmail", user.id)) || !(await allow("testEmailDaily", user.id))) {
    return NextResponse.json({ ok: false, reason: "You just sent one — wait a minute and try again." }, { status: 429 });
  }

  const { emailMissing } = serverSetup();
  if (emailMissing.length) {
    return NextResponse.json({ ok: false, reason: `Not set on the server: ${emailMissing.join(", ")}.` });
  }
  const link = `${siteOrigin("https://yardsaleqr.rahretinnovationlabs.com")}/dashboard/account`;
  const result = await sendEmailDetailed({ to: user.email, ...testEmail(link) });
  return NextResponse.json({ ...result, to: user.email });
}
