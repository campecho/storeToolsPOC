import { gestureCancelled } from "../store/documentActions";
import { slopInInches } from "./constants";
import type { GestureCancelResult, GestureContext, GestureModifiers, GesturePoint } from "./types";

/**
 * Shared drag tracking every machine's state embeds: start/current points,
 * live modifiers, and the click-vs-drag latch. Pure and immutable — update
 * returns a new state, never mutates.
 */

export type DragState<C extends GestureContext> = {
  ctx: C;
  start: GesturePoint;
  current: GesturePoint;
  /** Last modifiers seen by update; begin assumes none held. */
  modifiers: GestureModifiers;
  /** Latches true once pointer travel from start exceeds the slop threshold;
      never resets, so an out-and-back drag stays a drag. */
  dragged: boolean;
};

const NO_MODIFIERS: GestureModifiers = { shift: false, alt: false };

export function beginDrag<C extends GestureContext>(point: GesturePoint, ctx: C): DragState<C> {
  return { ctx, start: point, current: point, modifiers: NO_MODIFIERS, dragged: false };
}

/** Generic over the full state type so machines that extend DragState (e.g.
    rotate's initialAngle) keep their extra fields through updates. */
export function updateDrag<S extends DragState<GestureContext>>(
  state: S,
  point: GesturePoint,
  modifiers: GestureModifiers,
): S {
  const dragged =
    state.dragged ||
    Math.hypot(point.x - state.start.x, point.y - state.start.y) > slopInInches(state.ctx.zoom);
  return Object.assign({}, state, { current: point, modifiers, dragged });
}

/** The one dispatch an aborted gesture makes (PLAN.md §6.3): the caller
    dispatches gesture/cancelled and discards the preview. */
export function cancelResult(): GestureCancelResult {
  return { action: gestureCancelled() };
}
