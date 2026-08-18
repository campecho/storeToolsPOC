import { resizeHandleAxis, type ResizeHandle } from "../../core/gestures";

/**
 * CSS cursors for the selection chrome's handles. The direction math is
 * core's (`resizeHandleAxis`); this module owns only the CSS vocabulary it
 * names — the shell's side of that seam.
 *
 * Resize handles map straight onto the platform's four two-headed arrows.
 * Rotation has no such keyword, so the knob carries a drawn glyph: a curved
 * two-headed arc, inlined as a data URI (NEW PATTERN — the alternative was
 * borrowing `grab`, which already means panning in this app, or `alias`,
 * which means "make a shortcut"). The glyph turns with the frame the same
 * way the resize cursors do, and both snap to the eighth turn — eight
 * orientations the browser can cache, past which nothing is legible at 24px
 * anyway.
 */

const ROTATE_HOTSPOT = 12;

/** An eighth-turn-snapped rotation in [0, 360). */
function snapEighth(rotation: number): number {
  return (((Math.round(rotation / 45) * 45) % 360) + 360) % 360;
}

export function resizeCursor(handle: ResizeHandle, rotation: number): string {
  return `${resizeHandleAxis(handle, rotation)}-resize`;
}

/**
 * The rotation knob's glyph: a half-circle arc over the top of the frame with
 * an arrowhead falling away from each end. Drawn twice — a fat white pass
 * first, so it stays visible against both the page and the dark canvas
 * around it.
 */
export function rotateCursor(rotation: number): string {
  const arc = "M5 12a7 7 0 0 1 14 0";
  const leftHead = "M5 17 2 11h6z";
  const rightHead = "M19 17 16 11h6z";
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
    `<g transform='rotate(${snapEighth(rotation)} 12 12)' stroke-linejoin='round'>` +
    `<g fill='none' stroke='#fff' stroke-width='5'>` +
    `<path d='${arc}'/><path d='${leftHead}'/><path d='${rightHead}'/>` +
    `</g>` +
    `<path d='${arc}' fill='none' stroke='#000' stroke-width='2'/>` +
    `<path d='${leftHead}' fill='#000'/><path d='${rightHead}' fill='#000'/>` +
    `</g></svg>`;
  // `grab` is the mandatory keyword fallback for browsers that refuse the
  // image, not a second choice we'd otherwise make.
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${ROTATE_HOTSPOT} ${ROTATE_HOTSPOT}, grab`;
}
