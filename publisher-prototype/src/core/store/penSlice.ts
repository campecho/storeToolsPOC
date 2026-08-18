import { createSlice, isAnyOf, type PayloadAction } from "@reduxjs/toolkit";
import { gestureCancelled, penDrawCommitted } from "./documentActions";
import { documentSlice } from "./documentSlice";

/**
 * Pen draft slice (PLAN.md §6.3; pen tool contract in
 * src/core/registry/tools/shapes.ts): the in-progress pen path is APP state,
 * like selection — it never serializes with the document and never enters
 * document history. It lives in the store rather than in gesture state
 * because the pen contract makes each ANCHOR PLACEMENT its own committed
 * gesture ("per-gesture undo steps back one anchor at a time"): every click
 * dispatches one anchor action, and the shell's undo path retracts anchors
 * while a draft is active instead of popping document history.
 *
 * The draft clears on: the path committing (pen/drawCommitted), the draft
 * being discarded (gesture/cancelled — the pen.esc.discards-path clause; see
 * the note on gestureCancelled in documentActions.ts), and any document
 * swap.
 */

/** One placed anchor. Handles are absent on straight anchors; a curve anchor
    carries both, mirrored about the point at placement (the machine builds
    the complete payload — reducers only apply). Coordinates are canonical
    document inches. */
export type PenAnchor = {
  point: { x: number; y: number };
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
};

export type PenState = { anchors: PenAnchor[] };

const initialState: PenState = { anchors: [] };

export const penSlice = createSlice({
  name: "pen",
  initialState,
  reducers: {
    /** pen.click.adds-anchor */
    anchorCommitted(state, action: PayloadAction<{ anchor: PenAnchor }>) {
      state.anchors.push(action.payload.anchor);
    },
    /** pen.click-drag.adds-curve-anchor — same appender, distinct clause
        action so the DevTools timeline and tests read the gesture. */
    curveAnchorCommitted(state, action: PayloadAction<{ anchor: PenAnchor }>) {
      state.anchors.push(action.payload.anchor);
    },
    /** The draft's undo step (the contract's one-anchor-at-a-time rule):
        dispatched by the shell's undo path while a draft is active. Not a
        registry clause — it is the undo mechanism, not a canvas gesture. */
    anchorRetracted(state) {
      state.anchors.pop();
    },
  },
  extraReducers: (builder) => {
    builder
      // The committed shape ends the draft; a cancelled gesture discards it.
      .addCase(penDrawCommitted, (state) => {
        state.anchors = [];
      })
      .addCase(gestureCancelled, (state) => {
        state.anchors = [];
      })
      .addMatcher(
        isAnyOf(
          documentSlice.actions.loadedCommitted,
          documentSlice.actions.stressFixtureLoaded,
          documentSlice.actions.stressFixtureCleared,
        ),
        (state) => {
          state.anchors = [];
        },
      );
  },
});

export const {
  anchorCommitted: penAnchorCommitted,
  curveAnchorCommitted: penCurveAnchorCommitted,
  anchorRetracted: penAnchorRetracted,
} = penSlice.actions;
