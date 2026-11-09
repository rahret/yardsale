import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { accessFor } from "@/lib/billing";
import { publicPhotoUrl } from "@/lib/share";
import { SNAP_LIMITS, costUsd } from "@/lib/snapList";
import { getAnthropic, snapAiEnabled, snapModel, suggestListing } from "@/lib/snapListServer";

// Snap & list: the seller has uploaded a photo to their sale's folder; this
// asks Claude for a suggested listing (name, category, price, description).
// Nothing is saved as an item here: the seller reviews and adds it.
// Limits: SNAP_LIMITS per day and during the trial (env-overridable), and
// every call is logged in ai_suggestions.
export async function POST(request: NextRequest) {
  const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return fail("You're signed out — refresh the page and log in again.", 401);

  const anthropic = snapAiEnabled() ? getAnthropic() : null;
  const admin = createAdminClient();
  if (!anthropic || !admin) return fail("Suggestions aren't switched on — fill this one in yourself.", 503);

  const body = await request.json().catch(() => null);
  const saleId = typeof body?.saleId === "string" ? body.saleId : "";
  const path = typeof body?.path === "string" ? body.path : "";
  // the photo must be in this sale's folder (where only the owner can upload)
  if (!saleId || !path.startsWith(`${saleId}/`) || path.includes("..")) return fail("Missing photo.", 400);

  const { data: sale } = await admin.from("sales").select("id, owner_id").eq("id", saleId).maybeSingle();
  if (!sale || sale.owner_id !== user.id) return fail("Sale not found.", 404);

  const { data: billing } = await admin
    .from("account_billing")
    .select("plan, subscription_status, pass_expires_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const access = accessFor(billing);
  if (access === "none") return fail("Choose a plan to use Snap & list.", 403);

  const perDay = Number(process.env.SNAP_LIMIT_PER_DAY) || SNAP_LIMITS.perDay;
  const trialTotal = Number(process.env.SNAP_LIMIT_TRIAL) || SNAP_LIMITS.trialTotal;
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count: today }, { count: ever }] = await Promise.all([
    admin.from("ai_suggestions").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", dayAgo),
    access === "trial"
      ? admin.from("ai_suggestions").select("id", { count: "exact", head: true }).eq("user_id", user.id)
      : Promise.resolve({ count: 0 }),
  ]);
  if ((today ?? 0) >= perDay) return fail(`You've used Snap & list ${perDay} times today — try again tomorrow, or add items by hand.`, 429);
  if (access === "trial" && (ever ?? 0) >= trialTotal) {
    return fail("You've used all of Snap & list's free-trial suggestions — upgrade to keep using it.", 403);
  }

  const { data: items } = await admin.from("items").select("category").eq("sale_id", saleId).limit(500);
  const categories = Array.from(new Set((items || []).map((i) => (i.category || "").trim()).filter(Boolean)));

  const model = snapModel();
  try {
    const result = await suggestListing(anthropic, publicPhotoUrl(path), categories, model);
    await admin.from("ai_suggestions").insert({
      user_id: user.id,
      sale_id: saleId,
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: costUsd(result.model, result.inputTokens, result.outputTokens),
      ok: !!result.suggestion,
    });
    if (!result.suggestion) {
      return fail("Couldn't make out an item in that photo — fill it in yourself, or try another photo.", 422);
    }
    return NextResponse.json({ suggestion: result.suggestion });
  } catch (e) {
    console.error("Snap & list suggestion failed", e);
    if (e instanceof Anthropic.RateLimitError) return fail("Lots of photos at once — this one will retry in a moment.", 429);
    return fail("Couldn't get a suggestion right now — fill it in yourself, or try again.", 502);
  }
}
