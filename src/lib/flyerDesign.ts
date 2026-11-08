/** The flyer builder's settings and what a flyer shows, as pure data (no
 * browser code) so the controls, preview and printed page all agree. Flyers
 * have no item photos: they're for mailbox drops, notice boards and handing
 * out, where a QR code to the sale page does the showing. */

import { COLORS, TITLE_MAX, type SignColor } from "@/lib/signDesign";

export interface FlyerDesign {
  title: string;
  color: SignColor;
  showName: boolean;
  showTagline: boolean;
  showDates: boolean;
  address: "off" | "street" | "full";
  showCategories: boolean;
  qr: boolean;
  /** quarter = 4 per sheet, cut apart; full = 1 per sheet. */
  layout: "quarter" | "full";
}

export const DEFAULT_FLYER: FlyerDesign = {
  title: "YARD SALE",
  color: "black",
  showName: true,
  showTagline: false,
  showDates: true,
  address: "street",
  showCategories: true,
  qr: true,
  layout: "quarter",
};

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

export function normalizeFlyer(raw: unknown): FlyerDesign {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_FLYER;
  return {
    title: (typeof r.title === "string" ? r.title.slice(0, TITLE_MAX) : "").trim() || d.title,
    color: oneOf(r.color, ["black", "red", "blue"] as const, d.color),
    showName: bool(r.showName, d.showName),
    showTagline: bool(r.showTagline, d.showTagline),
    showDates: bool(r.showDates, d.showDates),
    address: oneOf(r.address, ["off", "street", "full"] as const, d.address),
    showCategories: bool(r.showCategories, d.showCategories),
    qr: bool(r.qr, d.qr),
    layout: oneOf(r.layout, ["quarter", "full"] as const, d.layout),
  };
}

export type FlyerBlock =
  | { kind: "title"; text: string; color: string; weight: number }
  | { kind: "name" | "tagline" | "address" | "categories"; text: string; weight: number }
  | { kind: "dates"; lines: string[]; weight: number }
  | { kind: "qr"; weight: number };

/** The flyer's blocks top to bottom, each with its share of the height.
 * Blocks with nothing to show (no tagline, no address yet…) are left out. */
export function flyerBlocks(
  design: FlyerDesign,
  sale: { name: string; tagline: string | null; street: string; city: string },
  dateLines: string[],
  categories: string[]
): FlyerBlock[] {
  const blocks: FlyerBlock[] = [{ kind: "title", text: design.title, color: COLORS[design.color], weight: 2.2 }];
  const name = sale.name?.trim();
  if (design.showName && name) blocks.push({ kind: "name", text: name, weight: 1.2 });
  const tagline = sale.tagline?.trim();
  if (design.showTagline && tagline) blocks.push({ kind: "tagline", text: tagline, weight: 0.9 });
  if (design.showDates) {
    const lines = dateLines.length ? dateLines.slice(0, 4) : ["Dates coming soon"];
    blocks.push({ kind: "dates", lines, weight: 0.75 * lines.length + 0.25 });
  }
  const street = sale.street?.trim();
  if (design.address !== "off" && street) {
    const text = design.address === "full" && sale.city?.trim() ? `${street}, ${sale.city.trim()}` : street;
    blocks.push({ kind: "address", text, weight: 0.9 });
  }
  if (design.showCategories && categories.length)
    blocks.push({ kind: "categories", text: categories.slice(0, 4).join(" · "), weight: 0.7 });
  if (design.qr) blocks.push({ kind: "qr", weight: 4.2 });
  return blocks;
}
