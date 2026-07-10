import type { Dims } from "./geometry";
import { effectiveDpi } from "./geometry";

/**
 * Bleed edge analysis + expansion math (plan §3.2 `bleed.ts`, §4 PE5 — "the
 * differentiator": bleed expansion is the #1 print-resubmission cause).
 *
 * Two pure helpers, both isomorphic (raw RGBA in, numbers/strings out — no
 * DOM/canvas), so the client preview and the server render host agree:
 *
 *   • analyzeEdges — pick the AUTO edge-fill strategy from the image's border.
 *   • bleedPx      — how many pixels one edge must grow to reach the bleed line.
 *
 * The strategy vocabulary is mirror | smear | solid (schema BleedExpandOpSchema),
 * but analyzeEdges only ever returns mirror or solid: "smear" is MANUAL-ONLY —
 * the Section-C "Edge fill ▾" dropdown offers it, auto never picks it. Why: a
 * smear is a DIRECTIONAL stretch of the border, and which direction reads as
 * correct is content intent (a sky smears up, a wood grain along the grain) that
 * pixels alone can't disambiguate. Mirror (reflect the border) and solid (extend
 * a flat edge) are safe defaults; smear is a deliberate operator override.
 */

/**
 * Per-channel variance threshold (0..65025 for 8-bit values) below which the
 * 2px border ring reads as a FLAT edge → solid fill. 100 ≈ a per-channel
 * standard deviation of 10/255 (~4% of full range): comfortably above the 1–9
 * variance a clean white/solid border shows under JPEG-quantisation noise, and
 * comfortably below the hundreds-to-thousands a textured, detailed edge produces.
 * Documented + tunable — PE5's corpus pass may retune against real borders.
 */
export const EDGE_SOLID_VARIANCE = 100;

/** How many pixels of the outer border ring to sample (per the plan's "2px
    border ring"). */
const RING = 2;

export type EdgeStrategy = "mirror" | "solid";

export interface EdgeAnalysis {
  strategy: EdgeStrategy;
  /** Present only for "solid": the mean border colour as `#rrggbb`. */
  color?: string;
}

function hexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
}

/**
 * Sample the outermost `RING` (2px) border of an RGBA buffer and decide the auto
 * edge-fill strategy: if every colour channel's variance across the ring is
 * below EDGE_SOLID_VARIANCE the border is flat → "solid" with the mean colour as
 * hex; otherwise the border carries detail → "mirror". Alpha is ignored (the
 * colour that would be extended is what matters). A degenerate/empty buffer
 * falls back to "mirror" (the safe, content-agnostic default).
 *
 * `rgba` is tightly-packed RGBA, length `w*h*4` (canvas ImageData or a sharp
 * `.raw()` buffer forced to 4 channels).
 */
export function analyzeEdges(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
): EdgeAnalysis {
  if (w <= 0 || h <= 0 || rgba.length < w * h * 4) {
    return { strategy: "mirror" };
  }

  let n = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumR2 = 0;
  let sumG2 = 0;
  let sumB2 = 0;

  for (let y = 0; y < h; y++) {
    const onHorizEdge = y < RING || y >= h - RING;
    for (let x = 0; x < w; x++) {
      // Ring = the outer 2px frame: a full row on the top/bottom bands, else
      // only the left/right 2px columns.
      if (!onHorizEdge && x >= RING && x < w - RING) continue;
      const i = (y * w + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      sumR += r;
      sumG += g;
      sumB += b;
      sumR2 += r * r;
      sumG2 += g * g;
      sumB2 += b * b;
      n++;
    }
  }

  if (n === 0) return { strategy: "mirror" };

  const meanR = sumR / n;
  const meanG = sumG / n;
  const meanB = sumB / n;
  // Population variance E[x²] − E[x]² per channel (guard tiny negatives from FP).
  const varR = Math.max(0, sumR2 / n - meanR * meanR);
  const varG = Math.max(0, sumG2 / n - meanG * meanG);
  const varB = Math.max(0, sumB2 / n - meanB * meanB);

  const flat =
    varR < EDGE_SOLID_VARIANCE &&
    varG < EDGE_SOLID_VARIANCE &&
    varB < EDGE_SOLID_VARIANCE;

  if (flat) {
    return { strategy: "solid", color: `#${hexByte(meanR)}${hexByte(meanG)}${hexByte(meanB)}` };
  }
  return { strategy: "mirror" };
}

/**
 * Pixels one edge must grow to reach the bleed line: round(amountInches ×
 * effectiveDpi(image, targetSize)), min 1. ONE DPI drives all four edges — the
 * min-axis, best-orientation figure the strip already shows (effectiveDpi), so
 * the bleed frame stays uniform and matches the number the operator sees. Floored
 * at 1 so a bleed that rounds to zero pixels still expands by a pixel (the op is
 * meaningless at 0, and the schema requires px ≥ 1).
 *
 * Worked example (plan §5): 0.125 in on a 4032×3024 image at 4×6 (672 DPI) →
 * round(0.125 × 672) = 84 px per edge.
 */
export function bleedPx(
  amountInches: number,
  image: Dims,
  targetSize: { w: number; h: number },
): number {
  const dpi = effectiveDpi(image, { w: targetSize.w, h: targetSize.h });
  return Math.max(1, Math.round(amountInches * dpi));
}
