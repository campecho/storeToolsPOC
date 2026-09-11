import type { ColorValue } from "../model";
import { clamp01, naiveCmykToRgb, naiveRgbToCmyk, type Cmyk, type Rgb } from "./convert";
import { CMYK_TO_SRGB_B64, CMYK_TO_SRGB_CHANNELS, CMYK_TO_SRGB_STEPS } from "./luts/cmykToSrgb";
import { SRGB_TO_CMYK_B64, SRGB_TO_CMYK_CHANNELS, SRGB_TO_CMYK_STEPS } from "./luts/srgbToCmyk";

/**
 * Print preview — what the GRACoL press makes of a color, as the screen
 * shows it (SEAMS.md "Print preview tables"). Two lookup tables derived
 * from the press profile and interpolated multilinearly here: no ICC engine
 * in the prototype, no async load, deterministic, a few hundred
 * multiplications per color. This is a SURFACE: production color management
 * (PLAN.md §2, dev team) replaces the resolver behind the same signatures.
 *
 *   proofCmyk   press → screen: the preview of a CMYK literal.
 *   pressCmyk   screen → press: the separation an RGB literal will print as.
 *   proofRgb    the round trip: how RGB content looks once printed.
 *
 * The naive device formulas stand in only if a table fails to decode.
 *
 * `atob` is the one platform global the core relies on (WHATWG, present in
 * every browser and in Node ≥ 16 — engines pins ≥ 22); no import, so the
 * boundary check is silent about it by design.
 */

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type Table = { data: Uint8Array; steps: number; channels: number };

function loadTable(b64: string, steps: number, channels: number, inputDims: number): Table | null {
  const data = decodeBase64(b64);
  return data.length === steps ** inputDims * channels ? { data, steps, channels } : null;
}

let cmykTable: Table | null | undefined;
let rgbTable: Table | null | undefined;

function tableCmyk(): Table | null {
  if (cmykTable === undefined) {
    cmykTable = loadTable(CMYK_TO_SRGB_B64, CMYK_TO_SRGB_STEPS, CMYK_TO_SRGB_CHANNELS, 4);
  }
  return cmykTable;
}
function tableRgb(): Table | null {
  if (rgbTable === undefined) {
    rgbTable = loadTable(SRGB_TO_CMYK_B64, SRGB_TO_CMYK_STEPS, SRGB_TO_CMYK_CHANNELS, 3);
  }
  return rgbTable;
}

/** Multilinear interpolation over a regular grid: every corner of the cell
    around `coords` weighted by its distance. Output in 0–1. */
function lerpN(table: Table, coords: readonly number[]): number[] {
  const { data, steps, channels } = table;
  const dims = coords.length;
  const idx: number[] = [];
  const frac: number[] = [];
  for (const v of coords) {
    const x = clamp01(v) * (steps - 1);
    const i = Math.min(Math.floor(x), steps - 2);
    idx.push(i);
    frac.push(x - i);
  }
  const out: number[] = new Array<number>(channels).fill(0);
  const corners = 1 << dims;
  for (let corner = 0; corner < corners; corner++) {
    let weight = 1;
    let offset = 0;
    for (let d = 0; d < dims; d++) {
      const hi = (corner >> (dims - 1 - d)) & 1;
      const f = frac[d] ?? 0;
      weight *= hi ? f : 1 - f;
      offset = offset * steps + (idx[d] ?? 0) + hi;
    }
    if (weight === 0) continue;
    for (let ch = 0; ch < channels; ch++) {
      out[ch] = (out[ch] ?? 0) + (weight * (data[offset * channels + ch] ?? 0)) / 255;
    }
  }
  return out;
}

/** Press → screen. */
export function proofCmyk(cmyk: Cmyk): Rgb {
  const table = tableCmyk();
  if (!table) return naiveCmykToRgb(cmyk);
  const [r = 0, g = 0, b = 0] = lerpN(table, cmyk);
  return [r, g, b];
}

/** Screen → press: the separation the profile assigns an sRGB color. */
export function pressCmyk(rgb: Rgb): Cmyk {
  const table = tableRgb();
  if (!table) return naiveRgbToCmyk(rgb);
  const [c = 0, m = 0, y = 0, k = 0] = lerpN(table, rgb);
  return [c, m, y, k];
}

/** How RGB content looks once printed. */
export function proofRgb(rgb: Rgb): Rgb {
  return proofCmyk(pressCmyk(rgb));
}

/** The preview for any literal. */
export function proofColor(color: ColorValue): Rgb {
  return color.space === "cmyk" ? proofCmyk(color.values) : proofRgb(color.values);
}

/* ── Gamut warning ── */

function srgbToLab([r, g, b]: Rgb): [number, number, number] {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [rl, gl, bl] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * rl + 0.3576 * gl + 0.1805 * bl) / 0.95047;
  const y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  const z = (0.0193 * rl + 0.1192 * gl + 0.9505 * bl) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** ΔE76 (CIE 1976 Lab distance) between two sRGB colours, 0–1 channels. */
export function deltaE76(a: Rgb, b: Rgb): number {
  const la = srgbToLab(a);
  const lb = srgbToLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

/** ΔE76 between an sRGB color and its printed appearance. */
export function gamutShift(rgb: Rgb): number {
  return deltaE76(rgb, proofRgb(rgb));
}

/** ASSUMPTION: a shift past this reads as "a different color" at a glance
    (ΔE76 ≈ 2 is just noticeable; the perceptual intent moves even neutrals by
    ~4–5). Flagged for SME validation against real proofs. */
export const GAMUT_WARN_DELTA_E = 6;

/** True when printing will visibly change this sRGB color. */
export function isOutOfGamut(rgb: Rgb): boolean {
  return gamutShift(rgb) > GAMUT_WARN_DELTA_E;
}
