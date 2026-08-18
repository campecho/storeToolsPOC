import { describe, expect, it } from "vitest";
import {
  createEmptyDocument,
  type LayoutDocument,
  type Paint,
  type ShapeObject,
} from "../model";
import {
  gestureCancelled,
  objectFillCommitted,
  objectLockCommitted,
  objectMoveCommitted,
  objectStrokePaintCommitted,
  objectStrokeWidthCommitted,
  rectDrawCommitted,
} from "./documentActions";
import {
  documentLoadedCommitted,
  documentSlice,
  stressFixtureCleared,
  stressFixtureLoaded,
} from "./documentSlice";
import {
  HISTORY_LIMIT,
  inEditRun,
  redoCommitted,
  undoCommitted,
  withDocumentHistory,
  type DocumentHistoryState,
} from "./history";

/**
 * History contract (PLAN.md §6.3): one snapshot per undoable gesture commit,
 * pushed as the previous immutable reference (structural sharing, no deep
 * clone), bounded at HISTORY_LIMIT; undo/redo walk the stacks and no-op when
 * empty; document-swap actions replace present and clear both stacks;
 * everything else passes through without touching history.
 */

const reducer = withDocumentHistory(documentSlice.reducer);

const BLACK: Paint = { kind: "color", color: { space: "rgb", values: [0, 0, 0] } };
/** The stroke width edit runs start from, in points. */
const BASE_STROKE_WIDTH = 0.75;

function shape(id: string): ShapeObject {
  return {
    type: "shape",
    shape: "rect",
    id,
    x: 1,
    y: 1,
    w: 1,
    h: 1,
    rotation: 0,
    locked: false,
    fill: null,
    stroke: { paint: BLACK, width: BASE_STROKE_WIDTH },
  };
}

/** The commit a live width field dispatches, against the drawn shape. */
function strokeWidth(width: number) {
  return objectStrokeWidthCommitted({ pageIndex: 0, ids: ["a"], width });
}

function strokeWidthOf(doc: LayoutDocument): number | null {
  const obj = doc.pages[0]?.objects[0];
  if (obj === undefined || obj.type !== "shape") return null;
  return obj.stroke?.width ?? null;
}

function boot(): DocumentHistoryState {
  return reducer(undefined, { type: "@@INIT" });
}

function draw(state: DocumentHistoryState, id: string): DocumentHistoryState {
  return reducer(state, rectDrawCommitted({ pageIndex: 0, object: shape(id) }));
}

function objectCount(doc: LayoutDocument): number {
  return doc.pages[0]?.objects.length ?? 0;
}

describe("withDocumentHistory", () => {
  it("boots with empty stacks around the base initial state", () => {
    const state = boot();
    expect(state.past).toEqual([]);
    expect(state.future).toEqual([]);
    expect(state.present).toEqual(createEmptyDocument());
  });

  it("pushes the previous present BY REFERENCE on each undoable action and clears future", () => {
    const initial = boot();
    const one = draw(initial, "a");
    expect(one.past).toHaveLength(1);
    expect(one.past[0]).toBe(initial.present);
    expect(objectCount(one.present)).toBe(1);

    const two = draw(one, "b");
    expect(two.past).toHaveLength(2);
    expect(two.past[1]).toBe(one.present);
    expect(two.future).toEqual([]);
  });

  it("round-trips through undo and redo, restoring the exact snapshots", () => {
    const initial = boot();
    const one = draw(initial, "a");
    const two = draw(one, "b");

    const undone = reducer(two, undoCommitted());
    expect(undone.present).toBe(one.present);
    expect(undone.past).toHaveLength(1);
    expect(undone.future).toEqual([two.present]);

    const redone = reducer(undone, redoCommitted());
    expect(redone.present).toBe(two.present);
    expect(redone.past).toHaveLength(2);
    expect(redone.future).toEqual([]);
  });

  it("no-ops undo with an empty past and redo with an empty future", () => {
    const state = boot();
    expect(reducer(state, undoCommitted())).toBe(state);
    expect(reducer(state, redoCommitted())).toBe(state);
  });

  it("clears future on a new commit after undo — the redo branch is gone", () => {
    const two = draw(draw(boot(), "a"), "b");
    const undone = reducer(two, undoCommitted());
    const diverged = draw(undone, "c");
    expect(diverged.future).toEqual([]);
    expect(objectCount(diverged.present)).toBe(2);
  });

  it("caps past at HISTORY_LIMIT, dropping the oldest snapshots", () => {
    let state = boot();
    const extra = 5;
    for (let i = 0; i < HISTORY_LIMIT + extra; i++) {
      state = draw(state, `s-${i}`);
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT);
    // The oldest retained snapshot is the state after the first `extra` draws.
    const oldest = state.past[0];
    if (!oldest) throw new Error("past must not be empty");
    expect(objectCount(oldest)).toBe(extra);
    expect(objectCount(state.present)).toBe(HISTORY_LIMIT + extra);
  });

  it("replaces present and clears both stacks on load and stress-fixture actions", () => {
    const swaps = [
      documentLoadedCommitted(createEmptyDocument()),
      stressFixtureLoaded([shape("s")]),
      stressFixtureCleared(),
    ];
    for (const action of swaps) {
      const undone = reducer(draw(draw(boot(), "a"), "b"), undoCommitted());
      expect(undone.past).not.toHaveLength(0);
      expect(undone.future).not.toHaveLength(0);
      const swapped = reducer(undone, action);
      expect(swapped.past).toEqual([]);
      expect(swapped.future).toEqual([]);
    }
  });

  it("pushes nothing for non-undoable actions", () => {
    const state = draw(boot(), "a");
    expect(reducer(state, gestureCancelled())).toBe(state);
    expect(reducer(state, { type: "viewport/panCommitted", payload: { pan: { x: 0, y: 0 } } })).toBe(
      state,
    );
  });

  it("takes one entry per panel commit — fill, stroke, and lock are gestures too", () => {
    const state = draw(boot(), "a");
    const red: Paint = { kind: "color", color: { space: "rgb", values: [1, 0, 0] } };
    let next = reducer(state, objectFillCommitted({ pageIndex: 0, ids: ["a"], fill: red }));
    next = reducer(next, objectStrokePaintCommitted({ pageIndex: 0, ids: ["a"], paint: red }));
    next = reducer(next, objectLockCommitted({ pageIndex: 0, ids: ["a"], locked: true }));
    expect(next.past).toHaveLength(4);
    const undone = reducer(reducer(reducer(next, undoCommitted()), undoCommitted()), undoCommitted());
    expect(undone.present).toBe(state.present);
  });

  it("folds an edit run into one entry, whatever it passes through", () => {
    const state = draw(boot(), "a");
    // A field applying every keystroke: 1 → 12 → 1.25pt, all one visit.
    let next = state;
    for (const width of [1, 12, 1.25]) {
      next = reducer(next, inEditRun(strokeWidth(width), "field#1"));
    }
    expect(next.past).toHaveLength(2);
    expect(next.past[1]).toBe(state.present);
    expect(strokeWidthOf(next.present)).toBe(1.25);
    // One undo reverses the whole run, not the last keystroke of it.
    expect(reducer(next, undoCommitted()).present).toBe(state.present);
  });

  it("starts a new entry for each run — one visit to the field, one step", () => {
    const state = draw(boot(), "a");
    const first = reducer(state, inEditRun(strokeWidth(2), "field#1"));
    const second = reducer(first, inEditRun(strokeWidth(3), "field#2"));
    expect(second.past).toHaveLength(3);
    expect(strokeWidthOf(reducer(second, undoCommitted()).present)).toBe(2);
  });

  it("never folds a run into an entry a discrete commit pushed", () => {
    // Same run id either side of an unrelated commit: the entry the run
    // opened is no longer the newest one, so the run reopens its own.
    const state = reducer(draw(boot(), "a"), inEditRun(strokeWidth(2), "field#1"));
    const between = reducer(state, objectMoveCommitted({ pageIndex: 0, ids: ["a"], dx: 1, dy: 0 }));
    const after = reducer(between, inEditRun(strokeWidth(3), "field#1"));
    expect(after.past).toHaveLength(4);
  });

  it("closes the run on undo, so a continuation cannot reopen the stepped-past entry", () => {
    const state = draw(boot(), "a");
    const run = reducer(state, inEditRun(strokeWidth(2), "field#1"));
    const undone = reducer(run, undoCommitted());
    const resumed = reducer(undone, inEditRun(strokeWidth(3), "field#1"));
    expect(resumed.past).toHaveLength(2);
    expect(strokeWidthOf(reducer(resumed, undoCommitted()).present)).toBe(BASE_STROKE_WIDTH);
  });

  it("passes an unstamped action through as its own entry", () => {
    const state = draw(boot(), "a");
    const one = reducer(state, strokeWidth(2));
    const two = reducer(one, strokeWidth(3));
    expect(two.past).toHaveLength(3);
  });

  it("snapshots per gesture even when the commit changes nothing visible", () => {
    // A commit against unknown ids still completed a gesture — one entry per
    // completed gesture is the invariant, not one entry per diff.
    const state = draw(boot(), "a");
    const next = reducer(state, objectMoveCommitted({ pageIndex: 0, ids: ["ghost"], dx: 1, dy: 1 }));
    expect(next.past).toHaveLength(2);
    expect(next.past[1]).toBe(state.present);
  });
});
