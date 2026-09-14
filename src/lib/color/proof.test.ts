import { describe, expect, it } from "vitest";
import { naiveCmykToRgb, to255 } from "./convert";
import { PROOF_SAMPLES } from "./luts/samples";
import { GAMUT_WARN_DELTA_E, gamutShift, isOutOfGamut, pressCmyk, proofCmyk, proofColor, proofRgb } from "./proof";

const rgb255 = (rgb: readonly number[]) => rgb.map(to255);

/** ΔE76 in Lab between two 0–255 sRGB triples, the unit the generator's error report uses. */
function deltaE(a: readonly number[], b: readonly number[]): number {
  const lab = ([r, g, bl]: readonly number[]) => {
    const lin = (v: number) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const [rl, gl, bb] = [lin(r), lin(g), lin(bl)];
    const x = (0.4124 * rl + 0.3576 * gl + 0.1805 * bb) / 0.95047;
    const y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bb;
    const z = (0.0193 * rl + 0.1192 * gl + 0.9505 * bb) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const la = lab(a);
  const lb = lab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

describe("proofCmyk — press → screen", () => {
  it("paper is white and 400% is black", () => {
    expect(rgb255(proofCmyk([0, 0, 0, 0]))).toEqual([255, 255, 255]);
    expect(rgb255(proofCmyk([1, 1, 1, 1]))).toEqual([0, 0, 0]);
  });

  it("100% cyan is the press cyan, not the naive #00ffff", () => {
    const [r, g, b] = rgb255(proofCmyk([1, 0, 0, 0]));
    expect(r).toBeLessThan(40);
    expect(g).toBeGreaterThan(140);
    expect(g).toBeLessThan(190);
    expect(b).toBeGreaterThan(210);
    expect(rgb255(naiveCmykToRgb([1, 0, 0, 0]))).toEqual([0, 255, 255]);
  });

  it("100% K alone is a dark grey, not pure black", () => {
    const [r, g, b] = rgb255(proofCmyk([0, 0, 0, 1]));
    expect(Math.max(r, g, b)).toBeGreaterThan(10);
    expect(Math.max(r, g, b)).toBeLessThan(50);
  });

  it("matches the profile on grid points and within 2.5 ΔE off-grid", () => {
    let worst = 0;
    for (const s of PROOF_SAMPLES.cmykToSrgb) {
      const approx = rgb255(proofCmyk(s.cmyk.map((v) => v / 255) as [number, number, number, number]));
      worst = Math.max(worst, deltaE(approx, s.srgb));
    }
    expect(worst).toBeLessThan(2.5);
  });

  it("is monotonic in K along a neutral ramp", () => {
    let last = 256;
    for (let k = 0; k <= 1; k += 0.05) {
      const [r] = rgb255(proofCmyk([0, 0, 0, k]));
      expect(r).toBeLessThanOrEqual(last);
      last = r;
    }
  });
});

describe("pressCmyk — screen → press", () => {
  it("white is no ink; black is a rich black, not K only", () => {
    expect(pressCmyk([1, 1, 1]).map((v) => Math.round(v * 100))).toEqual([0, 0, 0, 0]);
    const [c, m, y, k] = pressCmyk([0, 0, 0]).map((v) => Math.round(v * 100));
    expect(k).toBeGreaterThan(80);
    expect(c + m + y).toBeGreaterThan(100);
  });

  it("sRGB red separates to near 0/100/100/0", () => {
    const [c, m, y, k] = pressCmyk([1, 0, 0]).map((v) => Math.round(v * 100));
    expect(c).toBeLessThan(5);
    expect(m).toBeGreaterThan(90);
    expect(y).toBeGreaterThan(90);
    expect(k).toBeLessThan(10);
  });

  it("prints within 4 ΔE of the profile's own separation off-grid", () => {
    let worst = 0;
    for (const s of PROOF_SAMPLES.srgbToCmyk) {
      const approx = pressCmyk(s.srgb.map((v) => v / 255) as [number, number, number]);
      const exact = s.cmyk.map((v) => v / 255) as [number, number, number, number];
      worst = Math.max(worst, deltaE(rgb255(proofCmyk(approx)), rgb255(proofCmyk(exact))));
    }
    expect(worst).toBeLessThan(4);
  });
});

describe("proofRgb and gamut", () => {
  it("dulls a saturated orange and barely moves a neutral", () => {
    const orange = proofRgb([1, 0.5, 0]);
    expect(orange[0]).toBeLessThan(1);
    expect(gamutShift([1, 0.5, 0])).toBeGreaterThan(GAMUT_WARN_DELTA_E);
    // a light neutral sits well inside the gamut (mid grey shifts ~5 ΔE, near
    // the ASSUMED threshold, so it is not the example)
    expect(gamutShift([0.94, 0.94, 0.94])).toBeLessThan(GAMUT_WARN_DELTA_E);
    expect(isOutOfGamut([1, 0, 0])).toBe(true);
    expect(isOutOfGamut([0.94, 0.94, 0.94])).toBe(false);
  });

  it("proofColor dispatches on space", () => {
    expect(proofColor({ space: "cmyk", values: [0, 0, 0, 0] })).toEqual(proofCmyk([0, 0, 0, 0]));
    expect(proofColor({ space: "rgb", values: [1, 0, 0] })).toEqual(proofRgb([1, 0, 0]));
  });
});
