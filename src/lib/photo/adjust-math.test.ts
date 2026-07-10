import { describe, it, expect } from "vitest";
import {
  collectAdjustState,
  isAdjustIdentity,
  compileAdjust,
  computeAutoEnhance,
  adjustLabel,
  zeroAdjustState,
  type AdjustState,
} from "./adjust-math";
import type { AdjustParam, PhotoOp } from "@/lib/schema/photo";

/* ------------------------------------------------------------------ */
/* Op builders — schema-shaped so the fixtures stay contract-true     */
/* ------------------------------------------------------------------ */

function adjust(param: AdjustParam, value: number): PhotoOp {
  return { op: "adjust", label: adjustLabel(param, value), param, value };
}
function autoEnhance(params: Partial<Record<AdjustParam, number>>): PhotoOp {
  return { op: "autoEnhance", label: "Auto-enhance", params };
}
function cropOp(): PhotoOp {
  return { op: "crop", label: "Crop", rect: { x: 0, y: 0, w: 10, h: 10 }, ratio: null, shape: "rect" };
}

/** Build a full state from a partial (the rest identity). */
function st(partial: Partial<AdjustState>): AdjustState {
  return { ...zeroAdjustState(), ...partial };
}

const IDX = [0, 64, 128, 192, 255] as const;
const lutAt = (lut: Uint8Array) => IDX.map((i) => lut[i]);

/* ================================================================== */
/* collectAdjustState — the fold (setpoint / last-wins semantics)      */
/* ================================================================== */

describe("collectAdjustState", () => {
  it("returns the identity state for an empty slice", () => {
    expect(collectAdjustState([])).toEqual(zeroAdjustState());
  });

  it("an adjust op sets its own param; others stay identity", () => {
    expect(collectAdjustState([adjust("brightness", 12)])).toEqual(st({ brightness: 12 }));
  });

  it("autoEnhance sets each named param as a base value", () => {
    const s = collectAdjustState([autoEnhance({ brightness: 8, contrast: 15, temperature: -6 })]);
    expect(s).toEqual(st({ brightness: 8, contrast: 15, temperature: -6 }));
  });

  it("LAST op for a param wins (no composition)", () => {
    const s = collectAdjustState([
      adjust("brightness", 10),
      adjust("contrast", 5),
      adjust("brightness", -20), // overrides the first brightness
    ]);
    expect(s.brightness).toBe(-20);
    expect(s.contrast).toBe(5);
  });

  it("an autoEnhance BASE is overridden by a later explicit adjust for the same param", () => {
    const s = collectAdjustState([
      autoEnhance({ brightness: 8, contrast: 15 }),
      adjust("brightness", 30), // overrides the auto-enhance brightness base
    ]);
    expect(s.brightness).toBe(30); // explicit wins
    expect(s.contrast).toBe(15); // auto-enhance base survives (no later override)
  });

  it("a later autoEnhance base does NOT clobber a param it doesn't name", () => {
    const s = collectAdjustState([
      adjust("saturation", 40),
      autoEnhance({ brightness: 5 }), // names brightness only
    ]);
    expect(s.saturation).toBe(40);
    expect(s.brightness).toBe(5);
  });

  it("ignores non-tone/colour ops (crop, etc.)", () => {
    const s = collectAdjustState([cropOp(), adjust("exposure", 7), cropOp()]);
    expect(s).toEqual(st({ exposure: 7 }));
  });
});

/* ================================================================== */
/* isAdjustIdentity                                                    */
/* ================================================================== */

describe("isAdjustIdentity", () => {
  it("is true only when every setpoint is 0", () => {
    expect(isAdjustIdentity(zeroAdjustState())).toBe(true);
  });
  it("is false when any single param is non-zero", () => {
    for (const key of Object.keys(zeroAdjustState()) as (keyof AdjustState)[]) {
      expect(isAdjustIdentity(st({ [key]: 1 }))).toBe(false);
    }
  });
});

/* ================================================================== */
/* compileAdjust — pinned tone LUT reference arrays                    */
/* ================================================================== */

describe("compileAdjust — identity", () => {
  it("identity state yields identity LUTs and an identity matrix", () => {
    const c = compileAdjust(zeroAdjustState());
    for (const i of IDX) {
      expect(c.lutR[i]).toBe(i);
      expect(c.lutG[i]).toBe(i);
      expect(c.lutB[i]).toBe(i);
    }
    // exhaustive: every entry is a pass-through
    for (let x = 0; x < 256; x++) expect(c.lutG[x]).toBe(x);
    expect(c.identityMatrix).toBe(true);
    expect(c.matrix).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

describe("compileAdjust — pinned tone reference arrays (indices 0,64,128,192,255)", () => {
  // Computed once from the bound curves; pinned to catch any drift. When
  // temperature is 0 the three channels are identical, so lutG stands for all.
  const REF: Record<string, [Partial<AdjustState>, number[]]> = {
    "brightness +50": [{ brightness: 50 }, [50, 114, 178, 242, 255]],
    "brightness -50": [{ brightness: -50 }, [0, 14, 78, 142, 205]],
    "contrast +50": [{ contrast: 50 }, [0, 33, 128, 223, 255]],
    "contrast -50": [{ contrast: -50 }, [42, 85, 128, 171, 214]],
    "exposure +50": [{ exposure: 50 }, [0, 128, 255, 255, 255]],
    "exposure -50": [{ exposure: -50 }, [0, 32, 64, 96, 128]],
    "highlights +50": [{ highlights: 50 }, [0, 64, 128, 205, 255]],
    "highlights -50": [{ highlights: -50 }, [0, 64, 128, 179, 204]],
    "shadows +50": [{ shadows: 50 }, [51, 77, 128, 192, 255]],
    "shadows -50": [{ shadows: -50 }, [0, 51, 128, 192, 255]],
  };

  for (const [name, [partial, expected]] of Object.entries(REF)) {
    it(`${name} pins to ${JSON.stringify(expected)}`, () => {
      const c = compileAdjust(st(partial));
      expect(lutAt(c.lutG)).toEqual(expected);
      // same curve on all channels when temperature is untouched
      expect(lutAt(c.lutR)).toEqual(expected);
      expect(lutAt(c.lutB)).toEqual(expected);
      expect(c.identityMatrix).toBe(true); // tone-only → no matrix
    });
  }

  it("highlights lifts only the upper half (≤128 is identity)", () => {
    const c = compileAdjust(st({ highlights: 50 }));
    for (let x = 0; x <= 128; x++) expect(c.lutG[x]).toBe(x);
    expect(c.lutG[192]).toBeGreaterThan(192); // upper half lifted
  });

  it("shadows lifts only the lower half (≥128 is identity)", () => {
    const c = compileAdjust(st({ shadows: 50 }));
    for (let x = 128; x < 256; x++) expect(c.lutG[x]).toBe(x);
    expect(c.lutG[64]).toBeGreaterThan(64); // lower half lifted
  });
});

/* ================================================================== */
/* compileAdjust — composition order                                   */
/* ================================================================== */

describe("compileAdjust — tone composition (brightness → contrast)", () => {
  /** Manual composed evaluation of just brightness then contrast (float chain,
      rounded once) — the independent oracle for the composition. */
  function manualBC(x: number, b: number, cv: number): number {
    let t = x + b;
    const f = (259 * (cv + 255)) / (255 * (259 - cv));
    t = f * (t - 128) + 128;
    return Math.min(255, Math.max(0, Math.round(t)));
  }

  it("brightness+contrast together differs from either alone", () => {
    const both = compileAdjust(st({ brightness: 30, contrast: 40 })).lutG;
    const bOnly = compileAdjust(st({ brightness: 30 })).lutG;
    const cOnly = compileAdjust(st({ contrast: 40 })).lutG;
    // pinned at IDX
    expect(lutAt(both)).toEqual([0, 81, 169, 255, 255]);
    expect(lutAt(bOnly)).toEqual([30, 94, 158, 222, 255]);
    expect(lutAt(cOnly)).toEqual([0, 40, 128, 216, 255]);
    // genuinely different from each single-param curve
    expect(lutAt(both)).not.toEqual(lutAt(bOnly));
    expect(lutAt(both)).not.toEqual(lutAt(cOnly));
  });

  it("matches a manual composed brightness→contrast evaluation across the domain", () => {
    const both = compileAdjust(st({ brightness: 30, contrast: 40 })).lutG;
    for (const x of [0, 40, 64, 100, 128, 160, 192, 230, 255]) {
      expect(both[x]).toBe(manualBC(x, 30, 40));
    }
  });
});

/* ================================================================== */
/* compileAdjust — temperature (baked per-channel) + saturation matrix */
/* ================================================================== */

describe("compileAdjust — temperature gain baked into the LUTs", () => {
  it("warmth +50 raises red, lowers blue, leaves green as the tone curve", () => {
    const c = compileAdjust(st({ temperature: 50 }));
    // tone is identity here, so green passes through
    expect(lutAt(c.lutG)).toEqual([0, 64, 128, 192, 255]);
    // r *= 1.075, b *= 0.925 (rounded, clamped)
    expect(lutAt(c.lutR)).toEqual([0, 69, 138, 206, 255]);
    expect(lutAt(c.lutB)).toEqual([0, 59, 118, 178, 236]);
    expect(c.identityMatrix).toBe(true); // warmth is a LUT gain, not the matrix
  });

  it("cool (negative warmth) lowers red and raises blue", () => {
    const c = compileAdjust(st({ temperature: -50 }));
    expect(c.lutR[192]).toBeLessThan(192);
    expect(c.lutB[192]).toBeGreaterThan(192);
  });
});

describe("compileAdjust — saturation matrix (luma-preserving Rec.709)", () => {
  it("saturation 0 → identity matrix flagged", () => {
    const c = compileAdjust(zeroAdjustState());
    expect(c.identityMatrix).toBe(true);
    expect(c.matrix).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("saturation +100 (s=2) pins the standard luma-blend matrix", () => {
    const c = compileAdjust(st({ saturation: 100 }));
    expect(c.identityMatrix).toBe(false);
    const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
    expect(c.matrix.map(round4)).toEqual([
      1.7874, -0.7152, -0.0722,
      -0.2126, 1.2848, -0.0722,
      -0.2126, -0.7152, 1.9278,
    ]);
  });

  it("every row sums to 1 (grey stays grey — luma preserved)", () => {
    const c = compileAdjust(st({ saturation: 60 }));
    for (let row = 0; row < 3; row++) {
      const sum = c.matrix[row * 3] + c.matrix[row * 3 + 1] + c.matrix[row * 3 + 2];
      expect(sum).toBeCloseTo(1, 12);
    }
  });
});

/* ================================================================== */
/* computeAutoEnhance — synthetic buffers                              */
/* ================================================================== */

describe("computeAutoEnhance", () => {
  const W = 64;
  const H = 64;
  const N = W * H;

  function make(fn: (t: number) => [number, number, number]): Uint8ClampedArray {
    const b = new Uint8ClampedArray(N * 4);
    for (let i = 0; i < N; i++) {
      const [r, g, bl] = fn(i / N);
      b[i * 4] = r;
      b[i * 4 + 1] = g;
      b[i * 4 + 2] = bl;
      b[i * 4 + 3] = 255;
    }
    return b;
  }

  it("a low-contrast mid-grey ramp gains positive contrast", () => {
    const buf = make((t) => {
      const v = 110 + Math.floor(t * 36); // squeezed into [110,145]
      return [v, v, v];
    });
    const s = computeAutoEnhance(buf, W, H);
    expect(s.contrast).toBeGreaterThan(0);
  });

  it("a dark image gains positive brightness", () => {
    const buf = make((t) => {
      const v = Math.floor(t * 90); // gradient 0..89
      return [v, v, v];
    });
    const s = computeAutoEnhance(buf, W, H);
    expect(s.brightness).toBeGreaterThan(0);
  });

  it("a blue-cast image gains positive temperature (warmer)", () => {
    const buf = make((t) => {
      const base = 60 + Math.floor(t * 120);
      return [base - 40, base, base + 40]; // r cold, b hot
    });
    const s = computeAutoEnhance(buf, W, H);
    expect(s.temperature).toBeDefined();
    expect(s.temperature!).toBeGreaterThan(0);
  });

  it("an already-stretched neutral image yields a near-zero partial (no cast, tiny tone)", () => {
    const buf = make((t) => {
      const v = 8 + Math.floor(t * 239); // spans [8,247] neutrally
      return [v, v, v];
    });
    const s = computeAutoEnhance(buf, W, H);
    expect(s.temperature).toBeUndefined(); // neutral → no white-balance move
    // tone params, if present, are tiny
    if (s.brightness !== undefined) expect(Math.abs(s.brightness)).toBeLessThanOrEqual(3);
    if (s.contrast !== undefined) expect(Math.abs(s.contrast)).toBeLessThanOrEqual(3);
  });

  it("returns an empty partial for a degenerate (zero-pixel) request", () => {
    expect(computeAutoEnhance(new Uint8ClampedArray(0), 0, 0)).toEqual({});
  });

  it("values are integers and bounded (±40 brightness, ±50 contrast, ±30 temperature)", () => {
    const buf = make((t) => [Math.floor(t * 20), Math.floor(t * 20), 200]); // dark + strong blue cast
    const s = computeAutoEnhance(buf, W, H);
    if (s.brightness !== undefined) {
      expect(Number.isInteger(s.brightness)).toBe(true);
      expect(Math.abs(s.brightness)).toBeLessThanOrEqual(40);
    }
    if (s.contrast !== undefined) {
      expect(Number.isInteger(s.contrast)).toBe(true);
      expect(Math.abs(s.contrast)).toBeLessThanOrEqual(50);
    }
    if (s.temperature !== undefined) {
      expect(Number.isInteger(s.temperature)).toBe(true);
      expect(Math.abs(s.temperature)).toBeLessThanOrEqual(30);
    }
  });
});

/* ================================================================== */
/* adjustLabel — the wires' canonical strings (plan §5)                */
/* ================================================================== */

describe("adjustLabel", () => {
  it("formats display name + signed integer", () => {
    expect(adjustLabel("brightness", 12)).toBe("Brightness +12");
    expect(adjustLabel("saturation", 8)).toBe("Saturation +8");
    expect(adjustLabel("contrast", -20)).toBe("Contrast −20");
  });

  it("maps temperature to the Warmth display name with a real Unicode minus", () => {
    expect(adjustLabel("temperature", -5)).toBe("Warmth −5");
    expect(adjustLabel("temperature", 5)).toBe("Warmth +5");
    // U+2212, not ASCII hyphen-minus
    expect(adjustLabel("temperature", -5)).toContain("−");
    expect(adjustLabel("temperature", -5)).not.toContain("-");
  });

  it("rounds non-integers and gives zero an explicit +", () => {
    expect(adjustLabel("exposure", 0)).toBe("Exposure +0");
    expect(adjustLabel("highlights", 3.7)).toBe("Highlights +4");
    expect(adjustLabel("shadows", -3.7)).toBe("Shadows −4");
  });
});
