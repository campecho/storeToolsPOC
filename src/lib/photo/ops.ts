import type { CompiledAdjust } from "./adjust-math";

/**
 * Photo-editor pixel-op replay on raw RGBA buffers — THE PARITY CORE (plan §1.3,
 * §4 PE4). Pure and ISOMORPHIC: the client feeds it a canvas `ImageData.data`
 * (`Uint8ClampedArray`), the server render worker feeds it a `sharp(...).raw()`
 * buffer (`Uint8Array`/`Buffer`); the SAME loop runs both sides, so WYSIWYG is
 * guaranteed by shared code, not by trusting two engines to agree (the layout
 * plan's text-layout principle, applied to raster).
 *
 * BINDING (must match `adjust-math.ts` byte-for-byte). One pass, LUT-FIRST then
 * MATRIX:
 *   1. per-channel LUT:  r←lutR[r], g←lutG[g], b←lutB[b]  (tone + temperature).
 *   2. IF the matrix is not identity, the saturation 3×3 (row-major) maps the
 *      LUT-mapped triple, with Math.round + clamp 0..255 per output channel.
 * Alpha (index +3) is NEVER touched. Rounding + clamp is done EXPLICITLY (not via
 * Uint8ClampedArray's implicit round/clamp) so a plain `Uint8Array` buffer
 * produces byte-identical results — the server uses one.
 */

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Apply a `CompiledAdjust` to an RGBA buffer IN PLACE. Length must be a multiple
 * of 4 (RGBA); any trailing partial pixel is ignored. When `identityMatrix` is
 * set the matrix step is skipped entirely (the common tone-only path — just three
 * table lookups per pixel).
 */
export function applyAdjust(
  rgba: Uint8ClampedArray | Uint8Array,
  compiled: CompiledAdjust,
): void {
  const { lutR, lutG, lutB, matrix, identityMatrix } = compiled;
  const len = rgba.length - (rgba.length % 4);

  if (identityMatrix) {
    // Tone/temperature only — LUT lookups write back directly (each LUT entry is
    // already a rounded, clamped 0..255 byte).
    for (let i = 0; i < len; i += 4) {
      rgba[i] = lutR[rgba[i]];
      rgba[i + 1] = lutG[rgba[i + 1]];
      rgba[i + 2] = lutB[rgba[i + 2]];
      // rgba[i + 3] — alpha — untouched.
    }
    return;
  }

  const m0 = matrix[0], m1 = matrix[1], m2 = matrix[2];
  const m3 = matrix[3], m4 = matrix[4], m5 = matrix[5];
  const m6 = matrix[6], m7 = matrix[7], m8 = matrix[8];

  for (let i = 0; i < len; i += 4) {
    // LUT first…
    const r = lutR[rgba[i]];
    const g = lutG[rgba[i + 1]];
    const b = lutB[rgba[i + 2]];
    // …then the colour matrix, rounded + clamped once per channel.
    rgba[i] = clampByte(Math.round(m0 * r + m1 * g + m2 * b));
    rgba[i + 1] = clampByte(Math.round(m3 * r + m4 * g + m5 * b));
    rgba[i + 2] = clampByte(Math.round(m6 * r + m7 * g + m8 * b));
    // rgba[i + 3] — alpha — untouched.
  }
}
