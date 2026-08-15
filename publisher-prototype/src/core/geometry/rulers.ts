import { DPI } from "./viewport";

/**
 * Ruler tick math — pure and DOM-free so the shell's DOM rulers stay thin
 * (PLAN.md §6.2: rulers are DOM, zoom/pan-aware off shared viewport state).
 *
 * Seeded from the POC's unit-aware ruler scale (storeToolsPOC
 * src/lib/layout/geometry.ts `rulerTicks`), reduced to inches: display units
 * are presentation state this model doesn't carry yet; the POC remains the
 * working reference for the multi-unit ladder.
 */

export interface RulerTick {
  /** Position along the ruler in px. */
  px: number;
  level: "major" | "mid" | "minor";
  /** Value in inches, present on labeled majors only. */
  label?: string;
}

/** Minor ticks stay ≥ this many px apart; a major must be ≥ the label width. */
const MIN_MINOR_PX = 6;
const MIN_LABEL_PX = 40;

/** "Nice" inch increments, coarse→fine, with the customary 1/8 subdivisions. */
const TICK_LADDER_IN = [10, 5, 2, 1, 0.5, 0.25, 0.125];

/**
 * Ticks at a nice inch increment, numbered on a coarser multiple, mirrored
 * either side of the page's top-left origin. `originPx` is that corner's
 * position along the ruler; ticks cover [0, lengthPx]. Increments coarsen as
 * zoom drops so ticks stay ≥ ~6px apart.
 */
export function rulerTicks(originPx: number, lengthPx: number, zoom: number): RulerTick[] {
  if (lengthPx <= 0) return [];
  const unitPx = DPI * zoom; // px per inch
  const asc = [...TICK_LADDER_IN].reverse(); // fine → coarse
  const isMultiple = (a: number, b: number) => Math.abs(a / b - Math.round(a / b)) < 1e-9;

  // finest increment whose ticks are still ≥ MIN_MINOR_PX apart
  const minor = asc.find((s) => s * unitPx >= MIN_MINOR_PX) ?? asc[asc.length - 1] ?? 1;
  // smallest increment wide enough to carry a number, kept a whole multiple of minor
  const major =
    asc.find((s) => s >= minor && isMultiple(s, minor) && s * unitPx >= MIN_LABEL_PX) ?? minor;
  const ratio = Math.max(1, Math.round(major / minor));
  const stepPx = minor * unitPx;

  const ticks: RulerTick[] = [];
  const first = Math.ceil((0 - originPx) / stepPx - 1e-9);
  const last = Math.floor((lengthPx - originPx) / stepPx + 1e-9);
  for (let k = first; k <= last; k++) {
    const px = originPx + k * stepPx;
    if (((k % ratio) + ratio) % ratio === 0) {
      // numbers mirror on both sides of the origin, Publisher-style
      const value = Math.abs(k * minor);
      ticks.push({ px, level: "major", label: Number(value.toFixed(4)).toString() });
    } else if (ratio % 2 === 0 && ((k % (ratio / 2)) + ratio) % (ratio / 2) === 0) {
      ticks.push({ px, level: "mid" });
    } else {
      ticks.push({ px, level: "minor" });
    }
  }
  return ticks;
}
