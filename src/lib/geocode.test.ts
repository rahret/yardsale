import { describe, expect, it, vi } from "vitest";
import { geocodeAddress, geocodePlace, publicCoordinates } from "./geocode";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

const census = { result: { addressMatches: [{ coordinates: { x: -93.6001, y: 41.7318 }, matchedAddress: "5009 NW 4TH ST, ANKENY, IA, 50023" }] } };
const nominatim = [{ lat: "41.7290", lon: "-93.6050", display_name: "Ankeny, Polk County, Iowa" }];

describe("geocodeAddress", () => {
  it("uses the Census geocoder for street addresses", async () => {
    const f = vi.fn((url: string) => (url.includes("census.gov") ? json(census) : json([])));
    const c = await geocodeAddress({ street: "5009 NW 4th", city: "Ankeny", state: "IA", zip: "50023" }, f as never);
    expect(c).toMatchObject({ lat: 41.7318, lng: -93.6001 });
    expect(String(f.mock.calls[0][0])).toContain(encodeURIComponent("5009 NW 4th, Ankeny, IA, 50023"));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("falls back to OpenStreetMap when Census has no match", async () => {
    const f = vi.fn((url: string) => (url.includes("census.gov") ? json({ result: { addressMatches: [] } }) : json(nominatim)));
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
