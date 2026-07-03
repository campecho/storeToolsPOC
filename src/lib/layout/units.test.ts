import { describe, expect, it } from "vitest";
import { formatLen, isUnit, parseLen } from "./units";

describe("units (plan L11)", () => {
  it("converts inches to each display unit", () => {
    expect(formatLen(1, "in")).toBe("1");
    expect(formatLen(1, "mm")).toBe("25.4");
    expect(formatLen(1, "px")).toBe("96");
    expect(formatLen(1, "pt")).toBe("72");
    expect(formatLen(8.5, "in")).toBe("8.5");
  });

  it("trims trailing zeros per unit precision", () => {
    expect(formatLen(0.5, "mm")).toBe("12.7");
    expect(formatLen(2, "px")).toBe("192");
    expect(formatLen(0.125, "in")).toBe("0.125");
  });

  it("parses a display value back to inches (round-trips)", () => {
    for (const unit of ["in", "mm", "px", "pt"] as const) {
      const shown = formatLen(3.25, unit);
      expect(parseLen(shown, unit)).toBeCloseTo(3.25, 4);
    }
  });

  it("parseLen is the inverse of UNIT_PER_IN", () => {
    expect(parseLen("254", "mm")).toBeCloseTo(10, 6);
    expect(parseLen("144", "pt")).toBeCloseTo(2, 6);
  });

  it("isUnit guards the persisted value", () => {
    expect(isUnit("mm")).toBe(true);
    expect(isUnit("pro")).toBe(false);
    expect(isUnit(undefined)).toBe(false);
  });
});
