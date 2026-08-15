import { DEFAULT_LAYER_ID } from "../../core/model/defaults";
import type { LayoutObject } from "../../core/model/objects";

/**
 * Deterministic stress fixture for the §6.2 spike gates: 300+ objects for
 * the 60fps drag/marquee criterion. Generated, not loaded — no assets, so
 * the fixture licensing rule (fixtures/README.md) is trivially satisfied.
 *
 * These are real schema v3 objects, so the probe measures the same render path
 * a document uses rather than a parallel one.
 *
 * The gate's "including 10+ placed images" clause is NOT probed yet: picture
 * frames arrive with the Images & photo group, and the perf probe reports
 * rects only until then.
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

/** Fill palette as literal sRGB triples, 0–1 per component. */
const FILLS: readonly (readonly [number, number, number])[] = [
  [0.294, 0.431, 0.663],
  [0.663, 0.294, 0.322],
  [0.294, 0.663, 0.431],
  [0.663, 0.592, 0.294],
  [0.431, 0.294, 0.663],
  [0.294, 0.604, 0.663],
];

export function buildStressFixture(count = 300, seed = 1): LayoutObject[] {
  const rand = mulberry32(seed);
  const objects: LayoutObject[] = [];
  for (let i = 0; i < count; i++) {
    const wIn = 0.2 + rand() * 1.8;
    const hIn = 0.2 + rand() * 1.8;
    const rgb = FILLS[Math.floor(rand() * FILLS.length)] ?? FILLS[0]!;
    objects.push({
      type: "rect",
      id: `stress-${i}`,
      layerId: DEFAULT_LAYER_ID,
      locked: false,
      opacity: 1,
      blend: "normal",
      effects: {},
      // Spread across the page and a one-inch pasteboard apron around it.
      xIn: -1 + rand() * (8.5 + 2 - wIn),
      yIn: -1 + rand() * (11 + 2 - hIn),
      wIn,
      hIn,
      rotationDeg: rand() < 0.3 ? Math.round(rand() * 360) : 0,
      fill: { kind: "solid", color: { kind: "literal", value: { space: "rgb", values: [...rgb] } } },
      stroke: null,
      wrap: { mode: "none", distance: { lIn: 0, rIn: 0, tIn: 0, bIn: 0 } },
    });
  }
  return objects;
}
