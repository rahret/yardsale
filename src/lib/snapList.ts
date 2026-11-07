/** Snap & list: turning one item photo into a suggested listing (name,
 * category, price, description). The prompt, the answer's JSON shape, and the
 * checks on what comes back live here so the app and the model-comparison
 * script (scripts/compare-snap-models.ts) use exactly the same ones. */

/** The model the app uses unless SNAP_LIST_MODEL says otherwise. */
export const DEFAULT_SNAP_MODEL = "claude-opus-5-5";

/** List prices per million tokens (USD), from Anthropic's pricing page,
 * checked 2026-11-07. Used to log and report what each suggestion cost. */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = MODEL_PRICES[model];
  return p ? (inputTokens * p.input + outputTokens * p.output) / 1_000_000 : null;
}

/** Categories offered when the sale doesn't have a fitting one yet. */
export const COMMON_CATEGORIES = [
  "Furniture",
  "Kitchen",
  "Home decor",
  "Tools",
  "Outdoor & garden",
  "Electronics",
  "Toys & games",
  "Books & media",
  "Clothing & accessories",
  "Sporting goods",
  "Baby & kids",
  "Holiday",
  "Crafts",
  "Misc",
];

export type SnapIssue = "none" | "blurry" | "multiple_items" | "not_an_item";

export interface SnapSuggestion {
  name: string;
  category: string;
  /** Dollars. */
  price: number;
  description: string;
  /** More than 1 when the photo shows several identical items. */
  quantity: number;
  confidence: "high" | "medium" | "low";
  issue: SnapIssue;
}

/** The JSON shape the model must answer in (structured outputs). */
export const SNAP_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Short, specific listing title, at most 60 characters" },
    category: { type: "string" },
    price: { type: "number", description: "Suggested yard-sale price in US dollars" },
    description: { type: "string", description: "One or two short sentences, at most 200 characters" },
    quantity: { type: "integer", description: "How many identical items are shown (1 if just one)" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    issue: { type: "string", enum: ["none", "blurry", "multiple_items", "not_an_item"] },
  },
  required: ["name", "category", "price", "description", "quantity", "confidence", "issue"],
  additionalProperties: false,
} as const;

export const SNAP_SYSTEM_PROMPT = `You help people list items for a yard sale (garage sale) in the United States. You see one photo a seller just took and suggest a listing for the main item in it, which the seller will review before it's published.

- name: what a buyer would search for or recognise, specific but short (include a brand or model only if it's clearly visible). At most 60 characters. No price, no emoji.
- category: use one of the seller's existing categories when one fits; otherwise pick from the common categories you're given.
- price: a realistic yard-sale price for this item used, in US dollars. Yard-sale prices are low: usually 10–30% of the new retail price, less for worn or dated items, more for quality furniture, tools and collectibles in good shape. Round to a price people write on a sticker: 0.25, 0.50, 1, 2, 3, 5, then whole dollars, and multiples of 5 from $20 up. If several identical items are shown, give the price for one.
- description: one or two short, plain sentences about what it is and anything useful a buyer can see (size, material, condition, what's included). Only describe what's visible; never invent details like "works great" or "never used".
- quantity: how many identical items are shown; 1 for a single item.
- issue: "blurry" if the photo is too unclear to identify the item, "multiple_items" if it shows several different items (describe the most prominent one), "not_an_item" if there's nothing to sell in it, otherwise "none".
- confidence: how sure you are about what the item is and its price.`;

export function snapUserText(saleCategories: string[]): string {
  const own = saleCategories.filter(Boolean).slice(0, 30);
  return [
    own.length ? `The seller's existing categories: ${own.join(", ")}.` : "The seller hasn't made any categories yet.",
    `Common categories: ${COMMON_CATEGORIES.join(", ")}.`,
    "Suggest a listing for the item in this photo.",
  ].join("\n");
}

/** Prices people actually write on stickers (see the prompt). */
export function stickerPrice(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  if (dollars < 0.375) return 0.25;
  if (dollars < 0.75) return 0.5;
  if (dollars < 20) return Math.round(dollars);
  return Math.round(dollars / 5) * 5;
}

/** Checks and tidies the model's answer; null if it isn't usable. */
export function cleanSuggestion(raw: unknown, saleCategories: string[] = []): SnapSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  if (!name) return null;
  const rawCategory = typeof r.category === "string" ? r.category.trim().slice(0, 40) : "";
  // reuse the seller's spelling of a category the model echoed back
  const category =
    saleCategories.find((c) => c.toLowerCase() === rawCategory.toLowerCase()) ||
    COMMON_CATEGORIES.find((c) => c.toLowerCase() === rawCategory.toLowerCase()) ||
    rawCategory ||
    "Misc";
  const price = stickerPrice(Math.min(Number(r.price) || 0, 100_000));
  const description = typeof r.description === "string" ? r.description.trim().slice(0, 200) : "";
  const quantity = Math.max(1, Math.min(999, Math.round(Number(r.quantity) || 1)));
  const confidence = r.confidence === "high" || r.confidence === "low" ? r.confidence : "medium";
  const issue: SnapIssue =
    r.issue === "blurry" || r.issue === "multiple_items" || r.issue === "not_an_item" ? r.issue : "none";
  return { name, category, price, description, quantity, confidence, issue };
}

/** Price buttons in the review: nudge or set the price in one tap. */
export const PRICE_STEPS = [-1, 1] as const;
export const PRICE_PRESETS = [1, 5, 10, 20] as const;

export function nudgePrice(price: number, step: number): number {
  return Math.max(0, Math.round((price + step) * 100) / 100);
}

/** How many suggestions a seller can ask for (env-overridable on the server). */
export const SNAP_LIMITS = {
  /** per seller per day, on any plan */
  perDay: 300,
  /** in total during the free trial (25 items, plus retakes) */
  trialTotal: 40,
};
