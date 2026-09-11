import { describe, expect, it } from "vitest";
import type { Swatch } from "../model";
import { hexToColorValue, paintToCss, paintToHex, paintToShadedCss } from "./paint";

/**
 * Paint → CSS resolution: every CSS value is the PRINT PREVIEW (proof.ts,
 * the "Print preview tables" surface) — a cmyk literal as the press renders
 * it, an rgb literal as it will look once separated and printed. Swatch
 * references resolve through the swatch list with optional tint (ink at
 * t%), and a dangling swatchId renders fallback black — the soft-reference
 * rule. The literal values behind these expectations are checked in
 * ../color/proof.test.ts against the profile's own samples.
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
  it("renders a literal rgb color as it will print — an out-of-gamut orange dulls", () => {
    expect(
      paintToCss({ kind: "color", color: { space: "rgb", values: [1, 0.5, 0] } }, swatches),
    ).toBe("rgb(240, 130, 18)");
  });

  it("renders a literal cmyk color as the press does — 100% K is a dark grey, M+Y the press red", () => {
    expect(
      paintToCss({ kind: "color", color: { space: "cmyk", values: [0, 1, 1, 0] } }, swatches),
    ).toBe("rgb(234, 39, 26)");
    expect(
      paintToCss({ kind: "color", color: { space: "cmyk", values: [0, 0, 0, 1] } }, swatches),
    ).toBe("rgb(22, 23, 19)");
  });

  it("resolves an rgb swatch reference", () => {
    expect(paintToCss({ kind: "swatch", swatchId: "sw-rgb" }, swatches)).toBe("rgb(36, 97, 145)");
  });

  it("renders cmyk and spot swatches through their process values", () => {
    expect(paintToCss({ kind: "swatch", swatchId: "sw-cmyk" }, swatches)).toBe("rgb(22, 23, 19)");
    expect(paintToCss({ kind: "swatch", swatchId: "sw-spot" }, swatches)).toBe("rgb(234, 39, 26)");
  });

  it("applies tint as ink at t% — 50% of K100 previews as the press's K50", () => {
    expect(paintToCss({ kind: "swatch", swatchId: "sw-cmyk", tint: 0.5 }, swatches)).toBe(
      "rgb(148, 149, 148)",
    );
    expect(paintToCss({ kind: "swatch", swatchId: "sw-cmyk", tint: 1 }, swatches)).toBe(
      "rgb(22, 23, 19)",
    );
    expect(paintToCss({ kind: "swatch", swatchId: "sw-cmyk", tint: 0 }, swatches)).toBe(
      "rgb(255, 255, 255)",
    );
  });

  it("renders fallback black for a dangling swatch id (an rgb black, so it prints as rich black)", () => {
    expect(paintToCss({ kind: "swatch", swatchId: "gone" }, swatches)).toBe("rgb(4, 3, 3)");
    expect(paintToCss({ kind: "swatch", swatchId: "gone" }, [])).toBe("rgb(4, 3, 3)");
  });
});

describe("hexToColorValue", () => {
  it("parses #rrggbb into normalized rgb channels", () => {
    expect(hexToColorValue("#ff8000")).toEqual({
      space: "rgb",
      values: [1, 128 / 255, 0],
    });
    expect(hexToColorValue("#000000")).toEqual({ space: "rgb", values: [0, 0, 0] });
    expect(hexToColorValue("#ffffff")).toEqual({ space: "rgb", values: [1, 1, 1] });
  });

  it("accepts uppercase digits", () => {
    expect(hexToColorValue("#4472C4")).toEqual(hexToColorValue("#4472c4"));
  });

  it("round-trips through paintToHex exactly; paintToCss shows how it prints", () => {
    expect(paintToHex({ kind: "color", color: hexToColorValue("#4472c4") }, [])).toBe("#4472c4");
    expect(paintToCss({ kind: "color", color: hexToColorValue("#4472c4") }, [])).toBe(
      "rgb(60, 114, 173)",
    );
  });

  it("resolves malformed strings to fallback black, never an error", () => {
    for (const bad of ["", "4472c4", "#fff", "#12345", "#gggggg", "#1234567"]) {
      expect(hexToColorValue(bad)).toEqual({ space: "rgb", values: [0, 0, 0] });
    }
  });
});

describe("paintToHex", () => {
  it("formats a literal rgb color as its exact #rrggbb — the LITERAL, not the preview", () => {
    expect(paintToHex({ kind: "color", color: hexToColorValue("#4472c4") }, [])).toBe("#4472c4");
  });

  it("resolves swatch references (spot via its cmyk fallback, naive for hex)", () => {
    expect(paintToHex({ kind: "swatch", swatchId: "sw-rgb" }, swatches)).toBe("#336699");
    expect(paintToHex({ kind: "swatch", swatchId: "sw-spot" }, swatches)).toBe("#ff0000");
  });

  it("renders fallback black for a dangling swatch id", () => {
    expect(paintToHex({ kind: "swatch", swatchId: "ghost" }, swatches)).toBe("#000000");
  });
});

describe("paintToShadedCss", () => {
  it("scales every channel toward black, keeping the hue", () => {
    // The banner's folds: the same surface in shadow, not a grey wash.
    expect(
      paintToShadedCss({ kind: "color", color: { space: "rgb", values: [1, 0.5, 0] } }, swatches),
    ).toBe("rgb(192, 104, 14)");
  });

  it("shades a swatch reference through the same resolution paintToCss uses", () => {
    const paint = { kind: "swatch", swatchId: "sw-rgb" } as const;
    expect(paintToShadedCss(paint, swatches)).not.toBe(paintToCss(paint, swatches));
    expect(paintToShadedCss(paint, swatches)).toMatch(/^rgb\(/);
  });
});
