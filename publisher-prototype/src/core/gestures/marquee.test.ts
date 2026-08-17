import { describe, expect, it } from "vitest";
import type { LayoutObject, LineObject, ShapeObject } from "../model";
import { selectTool } from "../registry/tools/selection";
import { gestureCancelled } from "../store/documentActions";
import { selectionClearedCommitted, selectionMarqueeCommitted } from "../store/selectionSlice";
import { marqueeMachine, type MarqueeContext } from "./marquee";
import type { GestureModifiers, GesturePoint, GestureResult } from "./types";

const NONE: GestureModifiers = { shift: false, alt: false };

function shapeRect(id: string, over: Partial<ShapeObject> = {}): ShapeObject {
  return {
    id,
    type: "shape",
    shape: "rect",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    rotation: 0,
    locked: false,
    fill: null,
    stroke: null,
    ...over,
  };
}

const OBJECTS: LayoutObject[] = [
  shapeRect("below"),
  shapeRect("above", { x: 0.5, y: 0.5 }),
  shapeRect("locked", { x: 0.5, y: 0.5, locked: true }),
  {
    id: "crossing",
    type: "line",
    x1: 0,
    y1: 0,
    x2: 2,
    y2: 2,
    locked: false,
    stroke: { paint: { kind: "color", color: { space: "rgb", values: [0, 0, 0] } }, width: 1 },
  } satisfies LineObject,
  shapeRect("far", { x: 5, y: 5 }),
];

function ctx(over: Partial<MarqueeContext> = {}): MarqueeContext {
  return { pageIndex: 0, zoom: 1, objects: OBJECTS, ...over };
}

function drag(from: GesturePoint, to: GesturePoint): GestureResult {
  let state = marqueeMachine.begin(from, ctx());
  state = marqueeMachine.update(state, to, NONE);
  return marqueeMachine.end(state, NONE);
}

function clauseAction(id: string): string {
  const clause = selectTool.gestures.find((g) => g.id === id);
  if (!clause) throw new Error(`missing registry clause ${id}`);
  return clause.action;
}

describe("select.drag-empty.marquee-selects", () => {
  it("selects every unlocked object the marquee intersects, topmost-first", () => {
    const result = drag({ x: 0.9, y: 0.9 }, { x: 1.3, y: 1.3 });
    expect(result.action?.type).toBe(clauseAction("select.drag-empty.marquee-selects"));
    const action = result.action;
    if (action === null || !selectionMarqueeCommitted.match(action)) {
      throw new Error("expected a marquee commit");
    }
    // Intersect, not contain: "below" and "above" are only partially covered;
    // "locked" is skipped; "crossing" hits by segment intersection alone.
    expect(action.payload.ids).toEqual(["crossing", "above", "below"]);
  });

  it("commits an empty id list when the marquee touches nothing", () => {
    const result = drag({ x: 3, y: 3 }, { x: 4, y: 4 });
    const action = result.action;
    if (action === null || !selectionMarqueeCommitted.match(action)) {
      throw new Error("expected a marquee commit");
    }
    expect(action.payload.ids).toEqual([]);
  });

  it("previews the normalized rect on a reverse drag", () => {
    let state = marqueeMachine.begin({ x: 2, y: 2 }, ctx());
    state = marqueeMachine.update(state, { x: 1, y: 1 }, NONE);
    expect(marqueeMachine.preview(state)).toEqual({ kind: "marquee", x: 1, y: 1, w: 1, h: 1 });
  });
});

describe("select.click-empty.clears", () => {
  it("clears the selection when the drag never leaves the slop radius", () => {
    const result = drag({ x: 3, y: 3 }, { x: 3.01, y: 3.01 });
    expect(result.action?.type).toBe(clauseAction("select.click-empty.clears"));
    expect(result.action?.type).toBe(selectionClearedCommitted.type);
  });
});

describe("select.esc.cancels-drag (marquee)", () => {
  it("cancel returns the gesture/cancelled record", () => {
    expect(marqueeMachine.cancel().action.type).toBe(gestureCancelled.type);
  });
});
