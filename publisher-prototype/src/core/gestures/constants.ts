import { DPI } from "../geometry/viewport";

/**
 * Gesture tuning constants. Screen-space values convert to inches through the
 * viewport zoom (§6.2 one-scale-factor rule) so machine math stays in
 * document coordinates.
 */

/**
 * ASSUMPTION: pointer travel of 3 screen px separates a click from a drag —
 * the registry contracts name the click behaviors but not the threshold;
 * working guess for SME review.
 */
export const GESTURE_SLOP_PX = 3;

/** The contracts' click-default shape size ("default 1×1 in"). */
export const DEFAULT_SHAPE_SIZE_IN = 1;

/**
 * ASSUMPTION: resize clamps the selection bounds to 0.05 in per axis — the
 * contract requires resize never produce zero/negative boxes but names no
 * minimum; working guess for SME review. The clamp also forbids dragging
 * through the anchor (no flip-resize this phase).
 */
export const MIN_RESIZE_SIZE_IN = 0.05;

/**
 * ASSUMPTION: Shift-rotate snaps the RESULTING rotation to 15° increments —
 * the contract says "fixed angles" without naming them; 15° is the Publisher
 * convention, pending SME review.
 */
export const ROTATE_SNAP_DEG = 15;

/** Shift-line snaps to 45° increments (the contract's 0/45/90°). */
export const LINE_SNAP_DEG = 45;

/** Click/drag slop threshold in document inches at the given zoom. */
export function slopInInches(zoom: number): number {
  return GESTURE_SLOP_PX / (DPI * zoom);
}

/**
 * ASSUMPTION: a pen press within 8 screen px of the draft's first anchor is
 * the close-the-path click (pen.click-start.closes-path) — the contract
 * names the gesture, not the radius; working guess for SME review.
 */
export const PEN_START_HIT_PX = 8;

/** Pen close-target radius in document inches at the given zoom. */
export function penStartToleranceIn(zoom: number): number {
  return PEN_START_HIT_PX / (DPI * zoom);
}
