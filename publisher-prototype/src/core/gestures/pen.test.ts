import type { ActionCreatorWithPayload, UnknownAction } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import { LayoutObjectSchema, type PathSeg, type ShapeObject, type Stroke } from "../model";
import { penTool } from "../registry/tools/shapes";
import { gestureCancelled, penDrawCommitted, type DrawCommit } from "../store/documentActions";
import {
  penAnchorCommitted,
  penCurveAnchorCommitted,
  type PenAnchor,
} from "../store/penSlice";
import { penStartToleranceIn } from "./constants";
import {
  finishPenDraft,
  penDraftSegments,
  penMachine,
  penObjectFromDraft,
  type PenContext,
} from "./pen";
import type { DrawStyle, GestureModifiers, GesturePoint, GestureResult } from "./types";

const STROKE: Stroke = {
  paint: { kind: "color", color: { space: "rgb", values: [1, 0, 0] } },
  width: 2,
};
const STYLE: DrawStyle = { fill: null, stroke: STROKE };
const NONE: GestureModifiers = { shift: false, alt: false };

const anchor = (x: number, y: number): PenAnchor => ({ point: { x, y } });

/** The straight three-anchor draft used across the close tests. */
const RING = [anchor(1, 1), anchor(3, 1), anchor(3, 3)];

function ctx(over: Partial<PenContext> = {}): PenContext {
  return { pageIndex: 0, zoom: 1, anchors: [], style: STYLE, idFactory: () => "id-1", ...over };
}

function payloadOf<P>(result: GestureResult, creator: ActionCreatorWithPayload<P>): P {
  const action = result.action;
  if (action === null || !creator.match(action)) {
    throw new Error(`expected a ${creator.type} commit`);
  }
  return action.payload;
}

function clauseAction(id: string): string {
  const clause = penTool.gestures.find((g) => g.id === id);
  if (!clause) throw new Error(`missing registry clause ${id}`);
  return clause.action;
}

/** One pen press: begin at `at`, optionally drag to `dragTo`, then release. */
function press(at: GesturePoint, context = ctx(), dragTo?: GesturePoint): GestureResult {
  let state = penMachine.begin(at, context);
  if (dragTo) state = penMachine.update(state, dragTo, NONE);
  return penMachine.end(state, NONE);
}

function shapeOf(commit: DrawCommit): ShapeObject {
  if (commit.object.type !== "shape") throw new Error("expected a shape commit");
  return commit.object;
}

function pathOf(object: ShapeObject | null): PathSeg[] {
  if (object === null) throw new Error("expected a committed shape");
  return object.d ?? [];
}

function segCoords(seg: PathSeg): number[] {
  switch (seg.c) {
    case "M":
    case "L":
      return [seg.x, seg.y];
    case "C":
      return [seg.x1, seg.y1, seg.x2, seg.y2, seg.x, seg.y];
    case "Z":
      return [];
  }
}

describe("pen.click.adds-anchor", () => {
  it("commits one straight anchor, no handles, on an under-slop press", () => {
    const result = press({ x: 2, y: 2 }, ctx(), { x: 2.01, y: 2.01 });
    expect(result.action?.type).toBe(clauseAction("pen.click.adds-anchor"));
    const payload = payloadOf(result, penAnchorCommitted);
    expect(payload.anchor).toEqual({ point: { x: 2, y: 2 } });
  });

  it("commits an ordinary anchor on the start point while only 2 anchors exist — no ring to close", () => {
    const result = press({ x: 1, y: 1 }, ctx({ anchors: [anchor(1, 1), anchor(3, 1)] }));
    expect(result.action?.type).toBe(penAnchorCommitted.type);
    expect(payloadOf(result, penAnchorCommitted).anchor).toEqual({ point: { x: 1, y: 1 } });
  });
});

describe("pen.click-drag.adds-curve-anchor", () => {
  it("commits a curve anchor at the press point with the drag as handleOut and its mirror as handleIn", () => {
    const result = press({ x: 1, y: 1 }, ctx(), { x: 1.5, y: 1.4 });
    expect(result.action?.type).toBe(clauseAction("pen.click-drag.adds-curve-anchor"));
    const { anchor: committed } = payloadOf(result, penCurveAnchorCommitted);
    expect(committed.point).toEqual({ x: 1, y: 1 });
    expect(committed.handleOut).toEqual({ x: 1.5, y: 1.4 });
    expect(committed.handleIn?.x).toBeCloseTo(0.5, 6);
    expect(committed.handleIn?.y).toBeCloseTo(0.6, 6);
  });

  it("previews the rubber pen-handle with the mirrored handle while dragging", () => {
    let state = penMachine.begin({ x: 1, y: 1 }, ctx());
    state = penMachine.update(state, { x: 2, y: 2 }, NONE);
    expect(penMachine.preview(state)).toEqual({
      kind: "pen-handle",
      point: { x: 1, y: 1 },
      handleOut: { x: 2, y: 2 },
      handleIn: { x: 0, y: 0 },
    });
  });
});

describe("pen.click-start.closes-path", () => {
  it("commits a schema-valid closed path shape on a press exactly on the first anchor", () => {
    const result = press({ x: 1, y: 1 }, ctx({ anchors: RING }));
    expect(result.action?.type).toBe(clauseAction("pen.click-start.closes-path"));
    const payload = payloadOf(result, penDrawCommitted);
    const shape = shapeOf(payload);
    expect(shape).toMatchObject({ shape: "path", x: 1, y: 1, w: 2, h: 2 });
    const d = shape.d ?? [];
    expect(d[d.length - 1]).toEqual({ c: "Z" });
    expect(() => LayoutObjectSchema.parse(payload.object)).not.toThrow();
  });

  it("honors zoom in the close tolerance: the same inch offset closes at zoom 1 but adds an anchor at zoom 4", () => {
    const offset = 0.05;
    expect(offset).toBeLessThan(penStartToleranceIn(1));
    expect(offset).toBeGreaterThan(penStartToleranceIn(4));

    const closed = press({ x: 1 + offset, y: 1 }, ctx({ anchors: RING, zoom: 1 }));
    expect(closed.action?.type).toBe(penDrawCommitted.type);

    const added = press({ x: 1 + offset, y: 1 }, ctx({ anchors: RING, zoom: 4 }));
    expect(added.action?.type).toBe(penAnchorCommitted.type);
  });
});

describe("pen.esc.discards-path", () => {
  it("cancel returns the gesture/cancelled record", () => {
    const cancelled = penMachine.cancel();
    expect(cancelled.action.type).toBe(clauseAction("pen.esc.discards-path"));
    expect(cancelled.action.type).toBe(gestureCancelled.type);
  });
});

describe("penDraftSegments", () => {
  it("yields nothing for an empty draft and just the M for a single anchor", () => {
    expect(penDraftSegments([])).toEqual([]);
    expect(penDraftSegments([anchor(1, 2)])).toEqual([{ c: "M", x: 1, y: 2 }]);
  });

  it("draws straight anchors as an M followed by L segments", () => {
    expect(penDraftSegments(RING)).toEqual([
      { c: "M", x: 1, y: 1 },
      { c: "L", x: 3, y: 1 },
      { c: "L", x: 3, y: 3 },
    ]);
  });

  it("degenerates a cubic's missing handle to its endpoint — handleOut alone pairs with the destination point", () => {
    const curved: PenAnchor = { point: { x: 0, y: 0 }, handleOut: { x: 1, y: 0 } };
    expect(penDraftSegments([curved, anchor(2, 2)])).toEqual([
      { c: "M", x: 0, y: 0 },
      { c: "C", x1: 1, y1: 0, x2: 2, y2: 2, x: 2, y: 2 },
    ]);
  });
});

describe("penObjectFromDraft", () => {
  it("commits an open path from 2 anchors with no Z", () => {
    const object = penObjectFromDraft([anchor(1, 1), anchor(2, 3)], false, STYLE, "id-1");
    const d = pathOf(object);
    expect(d).toEqual([
      { c: "M", x: 0, y: 0 },
      { c: "L", x: 1, y: 1 },
    ]);
    expect(d.some((seg) => seg.c === "Z")).toBe(false);
    expect(() => LayoutObjectSchema.parse(object)).not.toThrow();
  });

  it("refuses to close with only 2 anchors", () => {
    expect(penObjectFromDraft([anchor(1, 1), anchor(2, 3)], true, STYLE, "id-1")).toBeNull();
  });

  it("normalizes vertices into the anchors' bounding box as the frame", () => {
    const object = penObjectFromDraft(RING, false, STYLE, "id-1");
    expect(object).toMatchObject({ x: 1, y: 1, w: 2, h: 2 });
    expect(pathOf(object)).toEqual([
      { c: "M", x: 0, y: 0 },
      { c: "L", x: 1, y: 0 },
      { c: "L", x: 1, y: 1 },
    ]);
  });

  it("grows the frame box to cover control points so every normalized coordinate stays within [0, 1]", () => {
    const curved: PenAnchor = { point: { x: 1, y: 1 }, handleOut: { x: 1, y: 0 } };
    const object = penObjectFromDraft([curved, anchor(2, 1)], false, STYLE, "id-1");
    // The handle at y=0 sits above both anchors (y=1) — the frame covers it.
    expect(object).toMatchObject({ x: 1, y: 0, w: 1, h: 1 });
    for (const value of pathOf(object).flatMap(segCoords)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("yields null for a degenerate box or too few anchors", () => {
    expect(penObjectFromDraft([anchor(0, 0), anchor(2, 0)], false, STYLE, "id-1")).toBeNull();
    expect(penObjectFromDraft([anchor(1, 1)], false, STYLE, "id-1")).toBeNull();
    expect(penObjectFromDraft([], false, STYLE, "id-1")).toBeNull();
  });
});

describe("finishPenDraft (pen.double-click.commits-open-path)", () => {
  function commitOf(action: UnknownAction | null): DrawCommit {
    if (action === null || !penDrawCommitted.match(action)) {
      throw new Error(`expected a ${penDrawCommitted.type} commit`);
    }
    return action.payload;
  }

  it("resolves an empty draft to no action at all", () => {
    expect(finishPenDraft([], 0, false, STYLE, () => "id-1")).toBeNull();
  });

  it("discards a one-anchor draft with gesture/cancelled", () => {
    const action = finishPenDraft([anchor(1, 1)], 0, false, STYLE, () => "id-1");
    expect(action?.type).toBe(gestureCancelled.type);
  });

  it("commits 2 non-collinear anchors as an open path, passing the pageIndex through", () => {
    const payload = commitOf(finishPenDraft([anchor(1, 1), anchor(2, 3)], 2, false, STYLE, () => "id-1"));
    expect(payload.pageIndex).toBe(2);
    const d = pathOf(shapeOf(payload));
    expect(d.some((seg) => seg.c === "Z")).toBe(false);
    expect(() => LayoutObjectSchema.parse(payload.object)).not.toThrow();
  });

  it("autoClose closes a 3-anchor draft — the committed d ends with Z", () => {
    const payload = commitOf(finishPenDraft(RING, 0, true, STYLE, () => "id-1"));
    const d = pathOf(shapeOf(payload));
    expect(d[d.length - 1]).toEqual({ c: "Z" });
  });

  it("autoClose leaves a 2-anchor draft open — no ring to close", () => {
    const payload = commitOf(finishPenDraft([anchor(1, 1), anchor(2, 3)], 0, true, STYLE, () => "id-1"));
    expect(pathOf(shapeOf(payload)).some((seg) => seg.c === "Z")).toBe(false);
  });
});
