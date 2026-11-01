import { describe, expect, it, vi } from "vitest";
import { geocodeAddress, geocodePlace, publicCoordinates, verifyAddress } from "./geocode";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

const census = {
  result: {
    addressMatches: [
      {
        coordinates: { x: -93.6001, y: 41.7318 },
        matchedAddress: "5009 NW 4TH ST, ANKENY, IA, 50023",
        addressComponents: { state: "IA", zip: "50023" },
      },
    ],
  },
};
const nominatim = [{ lat: "41.7290", lon: "-93.6050", display_name: "Ankeny, Polk County, Iowa" }];
const nominatimHouse = [
  { lat: "41.7290", lon: "-93.6050", addresstype: "house", address: { "ISO3166-2-lvl4": "US-IA", postcode: "50023" } },
];

describe("geocodeAddress", () => {
  it("uses the Census geocoder for street addresses", async () => {
    const f = vi.fn((url: string) => (url.includes("census.gov") ? json(census) : json([])));
    const c = await geocodeAddress({ street: "5009 NW 4th", city: "Ankeny", state: "IA", zip: "50023" }, f as never);
    expect(c).toMatchObject({ lat: 41.7318, lng: -93.6001 });
    expect(String(f.mock.calls[0][0])).toContain(encodeURIComponent("5009 NW 4th, Ankeny, IA, 50023"));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("falls back to OpenStreetMap when Census has no match", async () => {
    const f = vi.fn((url: string) => (url.includes("census.gov") ? json({ result: { addressMatches: [] } }) : json(nominatimHouse)));
    expect(await geocodeAddress({ street: "1 Somewhere", city: "Ankeny", state: "IA", zip: "" }, f as never)).toMatchObject({
      lat: 41.729,
      lng: -93.605,
    });
  });

  it("returns null when both fail or there's no street", async () => {
    const down = vi.fn(() => Promise.reject(new Error("network")));
    expect(await geocodeAddress({ street: "5009 NW 4th", city: "Ankeny", state: "IA", zip: "" }, down as never)).toBeNull();
    const f = vi.fn(() => json(census));
    expect(await geocodeAddress({ street: "", city: "Ankeny", state: "IA", zip: "" }, f as never)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("verifyAddress", () => {
  const addr = { street: "5009 NW 4th", city: "Ankeny", state: "IA", zip: "50023" };
  const noCensus = (osm: unknown) =>
    vi.fn((url: string) => (url.includes("census.gov") ? json({ result: { addressMatches: [] } }) : json(osm)));

  it("verifies a street-level match in the right state", async () => {
    const f = vi.fn(() => json(census));
    expect(await verifyAddress(addr, f as never)).toMatchObject({ status: "verified", lat: 41.7318, zip: "50023" });
  });

  it("doesn't count a match on just the town or ZIP", async () => {
    const townOnly = [{ ...nominatim[0], addresstype: "town" }];
    expect(await verifyAddress({ ...addr, street: "999 Fakeville Blvd" }, noCensus(townOnly) as never)).toEqual({
      status: "not_found",
    });
    expect(await verifyAddress(addr, noCensus([]) as never)).toEqual({ status: "not_found" });
  });

  it("doesn't count a match in another state", async () => {
    const elsewhere = { result: { addressMatches: [{ ...census.result.addressMatches[0], addressComponents: { state: "TX" } }] } };
    const f = vi.fn((url: string) => (url.includes("census.gov") ? json(elsewhere) : json([])));
    expect(await verifyAddress(addr, f as never)).toEqual({ status: "not_found" });
  });

  it("says when it couldn't check at all", async () => {
    const down = vi.fn(() => Promise.reject(new Error("network")));
    expect(await verifyAddress(addr, down as never)).toEqual({ status: "unavailable" });
  });
});

describe("geocodePlace", () => {
  it("looks up a ZIP once and caches it", async () => {
    const f = vi.fn((_url: string) => json(nominatim));
    expect(await geocodePlace("50023", f as never)).toMatchObject({ lat: 41.729 });
    expect(await geocodePlace(" 50023 ", f as never)).toMatchObject({ lat: 41.729 });
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toContain(encodeURIComponent("50023, USA"));
  });
  it("returns null for nothing found", async () => {
    expect(await geocodePlace("zzzz nowhere", (() => json([])) as never)).toBeNull();
  });
});

describe("publicCoordinates", () => {
  it("rounds to about a block unless the full address is shown", () => {
    const exact = { lat: 41.73183, lng: -93.60012 };
    const rounded = publicCoordinates({ ...exact, show_full_address: false })!;
    expect(rounded.lat).not.toBe(exact.lat);
    expect(Math.abs(rounded.lat - exact.lat)).toBeLessThanOrEqual(0.001 + 1e-9);
    expect(publicCoordinates({ ...exact, show_full_address: true })).toEqual(exact);
    expect(publicCoordinates({ lat: null, lng: null, show_full_address: false })).toBeNull();
  });
});
