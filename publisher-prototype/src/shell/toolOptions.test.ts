import { describe, expect, it } from "vitest";
import { toolRegistry } from "../core/registry";
import { defaultToolOptions, drawStyleFromOptions, isColorValue, optionColor } from "./toolOptions";

/**
 * Tool option colours (SEAMS.md "Tool option colours"): a colour option's
 * value is a ColorValue end to end — from the contract default, through the
 * typed read, into the paint a draw gesture consumes.
 */

describe("defaultToolOptions", () => {
  it("seeds every colour option with a ColorValue, in the space the contract authored", () => {
    const values = defaultToolOptions();
    for (const tool of toolRegistry) {
      for (const option of tool.options) {
        if (option.kind !== "color") continue;
        expect(isColorValue(values[tool.id]?.[option.id])).toBe(true);
        expect(values[tool.id]?.[option.id]).toEqual(option.default);
      }
    }
  });
});

describe("optionColor", () => {
  it("returns the ColorValue, and null for a missing tool, a missing option, or a wrong-kinded entry", () => {
    const values = defaultToolOptions();
    expect(optionColor(values, "rect", "fill")).toEqual({ space: "cmyk", values: [0.8, 0.5, 0, 0.05] });
    expect(optionColor(values, "no-such-tool", "fill")).toBeNull();
    expect(optionColor(values, "rect", "no-such-option")).toBeNull();
    expect(optionColor({ rect: { fill: "#4472c4", stroke: 3 } }, "rect", "fill")).toBeNull();
    expect(optionColor({ rect: { fill: "#4472c4", stroke: 3 } }, "rect", "stroke")).toBeNull();
  });
});

describe("drawStyleFromOptions", () => {
  it("hands a rect draw the contract's CMYK fill and stroke as literal paints", () => {
    const style = drawStyleFromOptions(defaultToolOptions(), "rect");
    expect(style.fill).toEqual({ kind: "color", color: { space: "cmyk", values: [0.8, 0.5, 0, 0.05] } });
    expect(style.stroke).toEqual({
      paint: { kind: "color", color: { space: "cmyk", values: [0, 0, 0, 1] } },
      width: 0.75,
    });
  });

  it("a tool without a fill option draws with fill null", () => {
    const style = drawStyleFromOptions(defaultToolOptions(), "line");
    expect(style.fill).toBeNull();
    expect(style.stroke?.paint).toEqual({ kind: "color", color: { space: "cmyk", values: [0, 0, 0, 1] } });
  });
});
