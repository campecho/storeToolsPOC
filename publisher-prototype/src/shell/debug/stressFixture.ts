import type { LayoutObject } from "../../core/model";

/**
 * Deterministic stress fixture for the §6.2 spike gates: 300+ objects for
 * the 60fps drag/marquee criterion. Generated, not loaded — no assets, so
 * the fixture licensing rule (fixtures/README.md) is trivially satisfied.
 * Emits schema-v3 shape objects, a rect/ellipse mix now that ellipses
 * render.
 *
 * The gate's "including 10+ placed images" clause is NOT probed yet: picture
 * frames arrive with the Images & photo group, and the perf probe reports
 * shapes only until then.
 */

/** mulberry32 — tiny seeded PRNG; same seed, same fixture, every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Literal rgb fills, channels 0–1 (the color model's convention). */
const FILLS: readonly (readonly [number, number, number])[] = [
  [0.29, 0.43, 0.66],
  [0.66, 0.29, 0.32],
  [0.29, 0.66, 0.43],
  [0.66, 0.59, 0.29],
  [0.43, 0.29, 0.66],
  [0.29, 0.6, 0.66],
];

export function buildStressFixture(count = 300, seed = 1): LayoutObject[] {
  const rand = mulberry32(seed);
  const objects: LayoutObject[] = [];
  for (let i = 0; i < count; i++) {
    const w = 0.2 + rand() * 1.8;
    const h = 0.2 + rand() * 1.8;
    const fill = FILLS[Math.floor(rand() * FILLS.length)] ?? [0.29, 0.43, 0.66];
    objects.push({
      type: "shape",
      shape: rand() < 0.5 ? "rect" : "ellipse",
      id: `stress-${i}`,
      // Spread across the page and a one-inch pasteboard apron around it.
      x: -1 + rand() * (8.5 + 2 - w),
      y: -1 + rand() * (11 + 2 - h),
      w,
      h,
      rotation: rand() < 0.3 ? Math.round(rand() * 360) : 0,
      locked: false,
      fill: { kind: "color", color: { space: "rgb", values: [fill[0], fill[1], fill[2]] } },
      stroke: null,
    });
  }
  return objects;
}
