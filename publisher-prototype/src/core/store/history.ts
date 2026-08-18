import { createAction, type Reducer } from "@reduxjs/toolkit";
import type { LayoutDocument } from "../model";
import {
  arrowDrawCommitted,
  bannerDrawCommitted,
  calloutDrawCommitted,
  ellipseDrawCommitted,
  flowchartDrawCommitted,
  lineDrawCommitted,
  objectFillCommitted,
  objectLockCommitted,
  objectMoveCommitted,
  objectNudgeCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  objectStrokePaintCommitted,
  objectStrokeWidthCommitted,
  penDrawCommitted,
  rectDrawCommitted,
  roundedRectDrawCommitted,
  starPolygonDrawCommitted,
} from "./documentActions";
import { documentSlice } from "./documentSlice";

/**
 * Bounded snapshot undo (PLAN.md §6.3): history is a snapshot stack of the
 * document slice, ONE entry per completed gesture — every action in
 * UNDOABLE_ACTION_TYPES pushes the previous `present` and clears `future`.
 * RTK/Immer structural sharing makes the snapshots cheap: each `past` entry
 * is the previous immutable state reference, never a deep clone.
 *
 * Debug/load actions (JSON import, fixture load, stress fixture) are NOT
 * undoable — they replace `present` and clear both stacks, because the
 * document they replace is not a gesture away from the one they load.
 */

export type DocumentHistoryState = {
  past: LayoutDocument[];
  present: LayoutDocument;
  future: LayoutDocument[];
};

/** ASSUMPTION: 100 retained gestures is a working depth — deep enough for a
    session's editing, bounded so 100 structurally-shared snapshots stay
    trivial in memory; the doc names no undo depth. */
export const HISTORY_LIMIT = 100;

/** Document commits that originate in control panels rather than canvas
    gestures. The registry's PanelSpec deliberately carries no gesture
    clauses, so these types have no clause backing — this set is their
    declaration of record, and each panel edit is one history entry exactly
    like a completed canvas gesture. */
export const PANEL_COMMIT_ACTION_TYPES: ReadonlySet<string> = new Set([
  objectFillCommitted.type,
  objectStrokePaintCommitted.type,
  objectStrokeWidthCommitted.type,
  objectLockCommitted.type,
]);

/** Exactly the commit actions that mutate the document per completed
    gesture — canvas gestures plus the panel commits. gesture/cancelled is
    deliberately absent (no reducer, no state change), as are the load/debug
    actions (they reset history instead). */
export const UNDOABLE_ACTION_TYPES: ReadonlySet<string> = new Set([
  rectDrawCommitted.type,
  ellipseDrawCommitted.type,
  lineDrawCommitted.type,
  arrowDrawCommitted.type,
  roundedRectDrawCommitted.type,
  starPolygonDrawCommitted.type,
  calloutDrawCommitted.type,
  bannerDrawCommitted.type,
  flowchartDrawCommitted.type,
  penDrawCommitted.type,
  objectMoveCommitted.type,
  objectNudgeCommitted.type,
  objectResizeCommitted.type,
  objectRotateCommitted.type,
  ...PANEL_COMMIT_ACTION_TYPES,
]);

const HISTORY_RESET_ACTION_TYPES: ReadonlySet<string> = new Set([
  documentSlice.actions.loadedCommitted.type,
  documentSlice.actions.stressFixtureLoaded.type,
  documentSlice.actions.stressFixtureCleared.type,
]);

export const undoCommitted = createAction("history/undoCommitted");
export const redoCommitted = createAction("history/redoCommitted");

/** Higher-order reducer wrapping the document reducer in the past/present/
    future stacks. Undo/redo are no-ops on an empty stack. */
export function withDocumentHistory(base: Reducer<LayoutDocument>): Reducer<DocumentHistoryState> {
  return (state, action) => {
    if (state === undefined) {
      return { past: [], present: base(undefined, action), future: [] };
    }
    if (undoCommitted.match(action)) {
      const previous = state.past[state.past.length - 1];
      if (previous === undefined) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    if (redoCommitted.match(action)) {
      const next = state.future[0];
      if (next === undefined) return state;
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
    const present = base(state.present, action);
    if (UNDOABLE_ACTION_TYPES.has(action.type)) {
      const past =
        state.past.length >= HISTORY_LIMIT
          ? [...state.past.slice(state.past.length - HISTORY_LIMIT + 1), state.present]
          : [...state.past, state.present];
      return { past, present, future: [] };
    }
    if (HISTORY_RESET_ACTION_TYPES.has(action.type)) {
      return { past: [], present, future: [] };
    }
    if (present === state.present) return state;
    return { ...state, present };
  };
}
