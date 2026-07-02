import { describe, it, expect } from "vitest";
import {
  DEFAULT_FAMILY,
  FONT_FAMILIES,
  fontStack,
  isOverflowing,
  matchTextStyle,
  ptToPx,
  TEXT_STYLES,
} from "./text";
import { createTextFrame } from "./objects";

describe("font families (§7.6 posture)", () => {
  it("Motiva Sans leads and falls back to system faces", () => {
    expect(FONT_FAMILIES[0].name).toBe(DEFAULT_FAMILY);
    expect(fontStack("Motiva Sans")).toContain("system-ui");
  });

  it("unknown families fall to the default stack", () => {
    expect(fontStack("Comic Sans MS")).toBe(fontStack(DEFAULT_FAMILY));
  });

  it("every curated family resolves a stack", () => {
    for (const f of FONT_FAMILIES) {
      expect(fontStack(f.name)).toBe(f.stack);
    }
  });
});

describe("ptToPx", () => {
  it("converts print points to CSS px at zoom", () => {
    expect(ptToPx(72, 1)).toBe(96);
    expect(ptToPx(11, 1)).toBeCloseTo(14.6667, 3);
    expect(ptToPx(24, 0.5)).toBe(16);
  });
});

describe("isOverflowing", () => {
  it("flags content taller than the frame, with a subpixel cushion", () => {
    expect(isOverflowing(100, 100)).toBe(false);
    expect(isOverflowing(100.9, 100)).toBe(false);
    expect(isOverflowing(102, 100)).toBe(true);
  });
});

describe("style bundles", () => {
  it("a fresh text frame matches Body · Normal", () => {
    const frame = createTextFrame(0, 0, 3, 1);
    expect(matchTextStyle(frame.text!)).toBe("body");
  });

  it("applying the Heading bundle matches back as heading", () => {
    const frame = createTextFrame(0, 0, 3, 1);
    const styled = {
      ...frame.text!,
      font: { ...frame.text!.font, ...TEXT_STYLES.heading.props },
      lineSpacing: TEXT_STYLES.heading.props.lineSpacing,
    };
    expect(matchTextStyle(styled)).toBe("heading");
  });

  it("off-bundle values match nothing (the picker face reads Custom)", () => {
    const frame = createTextFrame(0, 0, 3, 1);
    const custom = { ...frame.text!, lineSpacing: 1.5 };
    expect(matchTextStyle(custom)).toBeUndefined();
  });

  it("bundles leave the family alone", () => {
    expect("family" in TEXT_STYLES.body.props).toBe(false);
    expect("family" in TEXT_STYLES.heading.props).toBe(false);
  });
});
