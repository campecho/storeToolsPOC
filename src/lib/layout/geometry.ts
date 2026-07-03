import type { LayoutDocument } from "@/schema";
import { UNIT_PER_IN, type Unit } from "./units";

/**
 * Canvas geometry (plan §3.5): canonical inches everywhere, one scale factor —
 * `px = inches × 96 × zoom`. Fit, zoom stepping, column guides, and ruler
 * ticks live here so they're unit-testable away from the DOM.
 */

export const DPI = 96;
// ASSUMPTION: 10%–400% zoom and the 1–240 in page bounds below are guesses at
// useful working ranges — confirm against real large-format jobs.
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
/** Fit leaves ~15% pasteboard breathing room around the page + bleed box. */
export const FIT_FRACTION = 0.85;
/** The − / + buttons and the Zoom tool step through these. */
export const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
/** Fixed column gutter for the POC (Publisher's default); editable later. */
export const COLUMN_GUTTER_IN = 0.2;
/** Custom-size bounds — the ceiling is deliberately large-format friendly. */
export const MIN_PAGE_IN = 1;
export const MAX_PAGE_IN = 240;

export function inToPx(inches: number, zoom: number): number {
  return inches * DPI * zoom;
}

export function pxToIn(px: number, zoom: number): number {
  return px / (DPI * zoom);
}

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function clampPageDim(v: number): number {
  return Math.min(MAX_PAGE_IN, Math.max(MIN_PAGE_IN, v));
}

/**
 * Zoom that fits the page + bleed box into the viewport at ~85%, snapped to
 * whole percents. An unmeasured viewport falls back to 100%.
 */
export function fitZoom(pageW: number, pageH: number, bleed: number, vpW: number, vpH: number): number {
  if (vpW <= 0 || vpH <= 0) return 1;
  const boxW = (pageW + 2 * bleed) * DPI;
  const boxH = (pageH + 2 * bleed) * DPI;
  const fit = FIT_FRACTION * Math.min(vpW / boxW, vpH / boxH);
  return clampZoom(Math.round(fit * 100) / 100);
}

export function zoomInStep(z: number): number {
  return ZOOM_STEPS.find((s) => s > z + 1e-9) ?? ZOOM_MAX;
}

export function zoomOutStep(z: number): number {
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 1e-9) ?? ZOOM_MIN;
}

/**
 * Interior column gutters as [left, right] x-positions in inches from the
 * page's left edge. Empty for a single column or when the columns don't fit.
 */
export function columnGuides(
  doc: Pick<LayoutDocument, "size" | "margin" | "columns">,
): [number, number][] {
  const { columns, margin } = doc;
  if (columns < 2) return [];
  const content = doc.size.w - 2 * margin;
  const colW = (content - (columns - 1) * COLUMN_GUTTER_IN) / columns;
  if (colW <= 0) return [];
  const gutters: [number, number][] = [];
  for (let i = 1; i < columns; i++) {
    const left = margin + i * colW + (i - 1) * COLUMN_GUTTER_IN;
    gutters.push([left, left + COLUMN_GUTTER_IN]);
  }
  return gutters;
}

export interface RulerTick {
  /** Position along the ruler in px. */
  px: number;
  level: "major" | "mid" | "minor";
  /** Value in the active unit, present on labeled majors only. */
  label?: string;
}

/** Minor ticks stay ≥ this many px apart; a major must be ≥ the label width. */
const MIN_MINOR_PX = 6;
const MIN_LABEL_PX = 40;

/**
 * "Nice" tick increments per unit, coarse→fine — the ruler picks the finest
 * that keeps minor ticks readable, then a coarser multiple to label. Values
 * are in the display unit (inches include the customary 1/8 subdivisions).
 */
const TICK_LADDER: Record<Unit, number[]> = {
  in: [10, 5, 2, 1, 0.5, 0.25, 0.125],
  mm: [100, 50, 20, 10, 5, 2, 1],
  px: [1000, 500, 200, 100, 50, 20, 10],
  pt: [720, 360, 144, 72, 36, 12, 6],
};

/**
 * Ruler scale (plan §3.5, unit-aware since L11): ticks at a nice increment in
 * the active unit, numbered on a coarser multiple, mirrored either side of the
 * page's top-left origin. `originPx` is that corner's position along the
 * ruler; ticks cover [0, lengthPx]. Increments coarsen as zoom drops so ticks
 * stay ≥ ~6px apart.
 */
export function rulerTicks(
  originPx: number,
  lengthPx: number,
  zoom: number,
  unit: Unit = "in",
): RulerTick[] {
  if (lengthPx <= 0) return [];
  const unitPx = (DPI * zoom) / UNIT_PER_IN[unit]; // px per 1 display unit
  const asc = [...TICK_LADDER[unit]].reverse(); // fine → coarse
  const isMultiple = (a: number, b: number) => Math.abs(a / b - Math.round(a / b)) < 1e-9;

  // finest increment whose ticks are still ≥ MIN_MINOR_PX apart
  const minor = asc.find((s) => s * unitPx >= MIN_MINOR_PX) ?? asc[asc.length - 1];
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
