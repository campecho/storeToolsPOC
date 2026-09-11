import { describe, expect, it } from "vitest";
import type { Swatch } from "@/schema";
import { cmykPercent, rgb255 } from "./convert";
import { hexPaint, paintEquals, paintKey, paintToCss, paintToHex, resolvePaintColor, solidPaint } from "./paint";
import { proofCmyk, proofRgb } from "./proof";

const swatches: Swatch[] = [
  { id: "sw-rgb", name: "Brand Blue", space: "rgb", values: [0.2, 0.4, 0.6] },
  { id: "sw-k", name: "Press Black", space: "cmyk", values: [0, 0, 0, 1] },
  { id: "sw-spot", name: "Foil", space: "spot", values: [0, 1, 1, 0], spotName: "Foil Red 01" },
];

const css = ([r, g, b]: readonly number[]) =>
  `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

describe("resolvePaintColor", () => {
  it("returns a literal as is", () => {
    expect(resolvePaintColor(solidPaint(cmykPercent(0, 100, 100, 20)), [])).toEqual(cmykPercent(0, 100, 100, 20));
  });

  it("resolves swatch references, a spot through its CMYK process fallback", () => {
    expect(resolvePaintColor({ kind: "swatch", swatchId: "sw-rgb" }, swatches)).toEqual({ space: "rgb", values: [0.2, 0.4, 0.6] });
    expect(resolvePaintColor({ kind: "swatch", swatchId: "sw-spot" }, swatches)).toEqual({ space: "cmyk", values: [0, 1, 1, 0] });
  });

  it("renders the print black (100% K) for a dangling swatch id — the soft-reference rule", () => {
    expect(resolvePaintColor({ kind: "swatch", swatchId: "gone" }, swatches)).toEqual(cmykPercent(0, 0, 0, 100));
  });

  it("applies tint as ink at t%: cmyk channels scale, rgb mixes toward paper", () => {
    expect(resolvePaintColor({ kind: "swatch", swatchId: "sw-k", tint: 0.5 }, swatches)).toEqual({ space: "cmyk", values: [0, 0, 0, 0.5] });
    const tinted = resolvePaintColor({ kind: "swatch", swatchId: "sw-rgb", tint: 0.5 }, swatches);
    expect(tinted.space).toBe("rgb");
    tinted.values.forEach((v, i) => expect(v).toBeCloseTo(1 - 0.5 * (1 - [0.2, 0.4, 0.6][i]), 6));
    expect(resolvePaintColor({ kind: "swatch", swatchId: "sw-k", tint: 1 }, swatches)).toEqual({ space: "cmyk", values: [0, 0, 0, 1] });
  });
});

describe("paintToCss — the print preview", () => {
  it("proofs a cmyk literal through the press tables and an rgb literal through the round trip", () => {
    expect(paintToCss(solidPaint(cmykPercent(100, 0, 0, 0)), [])).toBe(css(proofCmyk([1, 0, 0, 0])));
    expect(paintToCss(hexPaint("#cc0000"), [])).toBe(css(proofRgb([0.8, 0, 0])));
    expect(paintToCss(solidPaint(cmykPercent(0, 0, 0, 0)), [])).toBe("rgb(255, 255, 255)");
  });

  it("follows a referenced swatch's values — the memo key includes them", () => {
    const paint = { kind: "swatch", swatchId: "sw-rgb" } as const;
    const before = paintToCss(paint, swatches);
    const edited: Swatch[] = [{ id: "sw-rgb", name: "Brand Blue", space: "rgb", values: [0.9, 0.1, 0.1] }];
    expect(paintToCss(paint, edited)).not.toBe(before);
    expect(paintToCss(paint, edited)).toBe(css(proofRgb([0.9, 0.1, 0.1])));
  });
});

describe("paintToHex — the literal", () => {
  it("is exact for an rgb literal and naive for cmyk", () => {
    expect(paintToHex(hexPaint("#4472C4"), [])).toBe("#4472c4");
    expect(paintToHex(solidPaint(cmykPercent(0, 0, 0, 100)), [])).toBe("#000000");
    expect(paintToHex({ kind: "swatch", swatchId: "sw-rgb" }, swatches)).toBe("#336699");
  });
});

describe("paintKey / paintEquals", () => {
  it("compares at display precision and never across spaces", () => {
    expect(paintEquals(solidPaint(rgb255(204, 0, 0)), solidPaint({ space: "rgb", values: [0.8, 0.001, 0] }))).toBe(true);
    expect(paintEquals(solidPaint(cmykPercent(0, 0, 0, 100)), hexPaint("#000000"))).toBe(false);
    expect(paintEquals(null, null)).toBe(true);
    expect(paintEquals(null, hexPaint("#000000"))).toBe(false);
  });

  it("keys swatch references by id and tint", () => {
    expect(paintKey({ kind: "swatch", swatchId: "sw-k" })).toBe("swatch:sw-k:1");
    expect(paintKey({ kind: "swatch", swatchId: "sw-k", tint: 0.5 })).toBe("swatch:sw-k:0.5");
    expect(paintKey(solidPaint(cmykPercent(0, 100, 100, 20)))).toBe("cmyk:0,100,100,20");
  });
});
