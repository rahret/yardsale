import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Order } from "@/lib/types";

/** The order, if it belongs to one of the signed-in seller's sales (RLS on
 * orders only lets owners read their own). */
export async function ownedOrder(orderId: string): Promise<Order | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  return (data as Order | null) ?? null;
}
