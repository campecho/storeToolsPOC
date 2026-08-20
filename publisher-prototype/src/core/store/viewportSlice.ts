import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { clampZoom, type Viewport } from "../geometry/viewport";

/**
 * Viewport state (PLAN.md §6.3). Action types ARE the registry's gesture-
 * clause vocabulary: `viewport/zoomWheelCommitted` is the committed form of
 * the clause `zoom.wheel.ctrl-zooms-at-cursor`, and so on — the contract,
 * the action, and the test share one string.
 *
 * Payloads carry a complete next viewport computed by the pure geometry
 * (core/geometry/viewport.ts); reducers re-clamp zoom so no dispatch path
 * can exceed the working range. Distinct action types per gesture keep the
 * DevTools timeline readable as documentation, deliberately, even though
 * the reducers coincide.
 *
 * Viewport changes never enter document history (registry: undo "none").
 */

const initialState: Viewport = { zoom: 1, pan: { x: 0, y: 0 } };

function applyViewport(_state: Viewport, action: PayloadAction<Viewport>): Viewport {
  return { zoom: clampZoom(action.payload.zoom), pan: action.payload.pan };
}

export const viewportSlice = createSlice({
  name: "viewport",
  initialState,
  reducers: {
    /** zoom.click.steps-in · zoom.alt-click.steps-out ·
        viewport.ctrl-plus.steps-in · viewport.ctrl-minus.steps-out */
    zoomStepCommitted: applyViewport,
    /** zoom.wheel.ctrl-zooms-at-cursor */
    zoomWheelCommitted: applyViewport,
    /** viewport.ctrl-zero.fits-page, and the debug bar's Fit control. */
    zoomFitCommitted: applyViewport,
    /** Debug-bar direct zoom entry. */
    zoomSetCommitted: applyViewport,
    /** pan.drag.moves-viewport · pan.space-drag.temporary-pan · pan.wheel.scrolls */
    panCommitted(state, action: PayloadAction<{ pan: Viewport["pan"] }>) {
      state.pan = action.payload.pan;
    },
  },
});

export const {
  zoomStepCommitted,
  zoomWheelCommitted,
  zoomFitCommitted,
  zoomSetCommitted,
  panCommitted,
} = viewportSlice.actions;
