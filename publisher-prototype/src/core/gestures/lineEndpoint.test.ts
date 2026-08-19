import { describe, expect, it } from "vitest";
import { selectTool } from "../registry/tools/selection";
import {
  gestureCancelled,
  objectResizeCommitted,
  type LineEndpoints,
} from "../store/documentActions";
import { lineEndpointMachine, type LineEndpointContext } from "./lineEndpoint";
import type { GestureModifiers, GesturePoint, GestureResult } from "./types";

const NONE: GestureModifiers = { shift: false, alt: false };
const SHIFT: GestureModifiers = { shift: true, alt: false };

/** A horizontal line from (1,1) to (3,1). */
function ctx(over: Partial<LineEndpointContext> = {}): LineEndpointContext {
  return {
    pageIndex: 0,
    zoom: 1,
    id: "l",
    which: "p2",
    initial: { x1: 1, y1: 1, x2: 3, y2: 1 },
    ...over,
  };
}

/** The press lands on the grabbed handle; the drag is what moves it. */
function drag(
  from: GesturePoint,
  to: GesturePoint,
  modifiers: GestureModifiers = NONE,
  over: Partial<LineEndpointContext> = {},
): GestureResult {
  let state = lineEndpointMachine.begin(from, ctx(over));
  state = lineEndpointMachine.update(state, to, modifiers);
  return lineEndpointMachine.end(state, modifiers);
}

function endpointsOf(result: GestureResult): LineEndpoints {
  const action = result.action;
  if (action === null || !objectResizeCommitted.match(action)) {
    throw new Error("expected a resize commit");
  }
  const box = action.payload.boxes["l"];
  if (box === undefined || !("x1" in box)) throw new Error("expected line endpoints");
  return box;
}

function clauseAction(id: string): string {
  const clause = selectTool.gestures.find((g) => g.id === id);
  if (!clause) throw new Error(`missing registry clause ${id}`);
  return clause.action;
}

describe("select.drag-endpoint.moves-endpoint", () => {
  it("moves only the grabbed end, leaving the other anchored", () => {
    const result = drag({ x: 3, y: 1 }, { x: 4, y: 2.5 });
    expect(result.action?.type).toBe(clauseAction("select.drag-endpoint.moves-endpoint"));
    expect(endpointsOf(result)).toEqual({ x1: 1, y1: 1, x2: 4, y2: 2.5 });
  });

  it("moves p1 the same way, anchored on p2", () => {
    expect(endpointsOf(drag({ x: 1, y: 1 }, { x: 0, y: 2 }, NONE, { which: "p1" }))).toEqual({
      x1: 0,
      y1: 2,
      x2: 3,
      y2: 1,
    });
  });

  it("follows the drag DELTA, so a press off the handle's centre never jumps", () => {
    // Pressing 0.1in short of the endpoint and dragging 1in right must move
    // the endpoint 1in right — not snap it to the pointer.
    const moved = endpointsOf(drag({ x: 2.9, y: 1 }, { x: 3.9, y: 1 }));
    expect(moved.x2).toBeCloseTo(4, 9);
    expect(moved.y2).toBeCloseTo(1, 9);
  });

  it("Shift snaps the segment to 45° increments about the anchor", () => {
    // Landing at (4, 3.5) is 39.8° off the anchor (1,1) — snapped to 45°, at
    // the length the drag projects onto that ray: (3 + 2.5)·cos45 ≈ 3.889.
    const snapped = endpointsOf(drag({ x: 3, y: 1 }, { x: 4, y: 3.5 }, SHIFT));
    expect(snapped.x1).toBe(1);
    expect(snapped.y1).toBe(1);
    expect(snapped.x2).toBeCloseTo(3.75, 9);
    expect(snapped.y2).toBeCloseTo(3.75, 9);
  });

  it("Shift pulls a near-horizontal drag flat, the anchor holding its end", () => {
    // 21.8° off the anchor is nearer 0° than 45°, so the segment lies flat.
    const snapped = endpointsOf(drag({ x: 3, y: 1 }, { x: 4, y: 2.2 }, SHIFT));
    expect(snapped.x2).toBeCloseTo(4, 9);
    expect(snapped.y2).toBeCloseTo(1, 9);
  });

  it("commits nothing on an under-slop end", () => {
    expect(drag({ x: 3, y: 1 }, { x: 3.005, y: 1.005 }).action).toBeNull();
  });

  it("commits nothing when the line would collapse onto its anchor", () => {
    expect(drag({ x: 3, y: 1 }, { x: 1, y: 1 }).action).toBeNull();
  });

  it("previews the live segment through the resize arm", () => {
    let state = lineEndpointMachine.begin({ x: 3, y: 1 }, ctx());
    state = lineEndpointMachine.update(state, { x: 5, y: 1 }, NONE);
    const preview = lineEndpointMachine.preview(state);
    if (preview.kind !== "resize") throw new Error("expected a resize preview");
    expect(preview.boxes["l"]).toEqual({ x1: 1, y1: 1, x2: 5, y2: 1 });
  });
});

describe("select.esc.cancels-drag (line endpoint)", () => {
  it("cancel returns the gesture/cancelled record", () => {
    expect(lineEndpointMachine.cancel().action.type).toBe(gestureCancelled.type);
  });
});
