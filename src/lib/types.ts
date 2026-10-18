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
  revenue: number;
  created_at: string;
  updated_at: string;
  item_photos?: ItemPhoto[];
  /** Who is holding this item — only returned to the sale's owner. */
  item_holds?: ItemHold | null;
}

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
  payment_options: PaymentOptions;
  created_at: string;
}

export type Plan = "free" | "pro";

export interface AccountBilling {
  user_id: string;
  plan: Plan;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_connect_account_id: string | null;
  connect_charges_enabled: boolean;
  connect_payouts_enabled: boolean;
  updated_at: string;
}
