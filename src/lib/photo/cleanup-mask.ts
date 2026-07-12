/**
 * Clean-up (PE9) pure geometry + id helpers — no DOM, no canvas — so the brush
 * overlay's fill-rect math and the stored-explicit blob ids are unit-testable away
 * from the surface. The CleanupBrushOverlay owns the canvas painting; everything
 * deterministic lives here.
 *
 * MASK / RECT CONTRACT (binding — server ErasePayloadSchema): the brushed strokes
 * accumulate an axis-aligned bbox in EFFECTIVE-image px; `fillRectFromBounds` pads
 * it by the brush radius (so the soft dab's full extent is inside the rect) plus a
 * safety margin, clamps to the effective image, and rounds to integers. The
 * returned patch PNG has exactly `rect.w × rect.h` pixels, so the rect MUST be
 * integer and in-bounds before it rides the payload.
 */

export interface StrokeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A fresh, empty accumulator (inverted infinities so the first point seeds it). */
export function emptyBounds(): StrokeBounds {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

/** Grow the accumulator to include a stroke-center point (effective px). Mutates
    in place — the overlay calls it per interpolated brush point, so the accumulator
    is the union of every stroke across the session (until Apply / Discard). */
export function extendBounds(b: StrokeBounds, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}

/** True once at least one point has been accumulated. */
export function boundsSeeded(b: StrokeBounds): boolean {
  return Number.isFinite(b.minX);
}

export interface FillRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * The padded, clamped, INTEGER fill rect from accumulated stroke-center bounds.
 * Pad = brushSize/2 (the brush's own half-width — the dab reaches this far past a
 * center point) + `margin` (a safety band so a soft edge never grazes the rect
 * edge, plan §10). Clamp to the effective `image`, round to ints. Returns null for
 * an empty/degenerate accumulation (no stroke, or a rect that clamps to < 1 px on
 * an axis) so the caller skips the fill rather than shipping a zero-size rect.
 */
export function fillRectFromBounds(
  bounds: StrokeBounds,
  brushSize: number,
  image: { w: number; h: number },
  margin = 8,
): FillRect | null {
  if (!boundsSeeded(bounds)) return null;
  const pad = brushSize / 2 + margin;
  const x0 = clampInt(Math.floor(bounds.minX - pad), 0, image.w);
  const y0 = clampInt(Math.floor(bounds.minY - pad), 0, image.h);
  const x1 = clampInt(Math.ceil(bounds.maxX + pad), 0, image.w);
  const y1 = clampInt(Math.ceil(bounds.maxY + pad), 0, image.h);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 1 || h < 1) return null;
  return { x: x0, y: y0, w, h };
}

/**
 * A deterministic, jail-safe content id for a raster's bytes — the mask / patch
 * blob-store id stem AND the erase op's `patch.id` (which maps to the multipart
 * part `erase:<id>` and the jail basename `erase-<id>.png`, so it MUST match
 * /^[a-z0-9-]{1,64}$/i). Mirrors `assetIdFor`'s FNV-1a-32 + length scheme, but
 * hashes the RAW bytes directly (a mask/patch is binary — base64-encoding a
 * possibly-multi-MB patch just to hash it would be wasteful). The `-` + byte
 * length is the same cheap collision guard `assetIdFor` uses.
 */
export function contentHashId(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  return `px-${hex}-${bytes.length}`;
}
