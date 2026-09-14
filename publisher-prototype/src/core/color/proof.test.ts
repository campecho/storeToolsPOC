import { describe, expect, it } from "vitest";
import { naiveCmykToRgb, to255, type Cmyk, type Rgb } from "./convert";
import { PROOF_SAMPLES } from "./luts/samples";
import {
  GAMUT_WARN_DELTA_E,
  deltaE76,
  gamutShift,
  isOutOfGamut,
  pressCmyk,
  proofCmyk,
  proofColor,
  proofRgb,
} from "./proof";

type Rgb255 = [number, number, number];

const rgb255 = ([r, g, b]: Rgb): Rgb255 => [to255(r), to255(g), to255(b)];
const cmykOf = (q: readonly number[]): Cmyk => [(q[0] ?? 0) / 255, (q[1] ?? 0) / 255, (q[2] ?? 0) / 255, (q[3] ?? 0) / 255];
const rgbOf = (t: readonly number[]): Rgb => [(t[0] ?? 0) / 255, (t[1] ?? 0) / 255, (t[2] ?? 0) / 255];
/** ΔE76 between a 0–1 rgb and a 0–255 sample, in the tables' error unit. */
const deltaE = (approx: Rgb, sample: readonly number[]): number => deltaE76(approx, rgbOf(sample));

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

  it("matches the profile within 2.5 ΔE at the committed off-grid samples", () => {
    let worst = 0;
    for (const s of PROOF_SAMPLES.cmykToSrgb) {
      worst = Math.max(worst, deltaE(proofCmyk(cmykOf(s.cmyk)), s.srgb));
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
    expect((c ?? 0) + (m ?? 0) + (y ?? 0)).toBeGreaterThan(100);
  });

  it("sRGB red separates to near 0/100/100/0", () => {
    const [c, m, y, k] = pressCmyk([1, 0, 0]).map((v) => Math.round(v * 100));
    expect(c).toBeLessThan(5);
    expect(m).toBeGreaterThan(90);
    expect(y).toBeGreaterThan(90);
    expect(k).toBeLessThan(10);
  });

  it("prints within 4 ΔE of the profile's own separation at the off-grid samples", () => {
    let worst = 0;
    for (const s of PROOF_SAMPLES.srgbToCmyk) {
      const approx = pressCmyk(rgbOf(s.srgb));
      const exact = cmykOf(s.cmyk);
      worst = Math.max(worst, deltaE76(proofCmyk(approx), proofCmyk(exact)));
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
