export type SaleStatus = "draft" | "live" | "ended";
export type ItemStatus = "available" | "reserved" | "sold" | "low_stock";

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface Sale extends Address {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  tagline: string;
  default_reservation_minutes: number;
  status: SaleStatus;
  /** Previews/posts show the full street address instead of just the street name. */
  show_full_address: boolean;
  /** Seller's IANA time zone, e.g. "America/Chicago"; null until they save the sale. */
  timezone: string | null;
  /** Short buyer-facing note, e.g. "Everything half off after noon". */
  note: string;
  /** Map coordinates of the address (null until geocoded). */
  lat: number | null;
  lng: number | null;
  /** Shown in the public "Find yard sales" directory (when live). */
  listed: boolean;
  /** Payment methods shown to buyers as icons (never the seller's handles). */
  accepted_payments: PaymentMethod[];
  created_at: string;
  updated_at: string;
}

export interface SavedLocation extends Address {
  id: string;
  owner_id: string;
  label: string;
  created_at: string;
}

export interface SaleDay {
  id: string;
  sale_id: string;
  date: string;
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface ItemPhoto {
  id: string;
  item_id: string;
  storage_path: string;
  position: number;
  created_at: string;
}

/** Buyer contact for a reserved item. Private: readable only by the sale's owner. */
export interface ItemHold {
  item_id: string;
  sale_id: string;
  name: string;
  phone: string;
  created_at: string;
}

export interface Item {
  id: string;
  sale_id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  icon: string;
  status: ItemStatus;
  reservation_minutes: number | null;
  reserved_at: string | null;
  sold_at: string | null;
  sort_order: number;
  quantity_total: number;
  quantity_available: number;
  /** Seller-picked highlight for the top of the sale page. */
  featured: boolean;
  /** How buyers get it: first come in person, hold, or Buy Now — exactly one. */
  sell_mode: SellMode;
  revenue: number;
  created_at: string;
  updated_at: string;
  item_photos?: ItemPhoto[];
  /** Who is holding this item — only returned to the sale's owner. */
  item_holds?: ItemHold | null;
}

/** How buyers get an item: first come, first served in person; hold and pay
 * in person; or Buy Now online. Exactly one. */
export type SellMode = "in_person" | "hold" | "buy_now";

export const PAYMENT_METHODS = ["cash", "card", "venmo", "cashapp", "paypal", "zelle"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PaymentOptions {
  cash?: boolean;
  venmo?: string;
  cashapp?: string;
  paypal?: string;
  zelle?: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  phone: string;
  /** The seller's own address (private); pre-fills new sales. */
  street: string;
  city: string;
  state: string;
  zip: string;
  /** Email the seller about purchases and holds. */
  email_alerts: boolean;
  payment_options: PaymentOptions;
  created_at: string;
}

export type Plan = "none" | "pro" | "comp";

export interface AccountBilling {
  user_id: string;
  plan: Plan;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_interval: "month" | "year" | null;
  trial_ends_at: string | null;
  trial_used: boolean;
  pass_expires_at: string | null;
  stripe_connect_account_id: string | null;
  connect_charges_enabled: boolean;
  connect_payouts_enabled: boolean;
  updated_at: string;
}

export type OrderStatus = "pending" | "paid" | "conflict" | "refunded" | "picked_up" | "expired";

/** An online "Buy Now" purchase. */
export interface Order {
  id: string;
  sale_id: string;
  item_id: string | null;
  item_name: string;
  amount_cents: number;
  fee_cents: number;
  status: OrderStatus;
  pickup_code: string;
  buyer_name: string | null;
  buyer_email: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  paid_at: string | null;
  picked_up_at: string | null;
  refunded_at: string | null;
}
