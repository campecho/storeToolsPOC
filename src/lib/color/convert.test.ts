import { describe, expect, it } from "vitest";
import {
  cmykPercent,
  colorEquals,
  colorFromHex,
  formatHex,
  hsvToRgb,
  naiveCmykToRgb,
  naiveRgbToCmyk,
  parseHex,
  rgb255,
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
    expect(formatHex(parseHex("#086DD2")!)).toBe("#086dd2");
    expect(formatHex([1, 1, 1])).toBe("#ffffff");
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
    expect(rgb255(204, 0, 0)).toEqual({ space: "rgb", values: [0.8, 0, 0] });
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

  it("black is K-only, never rich black", () => {
    expect(naiveRgbToCmyk([0, 0, 0])).toEqual([0, 0, 0, 1]);
  });

  it("neutral grey carries no ink but K", () => {
    const [c, m, y, k] = naiveRgbToCmyk([0.5, 0.5, 0.5]);
    expect([c, m, y]).toEqual([0, 0, 0]);
    expect(k).toBeCloseTo(0.5, 6);
  });
});

describe("hsv", () => {
  it("round-trips primaries and a mid tone", () => {
    for (const rgb of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.8, 0, 0],
      [0.2, 0.5, 0.7],
    ] as const) {
      const back = hsvToRgb(rgbToHsv(rgb));
      back.forEach((v, i) => expect(v).toBeCloseTo(rgb[i], 6));
    }
  });

  it("grey has zero saturation and hue 0", () => {
    expect(rgbToHsv([0.4, 0.4, 0.4])).toEqual({ h: 0, s: 0, v: 0.4 });
  });

  it("wraps hue", () => {
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual([1, 0, 0]);
    expect(hsvToRgb({ h: -120, s: 1, v: 1 })).toEqual([0, 0, 1]);
  });
});

describe("colorEquals", () => {
  it("compares within display precision and across spaces", () => {
    expect(colorEquals(rgb255(204, 0, 0), { space: "rgb", values: [0.8, 0.001, 0] })).toBe(true);
    expect(colorEquals(rgb255(204, 0, 0), rgb255(205, 0, 0))).toBe(false);
    expect(colorEquals(rgb255(0, 0, 0), cmykPercent(0, 0, 0, 100))).toBe(false);
  });
});
