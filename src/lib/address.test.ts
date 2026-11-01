import { describe, expect, it } from "vitest";
import { addressFormatError, normalizeAddress } from "./address";

const ok = { street: "1510 NW Ash Dr", city: "Ankeny", state: "ia", zip: "50023" };

describe("addressFormatError", () => {
  it("accepts a normal US street address", () => {
    expect(addressFormatError(ok)).toBe("");
    expect(addressFormatError({ ...ok, street: "12B Elm Street", zip: "50023-1234" })).toBe("");
  });

  it("catches obviously phony or incomplete addresses", () => {
    expect(addressFormatError({ ...ok, street: "" })).toMatch(/street address/);
    expect(addressFormatError({ ...ok, street: "my house" })).toMatch(/house number/);
    expect(addressFormatError({ ...ok, street: "123" })).toMatch(/house number/);
    expect(addressFormatError({ ...ok, street: "123 456" })).toMatch(/house number/);
    expect(addressFormatError({ ...ok, city: "" })).toMatch(/city/);
    expect(addressFormatError({ ...ok, state: "Iowa" })).toMatch(/two-letter/);
    expect(addressFormatError({ ...ok, state: "ZZ" })).toMatch(/two-letter/);
    expect(addressFormatError({ ...ok, zip: "5002" })).toMatch(/ZIP/);
    expect(addressFormatError({ ...ok, zip: "abcde" })).toMatch(/ZIP/);
  });
});

describe("normalizeAddress", () => {
  it("tidies spacing and the state code", () => {
    expect(normalizeAddress({ street: " 1510  NW Ash Dr ", city: "ankeny ", state: " ia", zip: "50023 - 1234" })).toEqual({
      street: "1510 NW Ash Dr",
      city: "ankeny",
      state: "IA",
      zip: "50023-1234",
    });
  });
});
