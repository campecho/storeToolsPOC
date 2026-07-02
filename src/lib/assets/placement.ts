import type { Asset, FrameObject, LayoutDocument } from "@/schema";
import { createFrame, type BBox } from "@/lib/layout/objects";

/**
 * Where a clicked asset lands on the page (plan L8): natural size at screen
 * DPI, scaled up to a workable minimum, fit within the margin box, centered.
 */

// ASSUMPTION: source pixels map to inches at 96 DPI (the CSS default) — the
// POC doesn't read embedded print-DPI metadata.
export const PLACE_DPI = 96;
/** A tiny source still lands grabbable — scale its long side up to this. */
export const MIN_PLACED_LONG_SIDE_IN = 2;

export function placedPictureRect(
  naturalW: number | undefined,
  naturalH: number | undefined,
  doc: Pick<LayoutDocument, "size" | "margin">,
): BBox {
  let w = Math.max(naturalW ?? 0, 1) / PLACE_DPI;
  let h = Math.max(naturalH ?? 0, 1) / PLACE_DPI;

  const long = Math.max(w, h);
  if (long < MIN_PLACED_LONG_SIDE_IN) {
    const up = MIN_PLACED_LONG_SIDE_IN / long;
    w *= up;
    h *= up;
  }

  // fit within the margin box (never upscale past natural-or-minimum size)
  const maxW = Math.max(doc.size.w - 2 * doc.margin, 0.5);
  const maxH = Math.max(doc.size.h - 2 * doc.margin, 0.5);
  const fit = Math.min(maxW / w, maxH / h, 1);
  w *= fit;
  h *= fit;

  return { x: (doc.size.w - w) / 2, y: (doc.size.h - h) / 2, w, h };
}

/** A picture frame bound to the asset, borderless — the image is the ink. */
export function createPlacedPicture(asset: Asset, rect: BBox): FrameObject {
  return {
    ...createFrame("picture", rect.x, rect.y, rect.w, rect.h),
    fill: null,
    stroke: null,
    assetId: asset.id,
  };
}
