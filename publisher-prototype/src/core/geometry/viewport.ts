/**
 * Viewport geometry — canonical inches, zoom-independent (PLAN.md §6.2):
 * one scale factor, `px = inches × 96 × zoom`, with zoom as the stage scale
 * and pan as the stage position, so every geometry calculation is
 * render-agnostic pure math.
 *
 * Seeded from the POC's pure canvas math (storeToolsPOC
 * src/lib/layout/geometry.ts) and owned here; the pan convention — a px
 * offset of the page center from the viewport center — carries over so the
 * POC remains a working reference for the same numbers.
 */

// ASSUMPTION: source pixels map to inches at 96 DPI (the CSS default); no
// print-DPI metadata is consulted. Carried from the POC — confirm with SMEs.
export const DPI = 96;

// ASSUMPTION: 10%–400% zoom is a guess at a useful working range — carried
// from the POC; confirm against real large-format jobs.
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;

/** Fit leaves ~15% pasteboard breathing room around the page + bleed box. */
export const FIT_FRACTION = 0.85;

/** The − / + controls and the Zoom tool step through these stops. */
export const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/** Ctrl/Cmd + wheel multiplies zoom by this per notch (§ zoom contract). */
export const WHEEL_ZOOM_FACTOR = 1.1;

/** A point or extent in canonical document inches. */
export type DocPoint = { x: number; y: number };

/** A point or extent in viewport (screen) px, origin at the viewport's top-left. */
export type ScreenPoint = { x: number; y: number };

export type Size = { w: number; h: number };

/**
 * The viewport: zoom is a scalar multiplier (1 = 100%); pan is a px offset
 * of the page center from the viewport center, so `pan: {0,0}` centers the
 * page at any zoom.
 */
export type Viewport = { zoom: number; pan: ScreenPoint };

export function inToPx(inches: number, zoom: number): number {
  return inches * DPI * zoom;
}

export function pxToIn(px: number, zoom: number): number {
  return px / (DPI * zoom);
}

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
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
 * The page's top-left corner in viewport px — the single origin the stage
 * transform, the SVG overlay viewBox, and the rulers all derive from.
 */
export function pageOriginPx(vp: Viewport, vpSize: Size, pageSize: Size): ScreenPoint {
  return {
    x: vpSize.w / 2 + vp.pan.x - inToPx(pageSize.w, vp.zoom) / 2,
    y: vpSize.h / 2 + vp.pan.y - inToPx(pageSize.h, vp.zoom) / 2,
  };
}

/** Viewport px → document inches (page top-left is the document origin). */
export function screenToDoc(pt: ScreenPoint, vp: Viewport, vpSize: Size, pageSize: Size): DocPoint {
  const origin = pageOriginPx(vp, vpSize, pageSize);
  return { x: pxToIn(pt.x - origin.x, vp.zoom), y: pxToIn(pt.y - origin.y, vp.zoom) };
}

/** Document inches → viewport px. */
export function docToScreen(pt: DocPoint, vp: Viewport, vpSize: Size, pageSize: Size): ScreenPoint {
  const origin = pageOriginPx(vp, vpSize, pageSize);
  return { x: origin.x + inToPx(pt.x, vp.zoom), y: origin.y + inToPx(pt.y, vp.zoom) };
}

/**
 * The viewport that puts `nextZoom` in effect while keeping the document
 * point currently under `anchor` fixed at `anchor` — the invariant behind
 * every zoom gesture (wheel and step alike).
 */
export function zoomAtPoint(
  vp: Viewport,
  vpSize: Size,
  pageSize: Size,
  anchor: ScreenPoint,
  nextZoom: number,
): Viewport {
  const zoom = clampZoom(nextZoom);
  const docPt = screenToDoc(anchor, vp, vpSize, pageSize);
  return {
    zoom,
    pan: {
      x: anchor.x - vpSize.w / 2 + inToPx(pageSize.w / 2 - docPt.x, zoom),
      y: anchor.y - vpSize.h / 2 + inToPx(pageSize.h / 2 - docPt.y, zoom),
    },
  };
}

/**
 * The document-inch rectangle the viewport currently shows — the SVG
 * overlay's viewBox, which is how the overlay shares the stage transform.
 */
export function visibleDocRect(
  vp: Viewport,
  vpSize: Size,
  pageSize: Size,
): { x: number; y: number; w: number; h: number } {
  const topLeft = screenToDoc({ x: 0, y: 0 }, vp, vpSize, pageSize);
  return {
    x: topLeft.x,
    y: topLeft.y,
    w: pxToIn(vpSize.w, vp.zoom),
    h: pxToIn(vpSize.h, vp.zoom),
  };
}
