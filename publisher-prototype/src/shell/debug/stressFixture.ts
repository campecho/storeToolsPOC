import type { PlaceholderObject } from "../../core/store";

/**
 * Deterministic stress fixture for the §6.2 spike gates: 300+ objects for
 * the 60fps drag/marquee criterion. Generated, not loaded — no assets, so
 * the fixture licensing rule (fixtures/README.md) is trivially satisfied.
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

const FILLS = ["#4b6ea9", "#a94b52", "#4ba96e", "#a9974b", "#6e4ba9", "#4b9aa9"];

export function buildStressFixture(count = 300, seed = 1): PlaceholderObject[] {
  const rand = mulberry32(seed);
  const objects: PlaceholderObject[] = [];
  for (let i = 0; i < count; i++) {
    const wIn = 0.2 + rand() * 1.8;
    const hIn = 0.2 + rand() * 1.8;
    objects.push({
      id: `stress-${i}`,
      // Spread across the page and a one-inch pasteboard apron around it.
      xIn: -1 + rand() * (8.5 + 2 - wIn),
      yIn: -1 + rand() * (11 + 2 - hIn),
      wIn,
      hIn,
      rotationDeg: rand() < 0.3 ? Math.round(rand() * 360) : 0,
      fill: FILLS[Math.floor(rand() * FILLS.length)] ?? "#4b6ea9",
    });
  }
  return objects;
}
