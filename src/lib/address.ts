/** US street-address checks shared by the sale page, the welcome wizard and
 * the Account page. The format checks run instantly in the browser; the
 * server then confirms the address exists (lib/geocode verifyAddress). */

export interface AddressFields {
  street: string;
  city: string;
  state: string;
  zip: string;
}

// 50 states, DC and the territories the Census geocoder covers
export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
  "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR",
  "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "PR", "GU", "VI", "AS", "MP",
] as const;

/** Tidies what was typed: trims and collapses spaces, upper-cases the state,
 * and drops a ZIP+4 suffix's stray spaces. */
export function normalizeAddress(a: AddressFields): AddressFields {
  const clean = (s: string) => (s || "").trim().replace(/\s+/g, " ");
  return {
    street: clean(a.street),
    city: clean(a.city),
    state: clean(a.state).toUpperCase(),
    zip: clean(a.zip).replace(/\s*-\s*/, "-"),
  };
}

/** Why an address is obviously incomplete or malformed, or "" if it looks
 * like a real US street address. */
export function addressFormatError(raw: AddressFields): string {
  const a = normalizeAddress(raw);
  if (!a.street) return "Add your street address.";
  if (!/^\d+[a-zA-Z]?(-\d+)?\s+\S+/.test(a.street) || !/[a-zA-Z]{2,}/.test(a.street)) {
    return "Enter a street address with a house number and street name, like “123 Maple St”.";
  }
  if (!a.city || !/[a-zA-Z]{2,}/.test(a.city)) return "Add your city.";
  if (!(US_STATES as readonly string[]).includes(a.state)) return "Use the two-letter state code, like “IA”.";
  if (!/^\d{5}(-\d{4})?$/.test(a.zip)) return "Enter a 5-digit ZIP code.";
  return "";
}
