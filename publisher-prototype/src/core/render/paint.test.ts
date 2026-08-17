import { describe, expect, it } from "vitest";
import type { Swatch } from "../model";
import { paintToCss } from "./paint";

/**
 * Paint → CSS resolution: literal colors render directly (cmyk via the
 * naive (1−ink)(1−k) fallback), swatch references resolve through the
 * swatch list with optional tint toward paper white, and a dangling
 * swatchId renders fallback black — the soft-reference rule.
 */

const swatches: Swatch[] = [
  { id: "sw-rgb", name: "Brand Blue", space: "rgb", values: [0.2, 0.4, 0.6] },
  { id: "sw-cmyk", name: "Press Black", space: "cmyk", values: [0, 0, 0, 1] },
  {
    id: "sw-spot",
    name: "Foil",
    space: "spot",
    values: [0, 1, 1, 0],
    spotName: "Foil Red 01",
  },
];

describe("paintToCss", () => {
  it("renders a literal rgb color", () => {
    expect(
      paintToCss({ kind: "color", color: { space: "rgb", values: [1, 0.5, 0] } }, swatches),
    ).toBe("rgb(255, 128, 0)");
  });

  it("renders a literal cmyk color via the naive fallback conversion", () => {
    expect(
      paintToCss({ kind: "color", color: { space: "cmyk", values: [0, 1, 1, 0] } }, swatches),
    ).toBe("rgb(255, 0, 0)");
    expect(
      paintToCss({ kind: "color", color: { space: "cmyk", values: [0, 0, 0, 1] } }, swatches),
    ).toBe("rgb(0, 0, 0)");
  });

  it("resolves an rgb swatch reference", () => {
    expect(paintToCss({ kind: "swatch", swatchId: "sw-rgb" }, swatches)).toBe("rgb(51, 102, 153)");
  });

  it("renders cmyk and spot swatches through their fallback values", () => {
    expect(paintToCss({ kind: "swatch", swatchId: "sw-cmyk" }, swatches)).toBe("rgb(0, 0, 0)");
    expect(paintToCss({ kind: "swatch", swatchId: "sw-spot" }, swatches)).toBe("rgb(255, 0, 0)");
  });

  it("applies tint as a mix toward paper white", () => {
    expect(paintToCss({ kind: "swatch", swatchId: "sw-cmyk", tint: 0.5 }, swatches)).toBe(
      "rgb(128, 128, 128)",
    );
    expect(paintToCss({ kind: "swatch", swatchId: "sw-cmyk", tint: 1 }, swatches)).toBe(
      "rgb(0, 0, 0)",
    );
    expect(paintToCss({ kind: "swatch", swatchId: "sw-cmyk", tint: 0 }, swatches)).toBe(
      "rgb(255, 255, 255)",
    );
  });

  it("renders fallback black for a dangling swatch id", () => {
    expect(paintToCss({ kind: "swatch", swatchId: "gone" }, swatches)).toBe("rgb(0, 0, 0)");
    expect(paintToCss({ kind: "swatch", swatchId: "gone" }, [])).toBe("rgb(0, 0, 0)");
  });
});
