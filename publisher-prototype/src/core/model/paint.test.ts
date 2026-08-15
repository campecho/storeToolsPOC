import { describe, expect, it } from "vitest";
import { DEFAULT_LAYER_ID } from "./defaults";
import type { LayoutObject } from "./objects";
import { objectPaint, type BoxedObject } from "./paint";
import type { Swatch } from "./primitives";

/**
 * What a boxed object amounts to visually (PLAN.md §6.2). The cases that
 * matter are the ones that would otherwise leave a document invisible on
 * review: unfilled frames and picture frames with no pixels yet.
 */

const SWATCHES: Swatch[] = [
  {
    id: "swatch-brand",
    name: "Brand",
    value: { space: "rgb", values: [1, 0, 0] },
    theme: false,
  },
];

function box(over: Partial<BoxedObject> & { type?: LayoutObject["type"] } = {}): BoxedObject {
  return {
    type: "rect",
    id: "o",
    layerId: DEFAULT_LAYER_ID,
    locked: false,
    opacity: 1,
    blend: "normal",
    effects: {},
    xIn: 0,
    yIn: 0,
    wIn: 1,
    hIn: 1,
    rotationDeg: 0,
    fill: { kind: "none" },
    stroke: null,
    wrap: { mode: "none", distance: { lIn: 0, rIn: 0, tIn: 0, bIn: 0 } },
    ...over,
  } as BoxedObject;
}

describe("objectPaint", () => {
  it("paints a resolved solid fill", () => {
    const paint = objectPaint(
      box({ fill: { kind: "solid", color: { kind: "swatch", swatchId: "swatch-brand", tint: 1 } } }),
      SWATCHES,
    );
    expect(paint).toEqual({
      kind: "painted",
      fill: "rgb(255, 0, 0)",
      stroke: null,
      strokeWidthIn: null,
    });
  });

  it("paints a stroke in document inches", () => {
    const paint = objectPaint(
      box({
        stroke: {
          color: { kind: "literal", value: { space: "rgb", values: [0, 0, 0] } },
          widthIn: 0.02,
          dash: "solid",
        },
      }),
      SWATCHES,
    );
    expect(paint).toEqual({
      kind: "painted",
      fill: null,
      stroke: "rgb(0, 0, 0)",
      strokeWidthIn: 0.02,
    });
  });

  it("falls back to a boundary when nothing would draw", () => {
    // An empty text frame is the common case — no fill, no stroke, and the
    // glyphs it would show do not render yet.
    expect(objectPaint(box({ type: "text" }), SWATCHES)).toEqual({ kind: "boundary" });
    expect(objectPaint(box(), SWATCHES)).toEqual({ kind: "boundary" });
  });

  it("treats a dangling swatch reference as no paint, not as a crash", () => {
    const paint = objectPaint(
      box({ fill: { kind: "solid", color: { kind: "swatch", swatchId: "gone", tint: 1 } } }),
      SWATCHES,
    );
    expect(paint).toEqual({ kind: "boundary" });
  });

  it("gives every picture frame the placeholder, bound asset or not", () => {
    const unbound = objectPaint(box({ type: "picture", assetId: null }), SWATCHES);
    const bound = objectPaint(box({ type: "picture", assetId: "asset-hero" }), SWATCHES);
    expect(unbound.kind).toBe("placeholder");
    // There is no blob store yet, so a bound asset still has no bytes to draw.
    expect(bound.kind).toBe("placeholder");
  });

  it("keeps a picture frame's own stroke on the placeholder", () => {
    const paint = objectPaint(
      box({
        type: "picture",
        assetId: null,
        stroke: {
          color: { kind: "swatch", swatchId: "swatch-brand", tint: 1 },
          widthIn: 0.01,
          dash: "solid",
        },
      }),
      SWATCHES,
    );
    expect(paint).toEqual({
      kind: "placeholder",
      stroke: "rgb(255, 0, 0)",
      strokeWidthIn: 0.01,
    });
  });

  it("resolves a gradient to its first stop until ramps render", () => {
    const paint = objectPaint(
      box({
        fill: {
          kind: "gradient",
          type: "linear",
          angleDeg: 0,
          stops: [
            { at: 0, color: { kind: "swatch", swatchId: "swatch-brand", tint: 1 } },
            { at: 1, color: { kind: "literal", value: { space: "rgb", values: [0, 0, 1] } } },
          ],
        },
      }),
      SWATCHES,
    );
    expect(paint).toEqual({
      kind: "painted",
      fill: "rgb(255, 0, 0)",
      stroke: null,
      strokeWidthIn: null,
    });
  });
});
