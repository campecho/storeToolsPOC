import type { LayoutDocument } from "@/schema";

/**
 * Canvas geometry (plan §3.5): canonical inches everywhere, one scale factor —
 * `px = inches × 96 × zoom`. Fit, zoom stepping, column guides, and ruler
 * ticks live here so they're unit-testable away from the DOM.
 */

export const DPI = 96;
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
  /** Inch number, present on labeled majors only. */
  label?: string;
}

/**
 * Ruler scale (plan §3.5): ticks every 1/8 in, heavier every 1 in, numbered
 * when spacing permits; the origin is the page's top-left corner. `originPx`
 * is that corner's position along the ruler; ticks cover [0, lengthPx].
 * Sub-divisions coarsen as zoom drops so ticks stay ≥ ~5px apart.
 */
export function rulerTicks(originPx: number, lengthPx: number, zoom: number): RulerTick[] {
  if (lengthPx <= 0) return [];
  const inchPx = DPI * zoom;
  const sub = inchPx / 8 >= 5 ? 8 : inchPx / 4 >= 5 ? 4 : inchPx / 2 >= 5 ? 2 : 1;
  const step = inchPx / sub;
  const labelEvery = inchPx >= 28 ? 1 : inchPx >= 14 ? 2 : 5;

  const ticks: RulerTick[] = [];
  const first = Math.ceil((0 - originPx) / step - 1e-9);
  const last = Math.floor((lengthPx - originPx) / step + 1e-9);
  for (let k = first; k <= last; k++) {
    const px = originPx + k * step;
    if (k % sub === 0) {
      const inches = k / sub;
      const labeled = inches % labelEvery === 0;
      // Numbers mirror on both sides of the origin, Publisher-style.
      ticks.push({ px, level: "major", ...(labeled ? { label: String(Math.abs(inches)) } : {}) });
    } else if (sub >= 2 && k % (sub / 2) === 0) {
      ticks.push({ px, level: "mid" });
    } else {
      ticks.push({ px, level: "minor" });
    }
  }
  return ticks;
}
