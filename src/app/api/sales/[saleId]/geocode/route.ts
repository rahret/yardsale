import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode";

// Looks up the map coordinates of a sale's address and saves them. Called by
// the seller's page after they save their address (and once for sales saved
// before coordinates existed). Only the sale's owner can update it (RLS).
export async function POST(_request: Request, { params }: { params: { saleId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: sale } = await supabase
    .from("sales")
    .select("id, owner_id, street, city, state, zip")
    .eq("id", params.saleId)
    .maybeSingle();
  if (!sale || sale.owner_id !== user.id) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

  const coords = await geocodeAddress(sale);
  const { data, error } = await supabase
    .from("sales")
    .update({ lat: coords?.lat ?? null, lng: coords?.lng ?? null })
    .eq("id", sale.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sale: data, found: !!coords });
}
