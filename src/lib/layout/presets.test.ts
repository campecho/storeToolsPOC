import { describe, it, expect } from "vitest";
import { formatIn, getPreset, matchPreset, PAGE_PRESETS, sizeLabel } from "./presets";

describe("page-size presets", () => {
  it("carries the homepage tile sizes", () => {
    expect(getPreset("letter")).toMatchObject({ w: 8.5, h: 11 });
    expect(getPreset("legal")).toMatchObject({ w: 8.5, h: 14 });
    expect(getPreset("ledger")).toMatchObject({ w: 11, h: 17 });
  });

  it("matches dimensions in either orientation", () => {
    expect(matchPreset(8.5, 11)?.id).toBe("letter");
    expect(matchPreset(11, 8.5)?.id).toBe("letter");
    expect(matchPreset(17, 11)?.id).toBe("ledger");
  });

  it("returns undefined for a custom size", () => {
    expect(matchPreset(18, 25)).toBeUndefined();
  });

  it("labels sizes for captions — preset name or Custom", () => {
    expect(sizeLabel(8.5, 14)).toBe("Legal");
    expect(sizeLabel(14, 8.5)).toBe("Legal");
    expect(sizeLabel(18, 25)).toBe("Custom");
  });

  it("keeps preset dimensions portrait-stored", () => {
    for (const p of PAGE_PRESETS) {
      expect(p.h).toBeGreaterThanOrEqual(p.w);
    }
  });
});

describe("formatIn", () => {
  it("trims trailing zeros without losing print precision", () => {
    expect(formatIn(8.5)).toBe("8.5");
    expect(formatIn(11)).toBe("11");
    expect(formatIn(0.125)).toBe("0.125");
    expect(formatIn(0.0625)).toBe("0.0625");
    expect(formatIn(24)).toBe("24");
  });
});
