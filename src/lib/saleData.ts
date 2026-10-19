import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Item, Sale, SaleDay } from "@/lib/types";
import { siteOrigin } from "@/lib/utils";
import { salePhase } from "@/lib/share";

export interface PublicSale {
  sale: Sale;
  items: Item[];
  days: SaleDay[];
}

/** Loads a published sale with its items and days, as an anonymous visitor
 * would see it. Wrapped in React's cache() so generateMetadata and the page
 * share one fetch per request. Returns null for unknown or draft sales. */
export const loadPublicSale = cache(async (slug: string): Promise<PublicSale | null> => {
  const supabase = createClient();
  const { data: sale } = await supabase.from("sales").select("*").eq("slug", slug).maybeSingle();
  if (!sale) return null;

  const [{ data: items }, { data: days }] = await Promise.all([
    supabase.from("items").select("*, item_photos(*)").eq("sale_id", sale.id).order("created_at", { ascending: false }),
    supabase.from("sale_days").select("*").eq("sale_id", sale.id).order("date", { ascending: true }),
  ]);
  return { sale, items: items || [], days: days || [] };
});

/** Absolute origin for links in previews (social sites need absolute URLs). */
export function requestOrigin(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return siteOrigin(`${proto}://${host}`);
}

/** Changes whenever anything shown in the preview image changes, so social
 * sites (which cache images by URL) fetch a fresh one. */
export function previewVersion({ sale, items, days }: PublicSale): string {
  const stamps = [
    sale.updated_at,
    ...items.map((i) => i.updated_at),
    ...items.flatMap((i) => (i.item_photos || []).map((p) => p.created_at)),
    ...days.map((d) => d.created_at),
  ];
  const latest = stamps.reduce((a, b) => (b > a ? b : a), "");
  const photos = items.reduce((n, i) => n + (i.item_photos?.length || 0), 0);
  const raw = `${latest}|${items.length}|${photos}|${days.length}|${salePhase(sale, days)}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
