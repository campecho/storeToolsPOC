import { describe, expect, it } from "vitest";
import { DPI } from "../../core/geometry/viewport";
import { pageShadow } from "./pageShadow";

/**
 * The one thing worth pinning: the shadow reads the same on screen at every
 * zoom, because Konva scales blur and offset by the stage scale and these
 * values pre-divide by it. Forgetting that division is the failure mode —
 * a shadow that balloons at 400% and vanishes at 10%.
 */

/** Konva multiplies the shape's shadow props by its absolute scale. */
function asDrawn(scale: number) {
  const s = pageShadow(scale);
  return { blur: s.shadowBlur * scale, offsetX: s.shadowOffsetX * scale, offsetY: s.shadowOffsetY * scale };
}

describe("pageShadow", () => {
  it("draws the POC's 0 3px 16px shadow at 100%", () => {
    expect(asDrawn(DPI)).toEqual({ blur: 16, offsetX: 0, offsetY: 3 });
  });

  it("keeps those screen px across the zoom range", () => {
    for (const zoom of [0.1, 0.5, 1, 2.5, 4]) {
      const drawn = asDrawn(DPI * zoom);
      expect(drawn.blur).toBeCloseTo(16, 10);
      expect(drawn.offsetY).toBeCloseTo(3, 10);
      expect(drawn.offsetX).toBe(0);
    }
  });

  it("carries the POC's shadow color", () => {
    expect(pageShadow(DPI).shadowColor).toBe("rgba(0, 0, 0, 0.22)");
  });
});
