import { describe, expect, it } from "vitest";
import { flattenFillColor } from "./gradient";
import { parsePropList } from "./trace-parser";

/**
 * Gradient flattening (gradient.ts) — the fill color a gradient degrades to.
 * The first fixture is the verbatim setStyle pub2raw 0.1.4 printed for the
 * New_Rack_Card corpus file's full-page background, the file that exposed
 * the null-fill bug (colors live on the stop vector, not draw:fill-color).
 */
describe("flattenFillColor", () => {
  it("flattens the rack-card background gradient to the midpoint of its two stops", () => {
    const props = parsePropList(
      "draw:angle: 0.0000in, draw:fill: gradient, draw:stroke: none, libmspub:shade: normal, " +
        "svg:fill-rule: nonzero, svg:linearGradient: ((svg:offset: 0.0000%, svg:stop-color: #3b618e, " +
        "svg:stop-opacity: 100.0000%), (svg:offset: 100.0000%, svg:stop-color: #7f7f7f, svg:stop-opacity: 100.0000%))",
    );
    // per-channel midpoint of #3b618e and #7f7f7f
    expect(flattenFillColor(props)).toBe("#5d7087");
  });

  it("weights a mid stop by the span it covers (trapezoid, not plain mean)", () => {
    const props = parsePropList(
      "svg:linearGradient: ((svg:offset: 0.0000%, svg:stop-color: #000000), " +
        "(svg:offset: 90.0000%, svg:stop-color: #000000), (svg:offset: 100.0000%, svg:stop-color: #ffffff))",
    );
    // 90% black + a 10% black→white ramp = 0.05 white overall → #0d0d0d
    expect(flattenFillColor(props)).toBe("#0d0d0d");
  });

  it("handles a single stop and stops sharing one offset", () => {
    expect(flattenFillColor(parsePropList("svg:linearGradient: ((svg:offset: 0.0000%, svg:stop-color: #123456))"))).toBe(
      "#123456",
    );
    expect(
      flattenFillColor(
        parsePropList(
          "svg:linearGradient: ((svg:offset: 50.0000%, svg:stop-color: #000000), (svg:offset: 50.0000%, svg:stop-color: #808080))",
        ),
      ),
    ).toBe("#404040");
  });

  it("falls back to the draw:start-color/draw:end-color pair", () => {
    expect(flattenFillColor(parsePropList("draw:start-color: #000000, draw:end-color: #ffffff"))).toBe("#808080");
    expect(flattenFillColor(parsePropList("draw:start-color: #336699"))).toBe("#336699");
  });

  it("returns null when the props carry no usable color", () => {
    expect(flattenFillColor(parsePropList("draw:fill: pattern"))).toBeNull();
    expect(flattenFillColor(parsePropList("svg:linearGradient: ((svg:offset: 0.0000%))"))).toBeNull();
  });
});
