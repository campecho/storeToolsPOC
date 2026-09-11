import { describe, expect, it } from "vitest";
import {
  cmykPercent,
  colorFromHex,
  formatHex,
  hsvToRgb,
  naiveCmykToRgb,
  naiveRgbToCmyk,
  parseHex,
  rgbToHsv,
  toPercent,
  to255,
} from "./convert";

describe("hex", () => {
  it("parses six digits with or without # in any case", () => {
    expect(parseHex("#CC0000")).toEqual([0.8, 0, 0]);
    expect(parseHex("cc0000")).toEqual([0.8, 0, 0]);
    expect(parseHex("  #Cc0000 ")).toEqual([0.8, 0, 0]);
  });

  it("rejects shorthand, alpha, and junk", () => {
    expect(parseHex("#abc")).toBeNull();
    expect(parseHex("#aabbccdd")).toBeNull();
    expect(parseHex("red")).toBeNull();
    expect(parseHex("")).toBeNull();
  });

  it("formats lowercase and round-trips", () => {
    expect(formatHex([0.8, 0, 0])).toBe("#cc0000");
    const parsed = parseHex("#086DD2");
    expect(parsed).not.toBeNull();
    if (parsed) expect(formatHex(parsed)).toBe("#086dd2");
  });

  it("colorFromHex is total — malformed input is black", () => {
    expect(colorFromHex("#CC0000")).toEqual({ space: "rgb", values: [0.8, 0, 0] });
    expect(colorFromHex("transparent")).toEqual({ space: "rgb", values: [0, 0, 0] });
  });
});

describe("scaling", () => {
  it("rounds to the display unit and clamps", () => {
    expect(to255(0.8)).toBe(204);
    expect(to255(1.5)).toBe(255);
    expect(toPercent(0.2)).toBe(20);
    expect(toPercent(-1)).toBe(0);
    expect(cmykPercent(0, 100, 100, 20)).toEqual({ space: "cmyk", values: [0, 1, 1, 0.2] });
  });
});

describe("naive conversion (oracle only)", () => {
  it("maps the extremes", () => {
    expect(naiveRgbToCmyk([1, 1, 1])).toEqual([0, 0, 0, 0]);
    expect(naiveRgbToCmyk([0, 0, 0])).toEqual([0, 0, 0, 1]);
    expect(naiveCmykToRgb([0, 0, 0, 0])).toEqual([1, 1, 1]);
    expect(naiveCmykToRgb([0, 0, 0, 1])).toEqual([0, 0, 0]);
  });

  it("brand red is 0/100/100/20 and round-trips", () => {
    const cmyk = naiveRgbToCmyk([0.8, 0, 0]);
    expect(cmyk.map(toPercent)).toEqual([0, 100, 100, 20]);
    expect(naiveCmykToRgb(cmyk).map(to255)).toEqual([204, 0, 0]);
  });

  it("neutral grey carries no ink but K", () => {
    const [c, m, y, k] = naiveRgbToCmyk([0.5, 0.5, 0.5]);
    expect([c, m, y]).toEqual([0, 0, 0]);
    expect(k).toBeCloseTo(0.5, 6);
  });
});

describe("hsv", () => {
  it("round-trips primaries and a mid tone", () => {
    const cases: readonly (readonly [number, number, number])[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.8, 0, 0],
      [0.2, 0.5, 0.7],
    ];
    for (const rgb of cases) {
      const back = hsvToRgb(rgbToHsv(rgb));
      back.forEach((v, i) => expect(v).toBeCloseTo(rgb[i] ?? -1, 6));
    }
  });

  it("grey has zero saturation and hue 0; hue wraps", () => {
    expect(rgbToHsv([0.4, 0.4, 0.4])).toEqual({ h: 0, s: 0, v: 0.4 });
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual([1, 0, 0]);
    expect(hsvToRgb({ h: -120, s: 1, v: 1 })).toEqual([0, 0, 1]);
  });
});

