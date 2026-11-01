import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email";
import { holdPlacedEmail, orderPaidEmail } from "./alertEmails";
import { siteOrigin } from "./utils";

// Emails the seller when someone buys or holds one of their items. Each alert
// is claimed in the database first (seller_notified_at), so a repeated Stripe
// webhook or a second tab can't send it twice; a failed send releases the
// claim so a later attempt can retry. Never throws.

/** Hold alerts are only sent for holds placed in the last few minutes. */
const HOLD_ALERT_WINDOW_MS = 10 * 60 * 1000;

interface SaleRow {
  id: string;
  name: string;
  owner_id: string;
  timezone: string | null;
  default_reservation_minutes: number | null;
}

async function sellerAddress(admin: SupabaseClient, ownerId: string): Promise<{ email: string; name?: string } | null> {
  const { data: profile } = await admin.from("profiles").select("display_name, email_alerts").eq("id", ownerId).maybeSingle();
  if (profile && profile.email_alerts === false) return null;
  const { data } = await admin.auth.admin.getUserById(ownerId);
  const email = data?.user?.email;
  return email ? { email, name: profile?.display_name || undefined } : null;
}

function saleLink(saleId: string, anchor = ""): string {
  return `${siteOrigin("https://yardsaleqr.rahretinnovationlabs.com")}/dashboard/sales/${saleId}${anchor}`;
}

/** A Buy Now order was just paid. */
export async function notifyOrderPaid(admin: SupabaseClient, orderId: string): Promise<string> {
  try {
    const { data: claimed } = await admin
      .from("orders")
      .update({ seller_notified_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("status", "paid")
      .is("seller_notified_at", null)
      .select("id, sale_id, item_name, amount_cents, fee_cents, pickup_code, buyer_name, buyer_email")
      .maybeSingle();
    if (!claimed) return "already notified";

    const release = () => admin.from("orders").update({ seller_notified_at: null }).eq("id", orderId);
    const { data: sale } = await admin.from("sales").select("id, name, owner_id").eq("id", claimed.sale_id).maybeSingle();
    const to = sale ? await sellerAddress(admin, sale.owner_id) : null;
    if (!sale || !to) return "alerts off";

    const sent = await sendEmail({
      to: to.email,
      toName: to.name,
      ...orderPaidEmail({
        saleName: sale.name,
        itemName: claimed.item_name,
        amountCents: claimed.amount_cents,
        feeCents: claimed.fee_cents,
        pickupCode: claimed.pickup_code,
        buyerName: claimed.buyer_name,
        buyerEmail: claimed.buyer_email,
        link: saleLink(sale.id, "#orders"),
      }),
      replyTo: claimed.buyer_email || undefined,
    });
    if (!sent) {
      await release();
      return "send failed";
    }
    return "seller notified";
  } catch (e) {
    console.error("Order alert failed", e);
    return "error";
  }
}

/** A buyer just placed a hold (called by the buyer's page after reserve_item). */
export async function notifyHoldPlaced(admin: SupabaseClient, itemId: string, now = Date.now()): Promise<string> {
  try {
    const since = new Date(now - HOLD_ALERT_WINDOW_MS).toISOString();
    const { data: hold } = await admin
      .from("item_holds")
      .update({ seller_notified_at: new Date(now).toISOString() })
      .eq("item_id", itemId)
      .is("seller_notified_at", null)
      .gte("created_at", since)
      .select("item_id, sale_id, name, phone, created_at")
      .maybeSingle();
    if (!hold) return "nothing to send";

    const release = () => admin.from("item_holds").update({ seller_notified_at: null }).eq("item_id", itemId);
    const [{ data: item }, { data: sale }] = await Promise.all([
      admin.from("items").select("name, price, reservation_minutes").eq("id", itemId).maybeSingle(),
      admin
        .from("sales")
        .select("id, name, owner_id, timezone, default_reservation_minutes")
        .eq("id", hold.sale_id)
        .maybeSingle<SaleRow>(),
    ]);
    const to = sale ? await sellerAddress(admin, sale.owner_id) : null;
    if (!item || !sale || !to) return "alerts off";

    const minutes = item.reservation_minutes ?? sale.default_reservation_minutes ?? 30;
    const until = new Date(new Date(hold.created_at).getTime() + minutes * 60_000);
    const holdUntil = until.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: sale.timezone || "America/Chicago",
    });

    const sent = await sendEmail({
      to: to.email,
      toName: to.name,
      ...holdPlacedEmail({
        saleName: sale.name,
        itemName: item.name,
        price: Number(item.price) || 0,
        buyerName: hold.name,
        buyerPhone: hold.phone,
        holdUntil,
        link: saleLink(sale.id, "#items"),
      }),
    });
    if (!sent) {
      await release();
      return "send failed";
    }
    return "seller notified";
  } catch (e) {
    console.error("Hold alert failed", e);
    return "error";
  }
}
