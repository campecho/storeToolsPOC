import type { UnknownAction } from "@reduxjs/toolkit";
import type { Paint, PathSeg, Stroke } from "../model";
import type { FrameBox, LineEndpoints } from "../store/documentActions";

/**
 * Gesture state machines — shared shapes (PLAN.md §6.3 hard rule).
 *
 * Gesture state lives OUTSIDE the store: the shell feeds a pointer stream
 * into a machine, renders the SVG overlay's preview straight from
 * `preview(state)`, and dispatches exactly ONE action from `end` (or
 * `cancel`) — never per pointermove. Machines are pure: same pointer stream,
 * same ctx → same states, same committed action (ids come from an injected
 * factory, never from randomness inside a machine).
 */

/** A pointer position in canonical document inches (§6.2). */
export type GesturePoint = { x: number; y: number };

/** Modifier keys, re-evaluated live on every update — releasing a modifier
    mid-drag changes the very next state. */
export type GestureModifiers = { shift: boolean; alt: boolean };

/** Every machine ctx carries the target page and the viewport zoom — zoom
    converts screen-px thresholds (slop) into inches. */
export type GestureContext = { pageIndex: number; zoom: number };

/** Fill/stroke the active tool's options provide for drawn objects. */
export type DrawStyle = { fill: Paint | null; stroke: Stroke | null };

/**
 * The one discriminated union the SVG overlay renders mid-gesture. Every
 * member is plain serializable data in document inches.
 */
export type GesturePreview =
  | { kind: "draw"; shape: "rect" | "ellipse"; x: number; y: number; w: number; h: number }
  | { kind: "draw-path"; x: number; y: number; w: number; h: number; d: PathSeg[] }
  | {
      kind: "pen-handle";
      point: GesturePoint;
      handleIn: GesturePoint;
      handleOut: GesturePoint;
    }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "marquee"; x: number; y: number; w: number; h: number }
  | { kind: "move"; dx: number; dy: number }
  | { kind: "resize"; boxes: Record<string, FrameBox | LineEndpoints> }
  | { kind: "rotate"; rotations: Record<string, number> }
  | { kind: "corner-radius"; radius: number };

/** `end` yields the gesture's single committed action, or null when nothing
    should commit (under-slop clicks with no click behavior, degenerate
    geometry). */
export type GestureResult = { action: UnknownAction | null };

/** `cancel` always yields gesture/cancelled — the only dispatch an aborted
    gesture ever makes. */
export type GestureCancelResult = { action: UnknownAction };

export type GestureMachine<S, C extends GestureContext> = {
  begin(point: GesturePoint, ctx: C): S;
  update(state: S, point: GesturePoint, modifiers: GestureModifiers): S;
  end(state: S, modifiers: GestureModifiers): GestureResult;
  cancel(): GestureCancelResult;
  preview(state: S): GesturePreview;
};
