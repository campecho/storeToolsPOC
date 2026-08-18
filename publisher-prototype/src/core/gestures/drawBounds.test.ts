import type { ActionCreatorWithPayload } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import { roundedRectPath } from "../geometry/shapePaths";
import { LayoutObjectSchema, type Paint, type PathSeg, type Stroke } from "../model";
import { ellipseTool, flowchartTool, rectTool } from "../registry/tools/shapes";
import {
  bannerDrawCommitted,
  calloutDrawCommitted,
  ellipseDrawCommitted,
  flowchartDrawCommitted,
  gestureCancelled,
  rectDrawCommitted,
  roundedRectDrawCommitted,
  starPolygonDrawCommitted,
  type DrawCommit,
} from "../store/documentActions";
import {
  drawBoundsMachine,
  drawShapeMachine,
  type DrawBoundsContext,
  type DrawBoundsState,
  type DrawShapeContext,
} from "./drawBounds";
import type { GestureModifiers, GesturePoint, GestureResult } from "./types";

const FILL: Paint = { kind: "color", color: { space: "rgb", values: [0.2, 0.4, 0.8] } };
const STROKE: Stroke = {
  paint: { kind: "color", color: { space: "rgb", values: [0, 0, 0] } },
  width: 0.75,
};
const NONE: GestureModifiers = { shift: false, alt: false };
const SHIFT: GestureModifiers = { shift: true, alt: false };
const ALT: GestureModifiers = { shift: false, alt: true };
const SHIFT_ALT: GestureModifiers = { shift: true, alt: true };

function ctx(over: Partial<DrawBoundsContext> = {}): DrawBoundsContext {
  return { pageIndex: 0, zoom: 1, style: { fill: FILL, stroke: STROKE }, idFactory: () => "id-1", ...over };
}

function payloadOf<P>(result: GestureResult, creator: ActionCreatorWithPayload<P>): P {
  const action = result.action;
  if (action === null || !creator.match(action)) {
    throw new Error(`expected a ${creator.type} commit`);
  }
  return action.payload;
}

function clauseAction(tool: typeof rectTool, id: string): string {
  const clause = tool.gestures.find((g) => g.id === id);
  if (!clause) throw new Error(`missing registry clause ${id}`);
  return clause.action;
}

function drag(
  from: GesturePoint,
  to: GesturePoint,
  modifiers: GestureModifiers = NONE,
  context = ctx(),
): { state: DrawBoundsState; result: GestureResult } {
  const machine = drawBoundsMachine("rect");
  let state = machine.begin(from, context);
  state = machine.update(state, to, modifiers);
  return { state, result: machine.end(state, modifiers) };
}

describe("rect.drag.creates", () => {
  it("commits one complete rect ShapeObject of the dragged bounds", () => {
    const { result } = drag({ x: 1, y: 1 }, { x: 3, y: 2.5 });
    expect(result.action?.type).toBe(clauseAction(rectTool, "rect.drag.creates"));
    const payload = payloadOf<DrawCommit>(result, rectDrawCommitted);
    expect(payload.pageIndex).toBe(0);
    expect(payload.object).toMatchObject({
      id: "id-1",
      type: "shape",
      shape: "rect",
      x: 1,
      y: 1,
      w: 2,
      h: 1.5,
      rotation: 0,
      locked: false,
      fill: FILL,
      stroke: STROKE,
    });
    expect(() => LayoutObjectSchema.parse(payload.object)).not.toThrow();
  });

  it("normalizes a leftward/upward drag and returns exactly one action", () => {
    const { result } = drag({ x: 3, y: 2.5 }, { x: 1, y: 1 });
    expect(Object.keys(result)).toEqual(["action"]);
    const payload = payloadOf<DrawCommit>(result, rectDrawCommitted);
    expect(payload.object).toMatchObject({ x: 1, y: 1, w: 2, h: 1.5 });
  });

  it("commits nothing for a degenerate zero-area drag", () => {
    const { result } = drag({ x: 1, y: 1 }, { x: 2, y: 1 });
    expect(result.action).toBeNull();
  });

  it("is deterministic: identical streams commit identical actions", () => {
    const a = drag({ x: 1, y: 1 }, { x: 2, y: 2 }).result;
    const b = drag({ x: 1, y: 1 }, { x: 2, y: 2 }).result;
    expect(a).toEqual(b);
  });
});

describe("rect.shift-drag.constrains-square", () => {
  it("constrains to the larger dimension, toward the drag direction", () => {
    const { result } = drag({ x: 1, y: 1 }, { x: 3, y: 2 }, SHIFT);
    expect(payloadOf<DrawCommit>(result, rectDrawCommitted).object).toMatchObject({
      x: 1,
      y: 1,
      w: 2,
      h: 2,
    });
  });

  it("grows the square into a negative-direction drag", () => {
    const { result } = drag({ x: 1, y: 1 }, { x: -1, y: 0.5 }, SHIFT);
    expect(payloadOf<DrawCommit>(result, rectDrawCommitted).object).toMatchObject({
      x: -1,
      y: -1,
      w: 2,
      h: 2,
    });
  });

  it("un-constrains when Shift is released mid-drag (modifiers are live)", () => {
    const machine = drawBoundsMachine("rect");
    let state = machine.begin({ x: 1, y: 1 }, ctx());
    state = machine.update(state, { x: 3, y: 2 }, SHIFT);
    expect(machine.preview(state)).toMatchObject({ kind: "draw", w: 2, h: 2 });
    state = machine.update(state, { x: 3, y: 2 }, NONE);
    expect(machine.preview(state)).toMatchObject({ kind: "draw", w: 2, h: 1 });
    const payload = payloadOf<DrawCommit>(machine.end(state, NONE), rectDrawCommitted);
    expect(payload.object).toMatchObject({ x: 1, y: 1, w: 2, h: 1 });
  });
});

describe("rect.alt-drag.draws-from-center", () => {
  it("draws outward from the press point as center", () => {
    const { result } = drag({ x: 2, y: 2 }, { x: 3, y: 2.5 }, ALT);
    expect(payloadOf<DrawCommit>(result, rectDrawCommitted).object).toMatchObject({
      x: 1,
      y: 1.5,
      w: 2,
      h: 1,
    });
  });

  it("combines with Shift into a centered square", () => {
    const { result } = drag({ x: 2, y: 2 }, { x: 3, y: 2.5 }, SHIFT_ALT);
    expect(payloadOf<DrawCommit>(result, rectDrawCommitted).object).toMatchObject({
      x: 1,
      y: 1,
      w: 2,
      h: 2,
    });
  });
});

describe("rect.click.creates-default-size", () => {
  it("commits a default 1×1 in rect centered at an under-slop click", () => {
    // 0.02in travel < the 3px slop at zoom 1 (0.03125in).
    const { result } = drag({ x: 2, y: 3 }, { x: 2.02, y: 3 });
    expect(payloadOf<DrawCommit>(result, rectDrawCommitted).object).toMatchObject({
      x: 1.5,
      y: 2.5,
      w: 1,
      h: 1,
    });
  });

  it("converts the slop threshold through zoom", () => {
    // 0.02in travel exceeds the 3px slop at zoom 4 (0.0078in) → a real drag.
    const { result } = drag({ x: 2, y: 3 }, { x: 2.02, y: 3.02 }, NONE, ctx({ zoom: 4 }));
    const payload = payloadOf<DrawCommit>(result, rectDrawCommitted);
    expect(payload.object).toMatchObject({ x: 2, y: 3 });
    expect(payload.object).not.toMatchObject({ w: 1, h: 1 });
  });

  it("stays a drag once slop is exceeded, even after returning to the start", () => {
    const machine = drawBoundsMachine("rect");
    let state = machine.begin({ x: 1, y: 1 }, ctx());
    state = machine.update(state, { x: 2, y: 2 }, NONE);
    state = machine.update(state, { x: 1, y: 1 }, NONE);
    // Dragged back to zero area → degenerate, not the click default.
    expect(machine.end(state, NONE).action).toBeNull();
  });
});

describe("ellipse.drag.creates / ellipse.shift-drag.constrains-circle", () => {
  it("commits an ellipse ShapeObject through the ellipse clause action", () => {
    const machine = drawBoundsMachine("ellipse");
    let state = machine.begin({ x: 0, y: 0 }, ctx());
    state = machine.update(state, { x: 2, y: 1 }, SHIFT);
    const result = machine.end(state, SHIFT);
    expect(result.action?.type).toBe(clauseAction(ellipseTool, "ellipse.drag.creates"));
    const payload = payloadOf<DrawCommit>(result, ellipseDrawCommitted);
    expect(payload.object).toMatchObject({ shape: "ellipse", w: 2, h: 2 });
  });
});

describe("rect.esc.cancels-draw", () => {
  it("cancel returns the gesture/cancelled record and nothing else", () => {
    const machine = drawBoundsMachine("rect");
    const cancelled = machine.cancel();
    expect(cancelled.action.type).toBe(clauseAction(rectTool, "rect.esc.cancels-draw"));
    expect(cancelled.action.type).toBe(gestureCancelled.type);
  });
});

describe("drawShapeMachine (rounded-rect / star-polygon / callout / banner / flowchart draw clauses)", () => {
  const DIAMOND: PathSeg[] = [
    { c: "M", x: 0.5, y: 0 },
    { c: "L", x: 1, y: 0.5 },
    { c: "L", x: 0.5, y: 1 },
    { c: "L", x: 0, y: 0.5 },
    { c: "Z" },
  ];

  function pathCtx(over: Partial<DrawShapeContext> = {}): DrawShapeContext {
    return { ...ctx(), geometryForBox: () => ({ shape: "path", d: DIAMOND }), ...over };
  }

  it("commits one schema-valid path ShapeObject of the dragged bounds through the clause action", () => {
    const machine = drawShapeMachine(flowchartDrawCommitted);
    let state = machine.begin({ x: 1, y: 1 }, pathCtx());
    state = machine.update(state, { x: 3, y: 2.5 }, NONE);
    const result = machine.end(state, NONE);
    expect(result.action?.type).toBe(clauseAction(flowchartTool, "flowchart.drag.creates"));
    const payload = payloadOf<DrawCommit>(result, flowchartDrawCommitted);
    expect(payload.object).toMatchObject({
      type: "shape",
      shape: "path",
      d: DIAMOND,
      x: 1,
      y: 1,
      w: 2,
      h: 1.5,
      rotation: 0,
      locked: false,
    });
    expect(() => LayoutObjectSchema.parse(payload.object)).not.toThrow();
  });

  it("hands geometryForBox the FINAL box, so inch-based parameters normalize correctly", () => {
    const seen: { x: number; y: number; w: number; h: number }[] = [];
    const machine = drawShapeMachine(roundedRectDrawCommitted);
    let state = machine.begin({ x: 2, y: 2 }, pathCtx({
      geometryForBox: (box) => {
        seen.push(box);
        return { shape: "path", d: DIAMOND };
      },
    }));
    state = machine.update(state, { x: 4, y: 3 }, NONE);
    machine.end(state, NONE);
    expect(seen.at(-1)).toEqual({ x: 2, y: 2, w: 2, h: 1 });
  });

  it("commits the PARAMETRIC kind whole — a rounded rect stores its radius, no `d`", () => {
    const machine = drawShapeMachine(roundedRectDrawCommitted);
    let state = machine.begin({ x: 1, y: 1 }, pathCtx({
      geometryForBox: () => ({ shape: "roundedRect", cornerRadius: 0.2 }),
    }));
    state = machine.update(state, { x: 3, y: 2 }, NONE);
    const result = machine.end(state, NONE);
    const payload = payloadOf<DrawCommit>(result, roundedRectDrawCommitted);
    expect(payload.object).toMatchObject({ shape: "roundedRect", cornerRadius: 0.2, w: 2, h: 1 });
    expect(payload.object).not.toHaveProperty("d");
    expect(() => LayoutObjectSchema.parse(payload.object)).not.toThrow();
  });

  it("previews a parametric kind with the outline the renderer will draw", () => {
    const machine = drawShapeMachine(roundedRectDrawCommitted);
    let state = machine.begin({ x: 0, y: 0 }, pathCtx({
      geometryForBox: () => ({ shape: "roundedRect", cornerRadius: 0.25 }),
    }));
    state = machine.update(state, { x: 2, y: 1 }, NONE);
    const preview = machine.preview(state);
    if (preview.kind !== "draw-path") throw new Error("expected a draw-path preview");
    // 0.25in of a 2×1in box: an eighth across, a quarter down.
    expect(preview.d).toEqual(roundedRectPath(0.125, 0.25));
  });

  it("click (no drag) commits the 1×1 in default centered at the click point", () => {
    const machine = drawShapeMachine(starPolygonDrawCommitted);
    const state = machine.begin({ x: 4, y: 4 }, pathCtx());
    const payload = payloadOf<DrawCommit>(machine.end(state, NONE), starPolygonDrawCommitted);
    expect(payload.object).toMatchObject({ x: 3.5, y: 3.5, w: 1, h: 1, shape: "path" });
  });

  it("commits nothing for a degenerate zero-area drag, and Shift/Alt shape the box as on rect", () => {
    const machine = drawShapeMachine(bannerDrawCommitted);
    let flat = machine.begin({ x: 1, y: 1 }, pathCtx());
    flat = machine.update(flat, { x: 3, y: 1 }, NONE);
    expect(machine.end(flat, NONE).action).toBeNull();

    let alt = machine.begin({ x: 3, y: 3 }, pathCtx());
    alt = machine.update(alt, { x: 4, y: 3.5 }, SHIFT_ALT);
    const payload = payloadOf<DrawCommit>(machine.end(alt, SHIFT_ALT), bannerDrawCommitted);
    expect(payload.object).toMatchObject({ x: 2, y: 2, w: 2, h: 2 });
  });

  it("previews kind draw-path with the live box and its built d; cancel is the gesture/cancelled record", () => {
    const machine = drawShapeMachine(calloutDrawCommitted);
    let state = machine.begin({ x: 1, y: 1 }, pathCtx());
    state = machine.update(state, { x: 2, y: 3 }, NONE);
    expect(machine.preview(state)).toEqual({ kind: "draw-path", x: 1, y: 1, w: 1, h: 2, d: DIAMOND });
    expect(machine.cancel().action.type).toBe(gestureCancelled.type);
  });
});
