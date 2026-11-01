/** The sign builder's settings: what goes on a printed sign and how big.
 * Pure data and helpers (no browser code), shared by the builder's controls,
 * its preview and the printed page. */

export type BlockSize = "off" | "s" | "m" | "l";
export type Arrow = "none" | "left" | "right" | "up";
export type SignColor = "black" | "red" | "blue";
export type ExtraLine = "none" | "tagline" | "categories" | "custom";

export interface SignDesign {
  title: string;
  titleSize: Exclude<BlockSize, "off">;
  /** Colour of the title and arrow (everything else prints black). */
  color: SignColor;
  arrow: Arrow;
  arrowSize: Exclude<BlockSize, "off">;
  /** A few words under the arrow, e.g. "2 blocks". */
  arrowNote: string;
  qr: BlockSize;
  /** "Scan for photos & prices" under the QR code. */
  qrCaption: boolean;
  address: BlockSize;
  /** Street only, or street plus city. */
  addressStyle: "street" | "full";
  dates: BlockSize;
  extra: ExtraLine;
  extraText: string;
  orientation: "landscape" | "portrait";
  /** 2 = two copies on one sheet, cut in half. */
  perSheet: 1 | 2;
}

export const TITLE_MAX = 16;
export const ARROW_NOTE_MAX = 16;
export const EXTRA_MAX = 32;

export const TITLE_PRESETS = [
  "YARD SALE",
  "GARAGE SALE",
  "ESTATE SALE",
  "MOVING SALE",
  "RUMMAGE SALE",
  "BARN SALE",
  "MULTI-FAMILY",
  "SALE TODAY",
] as const;

export const COLORS: Record<SignColor, string> = { black: "#000000", red: "#c8102e", blue: "#0b4fa8" };

export const DEFAULT_DESIGN: SignDesign = {
  title: "YARD SALE",
  titleSize: "l",
  color: "black",
  arrow: "none",
  arrowSize: "m",
  arrowNote: "",
  qr: "m",
  qrCaption: true,
  address: "m",
  addressStyle: "street",
  dates: "m",
  extra: "none",
  extraText: "",
  orientation: "landscape",
  perSheet: 1,
};

/** One-tap starting points; the seller can adjust anything afterwards. */
export const SIGN_PRESETS: { key: string; label: string; design: Partial<SignDesign> }[] = [
  {
    key: "main",
    label: "🏠 Main sign",
    design: { arrow: "none", qr: "m", address: "m", dates: "m", titleSize: "l", perSheet: 1 },
  },
  {
    key: "left",
    label: "⬅️ Arrow left",
    design: { arrow: "left", arrowSize: "l", qr: "s", address: "s", dates: "off", titleSize: "m", perSheet: 1 },
  },
  {
    key: "right",
    label: "➡️ Arrow right",
    design: { arrow: "right", arrowSize: "l", qr: "s", address: "s", dates: "off", titleSize: "m", perSheet: 1 },
  },
  {
    key: "ahead",
    label: "⬆️ Straight ahead",
    design: { arrow: "up", arrowSize: "l", qr: "s", address: "s", dates: "off", titleSize: "m", perSheet: 1 },
  },
  {
    key: "half",
    label: "✂️ 2 small arrow signs",
    design: { arrow: "right", arrowSize: "m", qr: "off", address: "s", dates: "off", titleSize: "l", perSheet: 2 },
  },
];

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const text = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.slice(0, max) : fallback);

/** A design from storage (or anywhere untrusted), with every field checked
 * and anything missing or invalid replaced by the default. */
export function normalizeDesign(raw: unknown): SignDesign {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_DESIGN;
  const sizes = ["off", "s", "m", "l"] as const;
  const onSizes = ["s", "m", "l"] as const;
  return {
    title: text(r.title, TITLE_MAX).trim() || d.title,
    titleSize: oneOf(r.titleSize, onSizes, d.titleSize),
    color: oneOf(r.color, ["black", "red", "blue"] as const, d.color),
    arrow: oneOf(r.arrow, ["none", "left", "right", "up"] as const, d.arrow),
    arrowSize: oneOf(r.arrowSize, onSizes, d.arrowSize),
    arrowNote: text(r.arrowNote, ARROW_NOTE_MAX),
    qr: oneOf(r.qr, sizes, d.qr),
    qrCaption: typeof r.qrCaption === "boolean" ? r.qrCaption : d.qrCaption,
    address: oneOf(r.address, sizes, d.address),
    addressStyle: oneOf(r.addressStyle, ["street", "full"] as const, d.addressStyle),
    dates: oneOf(r.dates, sizes, d.dates),
    extra: oneOf(r.extra, ["none", "tagline", "categories", "custom"] as const, d.extra),
    extraText: text(r.extraText, EXTRA_MAX),
    orientation: oneOf(r.orientation, ["landscape", "portrait"] as const, d.orientation),
    perSheet: r.perSheet === 2 ? 2 : 1,
  };
}

/** How much of the sign's height each band gets (relative weights). */
export const TITLE_WEIGHT = { s: 1.1, m: 1.6, l: 2.2 } as const;
export const ARROW_WEIGHT = { s: 1.4, m: 2.2, l: 3.2 } as const;
/** How much of the details column each line gets. */
export const DETAIL_WEIGHT = { off: 0, s: 1, m: 1.5, l: 2.1 } as const;
/** The QR code's share of the sign's width (landscape, beside the text). */
export const QR_WIDTH = { off: 0, s: 0.3, m: 0.42, l: 0.55 } as const;
/** The QR code's band height (portrait, below the text), relative to the others. */
export const QR_WEIGHT = { off: 0, s: 2.2, m: 3.2, l: 4.4 } as const;

/** The lines a sign shows, from the design and the sale. */
export function signContent(
  design: SignDesign,
  sale: { street: string; city: string; state: string; tagline: string | null },
  dateLines: string[],
  categories: string[]
): { address: string | null; dates: string[] | null; extra: string | null } {
  const street = sale.street?.trim() || "";
  const address =
    design.address === "off" || !street
      ? null
      : design.addressStyle === "full" && sale.city?.trim()
        ? `${street}, ${sale.city.trim()}`
        : street;
  const dates = design.dates === "off" ? null : dateLines.length ? dateLines : ["Dates coming soon"];
  const extra =
    design.extra === "tagline"
      ? sale.tagline?.trim() || null
      : design.extra === "categories"
        ? categories.slice(0, 3).join(" · ") || null
        : design.extra === "custom"
          ? design.extraText.trim() || null
          : null;
  return { address, dates, extra };
}
