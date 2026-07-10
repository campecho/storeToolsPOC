import { describe, it, expect } from "vitest";
import { applyAdjust } from "./ops";
import { compileAdjust, zeroAdjustState, type AdjustState } from "./adjust-math";

function st(partial: Partial<AdjustState>): AdjustState {
  return { ...zeroAdjustState(), ...partial };
}

/* ================================================================== */
/* applyAdjust — hand-computed 4-pixel buffers                         */
/* ================================================================== */

describe("applyAdjust — tone-only (LUT path, identity matrix)", () => {
  it("maps every RGB channel through the LUT and leaves alpha untouched", () => {
    // brightness +50 → lut[x] = clamp(x+50): lut[0]=50, lut[64]=114, lut[128]=178,
    // lut[192]=242, lut[200]=250, lut[255]=255.
    const c = compileAdjust(st({ brightness: 50 }));
    const buf = new Uint8ClampedArray([
      0, 0, 0, 255, //   → 50,50,50   | alpha 255
      64, 128, 192, 255, // → 114,178,242 | alpha 255
      200, 200, 200, 128, // → 250,250,250 | alpha 128
      255, 255, 255, 0, // → 255,255,255 | alpha 0
    ]);
    applyAdjust(buf, c);
    expect(Array.from(buf)).toEqual([
      50, 50, 50, 255,
      114, 178, 242, 255,
      250, 250, 250, 128,
      255, 255, 255, 0,
    ]);
  });

  it("a plain Uint8Array produces byte-identical output to a Uint8ClampedArray", () => {
    const c = compileAdjust(st({ brightness: 50, saturation: 100 })); // exercises the matrix path too
    const src = [10, 100, 240, 200, 0, 0, 0, 255, 255, 255, 255, 1];
    const clamped = new Uint8ClampedArray(src);
    const plain = new Uint8Array(src);
    applyAdjust(clamped, c);
    applyAdjust(plain, c);
    expect(Array.from(plain)).toEqual(Array.from(clamped));
  });
});

describe("applyAdjust — matrix-only (saturation)", () => {
  it("applies the luma-blend matrix with round+clamp, alpha untouched", () => {
    // saturation +100 (s=2), LUT identity. Pixel [100,150,200]:
    //   r' = 1.7874·100 − 0.7152·150 − 0.0722·200 = 57.02 → 57
    //   g' = −0.2126·100 + 1.2848·150 − 0.0722·200 = 157.02 → 157
    //   b' = −0.2126·100 − 0.7152·150 + 1.9278·200 = 257.02 → clamp 255
    const c = compileAdjust(st({ saturation: 100 }));
    const buf = new Uint8ClampedArray([100, 150, 200, 255, 128, 128, 128, 200]);
    applyAdjust(buf, c);
    expect(Array.from(buf)).toEqual([
      57, 157, 255, 255, // alpha kept
      128, 128, 128, 200, // grey stays grey (luma-preserving), alpha kept
    ]);
  });
});

describe("applyAdjust — tone THEN matrix (LUT-first ordering)", () => {
  it("runs the LUT before the matrix on a hand-computed pixel", () => {
    // brightness +50 then saturation +100. Pixel [10,100,240]:
    //   LUT: 10→60, 100→150, 240→290→clamp 255
    //   matrix on (60,150,255):
    //     r' = 1.7874·60 − 0.7152·150 − 0.0722·255 = −18.45 → clamp 0
    //     g' = −0.2126·60 + 1.2848·150 − 0.0722·255 = 161.55 → 162
    //     b' = −0.2126·60 − 0.7152·150 + 1.9278·255 = 371.55 → clamp 255
    const c = compileAdjust(st({ brightness: 50, saturation: 100 }));
    const buf = new Uint8ClampedArray([10, 100, 240, 200]);
    applyAdjust(buf, c);
    expect(Array.from(buf)).toEqual([0, 162, 255, 200]);
  });
});

describe("applyAdjust — identity + edge cases", () => {
  it("an identity compile leaves the buffer byte-for-byte unchanged", () => {
    const c = compileAdjust(zeroAdjustState());
    const src = [1, 2, 3, 4, 250, 251, 252, 253, 128, 64, 32, 16];
    const buf = new Uint8ClampedArray(src);
    applyAdjust(buf, c);
    expect(Array.from(buf)).toEqual(src);
  });

  it("ignores a trailing partial pixel (length not a multiple of 4)", () => {
    const c = compileAdjust(st({ brightness: 50 }));
    const buf = new Uint8ClampedArray([0, 0, 0, 255, 10, 20]); // 1 pixel + 2 stray bytes
    applyAdjust(buf, c);
    // full pixel mapped; the stray bytes are untouched
    expect(Array.from(buf)).toEqual([50, 50, 50, 255, 10, 20]);
  });
});

/* ================================================================== */
/* PERF — the PE4 budget (PE0-harness style)                           */
/* ================================================================== */

describe("applyAdjust — performance budget (2048×1536, full non-identity state)", () => {
  it("stays under the CI ceiling (median of 5 < 250 ms)", () => {
    const W = 2048;
    const H = 1536;
    const N = W * H;
    const base = new Uint8ClampedArray(N * 4);
    for (let i = 0; i < base.length; i++) base[i] = (Math.random() * 256) | 0;

    // A full non-identity state: every tone param + warmth + saturation, so the
    // heavy LUT-and-matrix path runs (identityMatrix is false).
    const compiled = compileAdjust(
      st({
        brightness: 10,
        contrast: 20,
        exposure: 15,
        highlights: -25,
        shadows: 30,
        saturation: 40,
        temperature: -20,
      }),
    );

    const times: number[] = [];
    for (let run = 0; run < 5; run++) {
      const buf = base.slice();
      const t0 = performance.now();
      applyAdjust(buf, compiled);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = times[2];
    console.info(`applyAdjust 2048×1536 full-state median: ${median.toFixed(1)} ms`);
    // Generous CI bound; the dev-box spike measured ~53 ms. This machine records
    // a higher number under the vite interpreter — still comfortably inside.
    expect(median).toBeLessThan(250);
  });
});
