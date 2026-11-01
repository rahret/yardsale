import { describe, expect, it } from "vitest";
import { fitWithin } from "./shrinkImage";

describe("fitWithin", () => {
  it("scales a big phone photo down to 1600px on its long side, keeping its shape", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });
  it("leaves small photos alone", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
