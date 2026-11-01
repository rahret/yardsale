import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAddress } from "@/lib/geocode";
import { addressFormatError, normalizeAddress } from "@/lib/address";

// Checks that an address a seller typed is a real street address before it's
// saved (sale page, welcome wizard, Account page). Signed-in sellers only;
// lookups are spaced a second apart for OpenStreetMap's usage policy.
let lastLookup = 0;

export async function POST(request: NextRequest) {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "You're signed out — log in again." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const address = normalizeAddress({
    street: String(body?.street ?? "").slice(0, 120),
    city: String(body?.city ?? "").slice(0, 80),
    state: String(body?.state ?? "").slice(0, 20),
    zip: String(body?.zip ?? "").slice(0, 12),
  });
  const formatError = addressFormatError(address);
  if (formatError) return NextResponse.json({ status: "invalid", error: formatError, address });

  const wait = lastLookup + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastLookup = Date.now();

  const check = await verifyAddress(address);
  return NextResponse.json({ ...check, address });
}
