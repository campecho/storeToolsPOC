import type { AdjustParam, PhotoOp } from "@/lib/schema/photo";

/**
 * Photo-editor tone & colour MATH (plan §3.3 "Adjust", §4 PE4). Pure and
 * ISOMORPHIC — no DOM, no canvas, no node — so it is unit-testable away from
 * the surface and the server render host (PE3/PE5) replicates it byte-for-byte.
 * Style follows `src/lib/photo/geometry.ts`. This module builds the compiled
 * per-channel LUTs + colour matrix; `ops.ts` applies them to raw RGBA (the
 * parity core the server worker copies).
 *
 * ── BINDING MODEL (the whole PE4 tranche hangs on this contract) ──────────────
 *
 * SETPOINT SEMANTICS. An `adjust` op's `value` is an ABSOLUTE setpoint for its
 * param — an integer in −100..+100, 0 = identity — NOT a delta and NOT a
 * function to compose with other ops of the same param. Within the APPLIED slice
 * (ops[0..cursor)) the LAST op for a param WINS: two Brightness ops leave only
 * the second in force. `autoEnhance.params` supplies BASE values for the params
 * it chose; any later explicit `adjust` op OVERRIDES that param. This keeps undo
 * predictable and replay trivial — "stored explicit, replay never re-derives"
 * (schema.ts contract): the recipe holds the numbers, this module never derives
 * them from pixels at replay time (`computeAutoEnhance` runs once, at the moment
 * the user clicks Auto-enhance, and its result is stored explicit as an
 * `autoEnhance` op).
 *
 * ONE PASS. `collectAdjustState` folds the applied slice into a 7-field
 * `AdjustState`; `compileAdjust` turns that into per-channel 256-entry LUTs plus
 * ONE 3×3 colour matrix; `ops.applyAdjust` runs LUT-FIRST-THEN-MATRIX in a
 * single pixel pass. Alpha is never touched.
 *
 *   • The LUT carries the TONE curve (brightness → contrast → exposure →
 *     highlights → shadows, same curve for all three channels) with the
 *     TEMPERATURE per-channel gain BAKED IN afterwards (so warmth costs no extra
 *     pass — it is folded into the tables).
 *   • The MATRIX carries SATURATION only (a luma-preserving 3×3, Rec.709).
 *
 * ROUNDING (bind exactly — the server must reproduce it): the tone curve is
 * evaluated in FLOAT through the whole chain (no intermediate rounding); the
 * per-channel temperature gain multiplies that float; then a SINGLE Math.round
 * followed by clamp to 0..255 produces each LUT entry. When temperature is 0 the
 * gain is exactly 1, so every channel equals the rounded tone curve. The matrix
 * pass (in `ops.ts`) likewise does Math.round then clamp 0..255 on each output
 * channel. One rounding point per value, everywhere.
 *
 * ── CURVE SPECS (each documented at its site below) ───────────────────────────
 * brightness  additive:   x + v
 * contrast    classic:    f = 259·(v+255) / (255·(259−v));  f·(x−128)+128
 * exposure    stops v/50: x · 2^(v/50)                        (±2 EV at ±100)
 * highlights  upper half: x>128 → x + (v/100)·(x−128)·((x−128)/127)·0.8
 * shadows     lower half: x<128 → x + (v/100)·(128−x)·((128−x)/128)·0.8
 * temperature per-channel gain baked in: r·(1+0.15·v/100), b·(1−0.15·v/100)
 * saturation  s = 1+v/100; luma-preserving Rec.709 matrix (identity at s===1)
 */

/** The seven adjust params folded to their absolute setpoints (0 = identity). */
export interface AdjustState {
  brightness: number;
  contrast: number;
  exposure: number;
  highlights: number;
  shadows: number;
  saturation: number;
  temperature: number;
}

/** Rec.709 luma weights — shared by the saturation matrix and auto-enhance. */
const WR = 0.2126;
const WG = 0.7152;
const WB = 0.0722;

/** The zero state — every param at its identity setpoint. */
export function zeroAdjustState(): AdjustState {
  return {
    brightness: 0,
    contrast: 0,
    exposure: 0,
    highlights: 0,
    shadows: 0,
    saturation: 0,
    temperature: 0,
  };
}

const ADJUST_KEYS: AdjustParam[] = [
  "brightness",
  "contrast",
  "exposure",
  "highlights",
  "shadows",
  "saturation",
  "temperature",
];

/**
 * Fold the APPLIED op slice (the caller passes `recipe.slice(0, cursor)`) into a
 * single `AdjustState`. Per the binding model: an `autoEnhance` op writes each
 * named param as a BASE value; an `adjust` op writes its one param; LAST WRITE
 * WINS for each param; every other op tag is ignored. Ops beyond the applied
 * slice (the redo tail) are the CALLER's concern — this function only sees what
 * it is given.
 */
export function collectAdjustState(ops: PhotoOp[]): AdjustState {
  const state = zeroAdjustState();
  for (const op of ops) {
    if (op.op === "autoEnhance") {
      for (const key of ADJUST_KEYS) {
        const v = op.params[key];
        if (typeof v === "number") state[key] = v;
      }
    } else if (op.op === "adjust") {
      state[op.param] = op.value;
    }
    // every other op tag is not a tone/colour op — ignored
  }
  return state;
}

/** True when no param moves a pixel — all seven setpoints are 0. */
export function isAdjustIdentity(state: AdjustState): boolean {
  return (
    state.brightness === 0 &&
    state.contrast === 0 &&
    state.exposure === 0 &&
    state.highlights === 0 &&
    state.shadows === 0 &&
    state.saturation === 0 &&
    state.temperature === 0
  );
}

/** The compiled, apply-ready form: three per-channel LUTs + one row-major 3×3
    colour matrix. `identityMatrix` lets the pixel pass skip the matrix entirely
    (the common tone-only case). */
export interface CompiledAdjust {
  lutR: Uint8Array;
  lutG: Uint8Array;
  lutB: Uint8Array;
  /** 9 entries, ROW-MAJOR: [m00,m01,m02, m10,m11,m12, m20,m21,m22]. */
  matrix: number[];
  identityMatrix: boolean;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * The composed TONE curve at input level `x` (0..255), evaluated in FLOAT with
 * NO intermediate rounding — the fixed composition order brightness → contrast →
 * exposure → highlights → shadows (each stage takes the previous stage's running
 * value; highlights/shadows act on that running value, not the original x). The
 * running value is allowed to leave 0..255 mid-chain; it is rounded+clamped once
 * by the caller after the temperature gain.
 */
function toneCurve(x: number, s: AdjustState): number {
  let t = x;

  // brightness — additive offset in levels (x + v).
  t = t + s.brightness;

  // contrast — the classic factor about mid-grey 128.
  //   f = 259·(v+255) / (255·(259−v));  out = f·(t−128)+128.  f=1 at v=0.
  if (s.contrast !== 0) {
    const f = (259 * (s.contrast + 255)) / (255 * (259 - s.contrast));
    t = f * (t - 128) + 128;
  }

  // exposure — v/50 stops (±2 EV at ±100):  out = t · 2^(v/50).
  if (s.exposure !== 0) {
    t = t * Math.pow(2, s.exposure / 50);
  }

  // highlights — smooth lift/roll-off of the UPPER half only (identity ≤128):
  //   t>128 → t + (v/100)·(t−128)·((t−128)/127)·0.8.
  if (t > 128) {
    const d = t - 128;
    t = t + (s.highlights / 100) * d * (d / 127) * 0.8;
  }

  // shadows — mirror for the LOWER half only (identity ≥128):
  //   t<128 → t + (v/100)·(128−t)·((128−t)/128)·0.8.
  if (t < 128) {
    const d = 128 - t;
    t = t + (s.shadows / 100) * d * (d / 128) * 0.8;
  }

  return t;
}

/**
 * The luma-preserving SATURATION matrix (row-major) for scale `s = 1 + v/100`.
 * Standard blend toward Rec.709 luma: out_i = (1−s)·luma + s·in_i, i.e. each row
 * is [(1−s)·wR (+s on the diagonal), (1−s)·wG (+s), (1−s)·wB (+s)]. At s===1 it
 * is exactly the identity.
 */
function saturationMatrix(s: number): number[] {
  const a = 1 - s;
  return [
    a * WR + s, a * WG, a * WB,
    a * WR, a * WG + s, a * WB,
    a * WR, a * WG, a * WB + s,
  ];
}

/**
 * Compile an `AdjustState` into apply-ready LUTs + matrix (see `CompiledAdjust`).
 * Tone is evaluated in float, the temperature gain is folded per channel, and a
 * SINGLE Math.round+clamp lands each LUT entry (the binding rounding rule).
 */
export function compileAdjust(state: AdjustState): CompiledAdjust {
  const gainR = 1 + 0.15 * (state.temperature / 100);
  const gainB = 1 - 0.15 * (state.temperature / 100);
  const lutR = new Uint8Array(256);
  const lutG = new Uint8Array(256);
  const lutB = new Uint8Array(256);
  for (let x = 0; x < 256; x++) {
    const tone = toneCurve(x, state);
    lutR[x] = clampByte(Math.round(tone * gainR));
    lutG[x] = clampByte(Math.round(tone)); // green carries no temperature gain
    lutB[x] = clampByte(Math.round(tone * gainB));
  }
  const s = 1 + state.saturation / 100;
  return {
    lutR,
    lutG,
    lutB,
    matrix: saturationMatrix(s),
    identityMatrix: s === 1,
  };
}

/* ------------------------------------------------------------------ */
/* Auto-enhance — one-shot analysis, values STORED EXPLICIT           */
/* ------------------------------------------------------------------ */

/**
 * Invert the contrast factor: given a desired stretch factor `f`, return the
 * `value` that produces it (the algebraic inverse of the contrast formula):
 *   f = 259·(v+255)/(255·(259−v))  ⇒  v = 259·255·(f−1) / (259 + 255·f).
 * (v=0 at f=1.) Used by auto-enhance to turn a target tonal spread into a
 * contrast setpoint.
 */
function contrastValueForFactor(f: number): number {
  return (259 * 255 * (f - 1)) / (259 + 255 * f);
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/**
 * Analyse a raw RGBA proxy and return the auto-enhance setpoints (histogram
 * stretch + gray-world white balance). Integer, bounded, and PARTIAL — params
 * that land at 0 are omitted, so an already-good image returns `{}` (or a tiny
 * partial). The result is what the caller stores EXPLICIT as an `autoEnhance`
 * op; replay never re-derives it.
 *
 * Method:
 *  • Rec.709 luma histogram; p_low / p_high at a 0.5% clip each end.
 *  • brightness — shift the tonal MIDPOINT toward 128: round(128 − midpoint),
 *    bounded ±40.
 *  • contrast — stretch the spread [p_low,p_high] onto [8,247] via the INVERSE
 *    of the contrast formula, bounded ±50.
 *  • temperature — gray-world: round(0.8·(bMean − rMean)), bounded ±30 (a blue
 *    cast yields a POSITIVE/warmer setpoint).
 *
 * POC SIMPLIFICATION (recorded): analysis runs on the RAW PROXY, i.e. the image
 * BEFORE any geometry ops are folded in (pre-geometry). Auto-enhance samples the
 * proxy the user is looking at; a production pass would analyse the geometry
 * result. Cheap to move if a wire disagrees.
 */
export function computeAutoEnhance(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Partial<AdjustState> {
  const out: Partial<AdjustState> = {};
  const n = width * height;
  if (n <= 0 || rgba.length < n * 4) return out;

  const hist = new Float64Array(256);
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (let i = 0; i < n * 4; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    rSum += r;
    gSum += g;
    bSum += b;
    const luma = WR * r + WG * g + WB * b;
    hist[Math.round(luma)]++;
  }

  // 0.5%-clip percentiles of the luma histogram.
  const clip = Math.floor(n * 0.005);
  let acc = 0;
  let pLow = 0;
  for (let b = 0; b < 256; b++) {
    acc += hist[b];
    if (acc > clip) {
      pLow = b;
      break;
    }
  }
  acc = 0;
  let pHigh = 255;
  for (let b = 255; b >= 0; b--) {
    acc += hist[b];
    if (acc > clip) {
      pHigh = b;
      break;
    }
  }

  // brightness — recentre the tonal midpoint toward 128.
  const midpoint = (pLow + pHigh) / 2;
  const brightness = clampInt(128 - midpoint, -40, 40);
  if (brightness !== 0) out.brightness = brightness;

  // contrast — stretch [pLow,pHigh] onto [8,247] (guard a degenerate spread).
  const spread = pHigh - pLow;
  if (spread > 0) {
    const factor = (247 - 8) / spread;
    const contrast = clampInt(contrastValueForFactor(factor), -50, 50);
    if (contrast !== 0) out.contrast = contrast;
  }

  // temperature — gray-world white balance (blue cast → warmer/positive).
  const rMean = rSum / n;
  const bMean = bSum / n;
  const temperature = clampInt(0.8 * (bMean - rMean), -30, 30);
  if (temperature !== 0) out.temperature = temperature;

  return out;
}

/* ------------------------------------------------------------------ */
/* History-dock labels (the wires' canonical strings, plan §5)        */
/* ------------------------------------------------------------------ */

/** Display names for the history dock / sliders — `temperature` reads "Warmth". */
const DISPLAY_NAME: Record<AdjustParam, string> = {
  brightness: "Brightness",
  contrast: "Contrast",
  exposure: "Exposure",
  highlights: "Highlights",
  shadows: "Shadows",
  saturation: "Saturation",
  temperature: "Warmth",
};

/**
 * The history-dock / slider label for an adjust op (plan §5, wire-pinned):
 * "Brightness +12", "Warmth −5", "Saturation +8" — the display name, a space, a
 * sign, and the integer magnitude. Negatives use a real Unicode minus (U+2212);
 * zero and positives take an explicit "+" (matching `straightenLabel`).
 */
export function adjustLabel(param: AdjustParam, value: number): string {
  const v = Math.round(value);
  const sign = v < 0 ? "−" : "+";
  return `${DISPLAY_NAME[param]} ${sign}${Math.abs(v)}`;
}
