import { describe, expect, it } from "vitest";
import { framePivot, rotatePoint } from "../hittest";
import { roundedRectTool } from "../registry/tools/shapes";
import {
  gestureCancelled,
  roundedRectCornerRadiusCommitted,
  type CornerRadiusCommit,
  type FrameBox,
} from "../store/documentActions";
import { cornerRadiusMachine, type CornerRadiusContext } from "./cornerRadius";
import type { GestureModifiers, GesturePoint, GestureResult } from "./types";

/**
 * rounded-rect.drag-adjust-handle.sets-corner-radius: travel along the
 * frame's top edge is radius, clamped to half the shorter side, committed
 * once on release.
 */

const NONE: GestureModifiers = { shift: false, alt: false };

/** A 2×1in frame at (1,1): the bound is half the shorter side, 0.5in. */
const FRAME: FrameBox = { x: 1, y: 1, w: 2, h: 1 };
const BOUND = 0.5;

function ctx(over: Partial<CornerRadiusContext> = {}): CornerRadiusContext {
  return {
    pageIndex: 0,
    zoom: 1,
    id: "r",
    frame: FRAME,
    rotation: 0,
    initialRadius: 0.1,
    ...over,
  };
}

function radiusOf(result: GestureResult): number {
  const action = result.action;
  if (action === null || !roundedRectCornerRadiusCommitted.match(action)) {
    throw new Error("expected a corner-radius commit");
  }
  return (action.payload as CornerRadiusCommit).radius;
}

/** Press at the top-left corner and drag `dx` along the edge. */
function drag(dx: number, over: Partial<CornerRadiusContext> = {}): GestureResult {
  const c = ctx(over);
  const at = (x: number): GesturePoint =>
    c.rotation === 0
      ? { x, y: c.frame.y }
      : rotatePoint({ x, y: c.frame.y }, framePivot(c.frame), c.rotation);
  let state = cornerRadiusMachine.begin(at(c.frame.x), c);
  state = cornerRadiusMachine.update(state, at(c.frame.x + dx), NONE);
  return cornerRadiusMachine.end(state, NONE);
}

describe("rounded-rect.drag-adjust-handle.sets-corner-radius", () => {
  it("commits the registry clause's action", () => {
    const clause = roundedRectTool.gestures.find(
      (g) => g.id === "rounded-rect.drag-adjust-handle.sets-corner-radius",
    );
    if (!clause) throw new Error("missing registry clause");
    expect(drag(0.2).action?.type).toBe(clause.action);
  });

  it("adds the travel along the top edge to the starting radius", () => {
    expect(radiusOf(drag(0.2))).toBeCloseTo(0.3, 9);
    expect(radiusOf(drag(-0.05))).toBeCloseTo(0.05, 9);
  });

  it("clamps to half the shorter side, and never below zero", () => {
    expect(radiusOf(drag(9))).toBeCloseTo(BOUND, 9);
    expect(radiusOf(drag(-9))).toBe(0);
  });

  it("reads travel in the frame's own space, so a rotated shape tracks its edge", () => {
    // At a quarter turn the top edge runs down the page; the same 0.2in of
    // travel along it is the same 0.2in of radius.
    expect(radiusOf(drag(0.2, { rotation: 90 }))).toBeCloseTo(0.3, 9);
    expect(radiusOf(drag(0.2, { rotation: -37 }))).toBeCloseTo(0.3, 9);
  });

  it("previews the live radius and commits nothing on an under-slop end", () => {
    const c = ctx();
    let state = cornerRadiusMachine.begin({ x: 1, y: 1 }, c);
    state = cornerRadiusMachine.update(state, { x: 1.25, y: 1 }, NONE);
    expect(cornerRadiusMachine.preview(state)).toEqual({ kind: "corner-radius", radius: 0.35 });

    const still = cornerRadiusMachine.begin({ x: 1, y: 1 }, c);
    expect(cornerRadiusMachine.end(still, NONE).action).toBeNull();
  });

  it("cancel returns the gesture/cancelled record", () => {
    expect(cornerRadiusMachine.cancel().action.type).toBe(gestureCancelled.type);
  });
});
