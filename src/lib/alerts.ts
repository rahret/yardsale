import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email";
import { buyerHoldEmail, buyerOrderEmail, holdPlacedEmail, orderPaidEmail } from "./alertEmails";
import { currentDays } from "./share";
import { formatAddress, formatSaleDay, siteOrigin, sortSaleDays } from "./utils";
import type { SaleDay } from "./types";

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

function origin(): string {
  return siteOrigin("https://yardsaleqr.rahretinnovationlabs.com"); // honors NEXT_PUBLIC_SITE_URL
}

function saleLink(saleId: string, anchor = ""): string {
  return `${origin()}/dashboard/sales/${saleId}${anchor}`;
}

/** "2:45 PM" in the sale's time zone. */
function clockTime(at: Date, timezone: string | null): string {
  return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone || "America/Chicago" });
}

/** The sale's address and remaining days, for buyer emails. */
async function pickupInfo(admin: SupabaseClient, saleId: string) {
  const [{ data: sale }, { data: days }] = await Promise.all([
    admin.from("sales").select("id, slug, name, street, city, state, zip, timezone").eq("id", saleId).maybeSingle(),
    admin.from("sale_days").select("date, start_time, end_time").eq("sale_id", saleId),
  ]);
  if (!sale) return null;
  return {
    sale,
    address: sale.street ? formatAddress(sale) : null,
    days: currentDays(sale, sortSaleDays((days || []) as SaleDay[])).map(formatSaleDay),
  };
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
    const holdUntil = clockTime(new Date(new Date(hold.created_at).getTime() + minutes * 60_000), sale.timezone);

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

/** Emails the buyer their pickup code after a Buy Now payment (if Stripe
 * gave us their email). Claimed once via buyer_notified_at. */
export async function notifyBuyerOrderPaid(admin: SupabaseClient, orderId: string): Promise<string> {
  try {
    const { data: claimed } = await admin
      .from("orders")
      .update({ buyer_notified_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("status", "paid")
      .is("buyer_notified_at", null)
      .not("buyer_email", "is", null)
      .select("id, sale_id, item_name, amount_cents, pickup_code, buyer_name, buyer_email, stripe_checkout_session_id")
      .maybeSingle();
    if (!claimed?.buyer_email) return "nothing to send";

    const info = await pickupInfo(admin, claimed.sale_id);
    if (!info) return "no sale";
    const link = claimed.stripe_checkout_session_id
      ? `${origin()}/s/${info.sale.slug}/order?session_id=${encodeURIComponent(claimed.stripe_checkout_session_id)}`
      : `${origin()}/s/${info.sale.slug}`;
    const sent = await sendEmail({
      to: claimed.buyer_email,
      toName: claimed.buyer_name || undefined,
      ...buyerOrderEmail({
        saleName: info.sale.name,
        itemName: claimed.item_name,
        amountCents: claimed.amount_cents,
        pickupCode: claimed.pickup_code,
        address: info.address,
        days: info.days,
        link,
      }),
    });
    if (!sent) {
      await admin.from("orders").update({ buyer_notified_at: null }).eq("id", orderId);
      return "send failed";
    }
    return "buyer notified";
  } catch (e) {
    console.error("Buyer order email failed", e);
    return "error";
  }
}

/** Emails the buyer a confirmation of the hold they just placed, if they
 * gave an email. Only for holds from the last few minutes, and only once. */
export async function notifyBuyerHoldPlaced(admin: SupabaseClient, itemId: string, now = Date.now()): Promise<string> {
  try {
    const since = new Date(now - HOLD_ALERT_WINDOW_MS).toISOString();
    const { data: hold } = await admin
      .from("item_holds")
      .update({ buyer_notified_at: new Date(now).toISOString() })
      .eq("item_id", itemId)
      .is("buyer_notified_at", null)
      .not("email", "is", null)
      .gte("created_at", since)
      .select("item_id, sale_id, name, email, created_at")
      .maybeSingle();
    if (!hold?.email) return "nothing to send";

    const [{ data: item }, info, { data: saleRow }] = await Promise.all([
      admin.from("items").select("name, price, reservation_minutes").eq("id", itemId).maybeSingle(),
      pickupInfo(admin, hold.sale_id),
      admin.from("sales").select("default_reservation_minutes").eq("id", hold.sale_id).maybeSingle(),
    ]);
    if (!item || !info) return "no item";
    const minutes = item.reservation_minutes ?? saleRow?.default_reservation_minutes ?? 30;
    const holdUntil = clockTime(new Date(new Date(hold.created_at).getTime() + minutes * 60_000), info.sale.timezone);

    const sent = await sendEmail({
      to: hold.email,
      toName: hold.name,
      ...buyerHoldEmail({
        saleName: info.sale.name,
        itemName: item.name,
        price: Number(item.price) || 0,
        buyerName: hold.name,
        holdUntil,
        address: info.address,
        days: info.days,
        link: `${origin()}/s/${info.sale.slug}?item=${itemId}`,
      }),
    });
    if (!sent) {
      await admin.from("item_holds").update({ buyer_notified_at: null }).eq("item_id", itemId);
      return "send failed";
    }
    return "buyer notified";
  } catch (e) {
    console.error("Buyer hold email failed", e);
    return "error";
  }
}
