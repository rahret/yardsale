import { NextResponse, type NextRequest } from "next/server";
import { allow, clientIp } from "@/lib/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyBuyerHoldPlaced, notifyHoldPlaced } from "@/lib/alerts";

// The buyer's page calls this right after a hold succeeds, so the seller is
// emailed, and the buyer too if they gave an email. Holds are placed by the
// reserve_item database function, which can't send email itself. Safe to call
// by anyone: it only ever emails about a hold placed in the last few minutes,
// and only once per hold.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" && /^[0-9a-f-]{36}$/i.test(body.itemId) ? body.itemId : null;
  if (!itemId) return NextResponse.json({ error: "Missing item." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) {
    console.error("Hold emails not sent: SUPABASE_SERVICE_ROLE_KEY isn't set on the server");
    return NextResponse.json({ sent: false });
  }
  if (!(await allow("holdAlert", clientIp(request.headers), admin))) {
    return NextResponse.json({ sent: false }, { status: 429 });
  }
  const [seller, buyer] = await Promise.all([notifyHoldPlaced(admin, itemId), notifyBuyerHoldPlaced(admin, itemId)]);
  return NextResponse.json({ sent: seller === "seller notified", buyerEmailed: buyer === "buyer notified" });
}
