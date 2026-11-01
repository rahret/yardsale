"use client";

import { type AddressFields, addressFormatError, normalizeAddress } from "@/lib/address";

export type AddressCheckResult =
  | { status: "verified"; address: AddressFields; lat: number; lng: number }
  | { status: "not_found"; address: AddressFields }
  | { status: "unavailable"; address: AddressFields }
  | { status: "invalid"; address: AddressFields; error: string };

/** Format-checks an address in the browser, then asks the server whether it
 * exists (see /api/address/verify). Network trouble counts as "unavailable",
 * so a flaky connection never blocks saving. */
export async function checkAddress(raw: AddressFields): Promise<AddressCheckResult> {
  const address = normalizeAddress(raw);
  const error = addressFormatError(address);
  if (error) return { status: "invalid", address, error };
  try {
    const res = await fetch("/api/address/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(address),
    });
    if (res.status === 401) return { status: "invalid", address, error: "You're signed out — refresh the page and log in again." };
    const body = await res.json();
    if (body.status === "invalid") return { status: "invalid", address, error: body.error };
    if (body.status === "verified") return { status: "verified", address, lat: body.lat, lng: body.lng };
    if (body.status === "not_found") return { status: "not_found", address };
  } catch {
    // fall through
  }
  return { status: "unavailable", address };
}

export const ADDRESS_NOT_FOUND =
  "We couldn't find that address. Check the house number, street, city, state and ZIP.";

/** Same address, ignoring spacing and capitalisation. */
export function sameAddress(a: AddressFields, b: Partial<AddressFields>): boolean {
  const x = normalizeAddress(a);
  const y = normalizeAddress({ street: b.street || "", city: b.city || "", state: b.state || "", zip: b.zip || "" });
  return (["street", "city", "state", "zip"] as const).every((k) => x[k].toLowerCase() === y[k].toLowerCase());
}
