import type { ActionCreatorWithPayload } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import { LayoutObjectSchema, type Stroke } from "../model";
import { lineTool } from "../registry/tools/shapes";
import { gestureCancelled, lineDrawCommitted, type DrawCommit } from "../store/documentActions";
import { drawLineMachine, type DrawLineContext, type DrawLineState } from "./drawLine";
import type { GestureModifiers, GesturePoint, GestureResult } from "./types";

const STROKE: Stroke = {
  paint: { kind: "color", color: { space: "rgb", values: [1, 0, 0] } },
  width: 2,
};
const NONE: GestureModifiers = { shift: false, alt: false };
const SHIFT: GestureModifiers = { shift: true, alt: false };

function ctx(over: Partial<DrawLineContext> = {}): DrawLineContext {
  return { pageIndex: 0, zoom: 1, style: { fill: null, stroke: STROKE }, idFactory: () => "line-1", ...over };
}

function payloadOf<P>(result: GestureResult, creator: ActionCreatorWithPayload<P>): P {
  const action = result.action;
  if (action === null || !creator.match(action)) {
    throw new Error(`expected a ${creator.type} commit`);
  }
  return action.payload;
}

function clauseAction(id: string): string {
  const clause = lineTool.gestures.find((g) => g.id === id);
  if (!clause) throw new Error(`missing registry clause ${id}`);
  return clause.action;
}

function drag(
  from: GesturePoint,
  to: GesturePoint,
  modifiers: GestureModifiers = NONE,
  context = ctx(),
): { state: DrawLineState; result: GestureResult } {
  let state = drawLineMachine.begin(from, context);
  state = drawLineMachine.update(state, to, modifiers);
  return { state, result: drawLineMachine.end(state, modifiers) };
}

describe("line.drag.creates", () => {
  it("commits one complete LineObject from press to release", () => {
    const { result } = drag({ x: 1, y: 1 }, { x: 3, y: 2 });
    expect(result.action?.type).toBe(clauseAction("line.drag.creates"));
    const payload = payloadOf<DrawCommit>(result, lineDrawCommitted);
    expect(payload.pageIndex).toBe(0);
    expect(payload.object).toMatchObject({
      id: "line-1",
      type: "line",
      x1: 1,
      y1: 1,
      x2: 3,
      y2: 2,
      locked: false,
      stroke: STROKE,
    });
    expect(() => LayoutObjectSchema.parse(payload.object)).not.toThrow();
  });

  it("falls back to a 1pt black stroke when the ctx style has none", () => {
    const { result } = drag({ x: 0, y: 0 }, { x: 1, y: 1 }, NONE, ctx({ style: { fill: null, stroke: null } }));
    const payload = payloadOf<DrawCommit>(result, lineDrawCommitted);
    if (payload.object.type !== "line") throw new Error("expected a line");
    expect(payload.object.stroke).toEqual({
      paint: { kind: "color", color: { space: "rgb", values: [0, 0, 0] } },
      width: 1,
    });
  });

  it("commits nothing on an under-slop click — the registry defines no line click-default", () => {
    const { result } = drag({ x: 1, y: 1 }, { x: 1.01, y: 1.01 });
    expect(result.action).toBeNull();
  });

  it("commits nothing when an out-and-back drag ends at zero length", () => {
    let state = drawLineMachine.begin({ x: 1, y: 1 }, ctx());
    state = drawLineMachine.update(state, { x: 2, y: 2 }, NONE);
    state = drawLineMachine.update(state, { x: 1, y: 1 }, NONE);
    expect(drawLineMachine.end(state, NONE).action).toBeNull();
  });
});

describe("line.shift-drag.constrains-angle", () => {
  it("snaps a near-horizontal drag to 0°, preserving the projected length", () => {
    const { result } = drag({ x: 0, y: 0 }, { x: 2, y: 0.5 }, SHIFT);
    const payload = payloadOf<DrawCommit>(result, lineDrawCommitted);
    if (payload.object.type !== "line") throw new Error("expected a line");
    expect(payload.object.x2).toBeCloseTo(2, 6);
    expect(payload.object.y2).toBeCloseTo(0, 6);
  });

  it("snaps a diagonal drag to 45°", () => {
    const { result } = drag({ x: 0, y: 0 }, { x: 1, y: 1.2 }, SHIFT);
    const payload = payloadOf<DrawCommit>(result, lineDrawCommitted);
    if (payload.object.type !== "line") throw new Error("expected a line");
    // Projection of (1, 1.2) onto the 45° direction: 2.2/√2 along each axis.
    expect(payload.object.x2).toBeCloseTo(1.1, 6);
    expect(payload.object.y2).toBeCloseTo(1.1, 6);
  });

  it("snaps a near-vertical drag to 90°", () => {
    const { result } = drag({ x: 0, y: 0 }, { x: 0.1, y: 2 }, SHIFT);
    const payload = payloadOf<DrawCommit>(result, lineDrawCommitted);
    if (payload.object.type !== "line") throw new Error("expected a line");
    expect(payload.object.x2).toBeCloseTo(0, 6);
    expect(payload.object.y2).toBeCloseTo(2, 6);
  });

  it("previews the live snap and un-snaps when Shift is released", () => {
    let state = drawLineMachine.begin({ x: 0, y: 0 }, ctx());
    state = drawLineMachine.update(state, { x: 2, y: 0.5 }, SHIFT);
    const snapped = drawLineMachine.preview(state);
    if (snapped.kind !== "line") throw new Error("expected a line preview");
    expect(snapped.y2).toBeCloseTo(0, 6);
    state = drawLineMachine.update(state, { x: 2, y: 0.5 }, NONE);
    expect(drawLineMachine.preview(state)).toMatchObject({ kind: "line", x2: 2, y2: 0.5 });
  });
});

describe("line.esc.cancels-draw", () => {
  it("cancel returns the gesture/cancelled record", () => {
    const cancelled = drawLineMachine.cancel();
    expect(cancelled.action.type).toBe(clauseAction("line.esc.cancels-draw"));
    expect(cancelled.action.type).toBe(gestureCancelled.type);
  });
});
