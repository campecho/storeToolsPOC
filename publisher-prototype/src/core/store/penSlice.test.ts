import { describe, expect, it } from "vitest";
import { createEmptyDocument, type ShapeObject } from "../model";
import { penTool } from "../registry/tools/shapes";
import { gestureCancelled, penDrawCommitted } from "./documentActions";
import {
  documentLoadedCommitted,
  stressFixtureCleared,
  stressFixtureLoaded,
} from "./documentSlice";
import {
  penAnchorCommitted,
  penAnchorRetracted,
  penCurveAnchorCommitted,
  penSlice,
  type PenAnchor,
  type PenState,
} from "./penSlice";

/**
 * Pen draft slice contract: app state `{ anchors }` in placement order,
 * backed by the registry's pen/* gesture-clause vocabulary; the draft clears
 * wholesale on the path committing, the gesture cancelling, and any document
 * swap.
 */

const { reducer } = penSlice;
const drafted = (anchors: PenAnchor[]): PenState => ({ anchors });

const CURVE_ANCHOR: PenAnchor = {
  point: { x: 2, y: 2 },
  handleOut: { x: 3, y: 2.5 },
  handleIn: { x: 1, y: 1.5 },
};

/** Any valid ShapeObject — the clearing reducers ignore the payload. */
const SHAPE: ShapeObject = {
  id: "shape-1",
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
};

function clauseAction(id: string): string {
  const clause = penTool.gestures.find((g) => g.id === id);
  if (!clause) throw new Error(`missing registry clause ${id}`);
  return clause.action;
}

describe("penSlice", () => {
  it("starts empty", () => {
    expect(penSlice.getInitialState()).toEqual({ anchors: [] });
  });

  it("anchor action types are the registry pen clause strings", () => {
    expect(penSlice.actions.anchorCommitted.type).toBe(clauseAction("pen.click.adds-anchor"));
    expect(penSlice.actions.curveAnchorCommitted.type).toBe(
      clauseAction("pen.click-drag.adds-curve-anchor"),
    );
  });

  it("appends anchors in placement order, storing payload anchors as-is", () => {
    const one = reducer(penSlice.getInitialState(), penAnchorCommitted({ anchor: { point: { x: 1, y: 1 } } }));
    const two = reducer(one, penCurveAnchorCommitted({ anchor: CURVE_ANCHOR }));
    expect(two.anchors).toEqual([{ point: { x: 1, y: 1 } }, CURVE_ANCHOR]);
  });

  it("pops the last anchor on anchorRetracted", () => {
    const next = reducer(
      drafted([{ point: { x: 1, y: 1 } }, CURVE_ANCHOR]),
      penAnchorRetracted(),
    );
    expect(next.anchors).toEqual([{ point: { x: 1, y: 1 } }]);
  });

  it("stays empty when anchorRetracted lands on an empty draft", () => {
    expect(reducer(drafted([]), penAnchorRetracted()).anchors).toEqual([]);
  });

  it("clears on penDrawCommitted — the committed shape ends the draft", () => {
    const next = reducer(
      drafted([{ point: { x: 1, y: 1 } }, { point: { x: 2, y: 2 } }]),
      penDrawCommitted({ pageIndex: 0, object: SHAPE }),
    );
    expect(next.anchors).toEqual([]);
  });

  it("clears on gestureCancelled — the pen.esc.discards-path clause", () => {
    expect(reducer(drafted([CURVE_ANCHOR]), gestureCancelled()).anchors).toEqual([]);
  });

  it("clears when any document-swap action lands", () => {
    const actions = [
      documentLoadedCommitted(createEmptyDocument()),
      stressFixtureLoaded([]),
      stressFixtureCleared(),
    ];
    for (const action of actions) {
      expect(reducer(drafted([{ point: { x: 1, y: 1 } }]), action).anchors).toEqual([]);
    }
  });
});
