import { describe, expect, it } from "vitest";
import { rulerTicks } from "./rulers";

/**
 * Ruler tick invariants: increments come off the nice-inch ladder and
 * coarsen as zoom drops (minors stay ≥ 6px apart, labeled majors ≥ 40px),
 * ticks cover [0, lengthPx], and labels mirror across the page origin.
 */

describe("rulerTicks", () => {
  it("returns no ticks for a non-positive length", () => {
    expect(rulerTicks(0, 0, 1)).toEqual([]);
    expect(rulerTicks(50, -10, 1)).toEqual([]);
  });

  it("uses 1/8-inch minors (12px) numbered every 1/2 inch (48px) at zoom 1", () => {
    const ticks = rulerTicks(0, 96, 1);
    expect(ticks.length).toBe(9);
    expect(ticks[0]).toEqual({ px: 0, level: "major", label: "0" });
    expect(ticks[1]).toEqual({ px: 12, level: "minor" });
    expect(ticks[2]).toEqual({ px: 24, level: "mid" });
    expect(ticks[4]).toEqual({ px: 48, level: "major", label: "0.5" });
    expect(ticks[8]).toEqual({ px: 96, level: "major", label: "1" });
  });

  it("mirrors labels across the origin", () => {
    const ticks = rulerTicks(96, 192, 1);
    const minusOneInch = ticks.find((t) => t.px === 0);
    const plusOneInch = ticks.find((t) => t.px === 192);
    expect(minusOneInch?.level).toBe("major");
    expect(minusOneInch?.label).toBe("1");
    expect(plusOneInch?.level).toBe("major");
    expect(plusOneInch?.label).toBe("1");
  });

  it("keeps every tick within [0, lengthPx] give or take one step, with non-negative major labels", () => {
    const configs = [
      { originPx: 37, lengthPx: 500, zoom: 1 },
      { originPx: -150, lengthPx: 640, zoom: 0.37 },
      { originPx: 96, lengthPx: 250, zoom: 2.5 },
      { originPx: 480, lengthPx: 300, zoom: 0.1 },
    ];
    for (const { originPx, lengthPx, zoom } of configs) {
      const ticks = rulerTicks(originPx, lengthPx, zoom);
      expect(ticks.length).toBeGreaterThan(1);
      const first = ticks[0];
      const second = ticks[1];
      const stepPx = first !== undefined && second !== undefined ? second.px - first.px : Number.NaN;
      for (const tick of ticks) {
        expect(tick.px).toBeGreaterThanOrEqual(0 - stepPx - 1e-9);
        expect(tick.px).toBeLessThanOrEqual(lengthPx + stepPx + 1e-9);
      }
      for (const major of ticks.filter((t) => t.level === "major")) {
        expect(major.label).toBeDefined();
        expect(Number(major.label)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("coarsens to 1-inch minors numbered every 5 inches at zoom 0.1, never closer than 6px", () => {
    const ticks = rulerTicks(0, 480, 0.1);
    const pxs = ticks.map((t) => t.px);
    for (let i = 1; i < pxs.length; i++) {
      expect((pxs[i] ?? Number.NaN) - (pxs[i - 1] ?? Number.NaN)).toBeGreaterThanOrEqual(6);
    }
    expect(Math.abs((pxs[1] ?? Number.NaN) - 9.6)).toBeLessThan(1e-9);
    const fiveInches = ticks.find((t) => Math.abs(t.px - 48) < 1e-6);
    expect(fiveInches?.level).toBe("major");
    expect(fiveInches?.label).toBe("5");
  });
});
