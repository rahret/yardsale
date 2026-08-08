export type SaleStatus = "draft" | "live" | "ended";
export type ItemStatus = "available" | "reserved" | "sold" | "low_stock";

export interface Sale {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  tagline: string;
  address: string;
  default_reservation_minutes: number;
  status: SaleStatus;
  reserved_history: string[];
  created_at: string;
  updated_at: string;
}

export interface SavedLocation {
  id: string;
  owner_id: string;
  label: string;
  address: string;
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
  reserved_name: string | null;
  reserved_phone: string | null;
  reserved_at: string | null;
  sold_at: string | null;
  sort_order: number;
  quantity_total: number;
  quantity_available: number;
  created_at: string;
  updated_at: string;
  item_photos?: ItemPhoto[];
}
