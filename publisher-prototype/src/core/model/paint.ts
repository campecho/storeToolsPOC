import { resolveColorRef, resolveFill } from "./color";
import type { LayoutObject } from "./objects";
import type { Swatch } from "./primitives";

/**
 * What a boxed object amounts to visually (PLAN.md §6.2). The renderer asks
 * this, then supplies its own chrome colours — the decision is document logic
 * and belongs in core; the greys are canvas furniture and belong to the shell.
 *
 * The two non-painted cases exist so a document is legible on review rather
 * than invisible: a frame carrying neither fill nor stroke would otherwise
 * draw nothing at all, and a picture frame has no pixels to draw yet.
 */
export type ObjectPaint =
  /** Draws its own fill and/or stroke. `strokeWidthIn` is document inches. */
  | { kind: "painted"; fill: string | null; stroke: string | null; strokeWidthIn: number | null }
  /**
   * A picture frame with nothing to show. The model renders a placeholder for
   * a null `assetId`; today every picture frame lands here, because there is
   * no blob store yet, so even a bound asset has no bytes. The Images & photo
   * group replaces this with the image.
   */
  | { kind: "placeholder"; stroke: string | null; strokeWidthIn: number | null }
  /** Nothing would draw — the renderer shows the frame boundary instead. */
  | { kind: "boundary" };

/** A boxed object; lines paint from their stroke and never reach this. */
export type BoxedObject = Exclude<LayoutObject, { type: "line" }>;

export function objectPaint(o: BoxedObject, swatches: readonly Swatch[]): ObjectPaint {
  const stroke = o.stroke ? resolveColorRef(o.stroke.color, swatches) : null;
  const strokeWidthIn = o.stroke ? o.stroke.widthIn : null;

  if (o.type === "picture") return { kind: "placeholder", stroke, strokeWidthIn };

  const fill = resolveFill(o.fill, swatches);
  if (fill === null && stroke === null) return { kind: "boundary" };
  return { kind: "painted", fill, stroke, strokeWidthIn };
}
