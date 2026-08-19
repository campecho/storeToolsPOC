import { describe, expect, it } from "vitest";
import { CALLOUT_TIP_MAX, CALLOUT_TIP_MIN } from "../geometry/shapePaths";
import { framePivot, rotatePoint } from "../hittest";
import type { NormalizedPoint } from "../model";
import { calloutTool, roundedRectTool, starPolygonTool } from "../registry/tools/shapes";
import {
  calloutTailCommitted,
  gestureCancelled,
  roundedRectCornerRadiusCommitted,
  starPolygonInnerRadiusCommitted,
  type CalloutTailCommit,
  type CornerRadiusCommit,
  type FrameBox,
  type StarInnerRadiusCommit,
} from "../store/documentActions";
import {
  calloutTailMachine,
  cornerRadiusMachine,
  starInnerArmPoint,
  starInnerRadiusMachine,
  type CalloutTailContext,
  type CornerRadiusContext,
  type StarInnerRadiusContext,
} from "./shapeAdjust";
import type { GestureModifiers, GesturePoint, GestureResult } from "./types";

/**
 * The adjust-handle clauses: each drags one parameter of one placed shape and
 * commits once on release, reading its travel in the shape's own frame space
 * so a rotated shape's handle tracks the shape rather than the page.
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
    expect(cornerRadiusMachine.preview(state)).toEqual({
      kind: "shape-param",
      params: { cornerRadius: 0.35 },
    });

    const still = cornerRadiusMachine.begin({ x: 1, y: 1 }, c);
    expect(cornerRadiusMachine.end(still, NONE).action).toBeNull();
  });

  it("cancel returns the gesture/cancelled record", () => {
    expect(cornerRadiusMachine.cancel().action.type).toBe(gestureCancelled.type);
  });
});

describe("star-polygon.drag-adjust-handle.sets-inner-radius", () => {
  /** A unit-square frame keeps the arm's projection free of aspect scaling. */
  const STAR_FRAME: FrameBox = { x: 0, y: 0, w: 2, h: 2 };

  function starCtx(over: Partial<StarInnerRadiusContext> = {}): StarInnerRadiusContext {
    return {
      pageIndex: 0,
      zoom: 1,
      id: "s",
      frame: STAR_FRAME,
      rotation: 0,
      initialRatio: 0.5,
      points: 5,
      ...over,
    };
  }

  /** Drag from the handle's own vertex outward along the arm by `along`,
      measured as a fraction of the outer radius. */
  function starDrag(along: number, over: Partial<StarInnerRadiusContext> = {}): GestureResult {
    const c = starCtx(over);
    const arm = starInnerArmPoint(c.points, c.initialRatio);
    const dir = starInnerArmPoint(c.points, c.initialRatio + along);
    // Unit box → frame space → DOCUMENT space: the machine takes the pointer
    // as the page sees it and inverse-rotates it back itself.
    const at = (u: GesturePoint): GesturePoint => {
      const local = { x: c.frame.x + u.x * c.frame.w, y: c.frame.y + u.y * c.frame.h };
      return c.rotation === 0 ? local : rotatePoint(local, framePivot(c.frame), c.rotation);
    };
    let state = starInnerRadiusMachine.begin(at(arm), c);
    state = starInnerRadiusMachine.update(state, at(dir), NONE);
    return starInnerRadiusMachine.end(state, NONE);
  }

  function ratioOf(result: GestureResult): number {
    const action = result.action;
    if (action === null || !starPolygonInnerRadiusCommitted.match(action)) {
      throw new Error("expected an inner-radius commit");
    }
    return (action.payload as StarInnerRadiusCommit).innerRadiusRatio;
  }

  it("commits the registry clause's action", () => {
    const clause = starPolygonTool.gestures.find(
      (g) => g.id === "star-polygon.drag-adjust-handle.sets-inner-radius",
    );
    if (!clause) throw new Error("missing registry clause");
    expect(starDrag(0.2).action?.type).toBe(clause.action);
  });

  it("moves the ratio by the travel along the arm, in or out", () => {
    expect(ratioOf(starDrag(0.2))).toBeCloseTo(0.7, 9);
    expect(ratioOf(starDrag(-0.2))).toBeCloseTo(0.3, 9);
  });

  it("clamps to the range starPath itself accepts", () => {
    expect(ratioOf(starDrag(5))).toBeCloseTo(0.95, 9);
    expect(ratioOf(starDrag(-5))).toBeCloseTo(0.05, 9);
  });

  it("rides the arm the vertex count puts it on, at any rotation", () => {
    expect(ratioOf(starDrag(0.2, { points: 7 }))).toBeCloseTo(0.7, 9);
    expect(ratioOf(starDrag(0.2, { rotation: 40 }))).toBeCloseTo(0.7, 9);
  });

  it("previews the live ratio and commits nothing on an under-slop end", () => {
    const c = starCtx();
    const arm = starInnerArmPoint(c.points, c.initialRatio);
    const at = { x: arm.x * c.frame.w, y: arm.y * c.frame.h };
    const still = starInnerRadiusMachine.begin(at, c);
    expect(starInnerRadiusMachine.preview(still)).toEqual({
      kind: "shape-param",
      params: { innerRadiusRatio: 0.5 },
    });
    expect(starInnerRadiusMachine.end(still, NONE).action).toBeNull();
    expect(starInnerRadiusMachine.cancel().action.type).toBe(gestureCancelled.type);
  });
});

describe("callout.drag-tail-handle.repositions-tail", () => {
  const CALLOUT_FRAME: FrameBox = { x: 1, y: 1, w: 2, h: 2 };

  function calloutCtx(over: Partial<CalloutTailContext> = {}): CalloutTailContext {
    return { pageIndex: 0, zoom: 1, id: "c", frame: CALLOUT_FRAME, rotation: 0, ...over };
  }

  function tailDrag(to: GesturePoint, over: Partial<CalloutTailContext> = {}): GestureResult {
    const c = calloutCtx(over);
    let state = calloutTailMachine.begin({ x: c.frame.x, y: c.frame.y + c.frame.h }, c);
    state = calloutTailMachine.update(state, to, NONE);
    return calloutTailMachine.end(state, NONE);
  }

  function tipOf(result: GestureResult): NormalizedPoint {
    const action = result.action;
    if (action === null || !calloutTailCommitted.match(action)) {
      throw new Error("expected a tail commit");
    }
    return (action.payload as CalloutTailCommit).tailTip;
  }

  it("commits the registry clause's action", () => {
    const clause = calloutTool.gestures.find(
      (g) => g.id === "callout.drag-tail-handle.repositions-tail",
    );
    if (!clause) throw new Error("missing registry clause");
    expect(tailDrag({ x: 2.8, y: 2.8 }).action?.type).toBe(clause.action);
  });

  it("commits the pointer itself as the tip — length and angle in one point", () => {
    // The 2×2in frame at (1,1): (2.8, 2.8) is 0.9 of the way across and down.
    const near = tipOf(tailDrag({ x: 2.8, y: 2.8 }));
    expect(near.x).toBeCloseTo(0.9, 9);
    expect(near.y).toBeCloseTo(0.9, 9);
    const far = tipOf(tailDrag({ x: 1.2, y: 1.2 }));
    expect(far.x).toBeCloseTo(0.1, 9);
    expect(far.y).toBeCloseTo(0.1, 9);
  });

  it("reaches OUTSIDE the body, which is where a callout points", () => {
    expect(tipOf(tailDrag({ x: 4, y: 5 }))).toEqual({ x: 1.5, y: 2 });
  });

  it("bounds the tip so the tail cannot be flung off the page", () => {
    const bounded = tipOf(tailDrag({ x: 40, y: -40 }));
    expect(bounded.x).toBe(CALLOUT_TIP_MAX);
    expect(bounded.y).toBe(CALLOUT_TIP_MIN);
  });

  it("reads the tip in the frame's own space, so a rotated callout agrees", () => {
    // At a quarter turn the frame's bottom-right corner lies elsewhere on the
    // page; the pointer there still asks for the same tip in the shape.
    const rotated = rotatePoint({ x: 2.8, y: 2.8 }, framePivot(CALLOUT_FRAME), 90);
    const tip = tipOf(tailDrag(rotated, { rotation: 90 }));
    expect(tip.x).toBeCloseTo(0.9, 9);
    expect(tip.y).toBeCloseTo(0.9, 9);
  });

  it("commits nothing on an under-slop end; cancel is the gesture/cancelled record", () => {
    const still = calloutTailMachine.begin({ x: 1, y: 3 }, calloutCtx());
    expect(calloutTailMachine.end(still, NONE).action).toBeNull();
    expect(calloutTailMachine.cancel().action.type).toBe(gestureCancelled.type);
  });
});
