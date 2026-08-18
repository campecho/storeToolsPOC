import { createSlice, isAnyOf, type PayloadAction } from "@reduxjs/toolkit";
import { isDrawCommit } from "./documentActions";
import { documentSlice } from "./documentSlice";

/**
 * Selection slice (PLAN.md §6.3): selection is APP state, not document
 * state — it never serializes with the document and never enters undo
 * history. Action types ARE the registry's selection/* gesture-clause
 * vocabulary (viewportSlice discipline).
 *
 * `ids` order is selection order (first-selected first), which
 * align/distribute tooling will rely on.
 *
 * Shape notes:
 * - groupEnteredCommitted selects the entered object only; group-context
 *   state (which group is "open") arrives with the Phase B group tooling,
 *   and the state shape stays `{ ids }` until then.
 * - Selected ids that vanish from the document cannot happen yet — no
 *   delete action exists; pruning arrives with it. An undone draw is the
 *   near miss: the id stays selected and simply matches nothing, exactly as
 *   it did before drawing selected its result.
 */

export type SelectionState = { ids: string[] };

const initialState: SelectionState = { ids: [] };

export const selectionSlice = createSlice({
  name: "selection",
  initialState,
  reducers: {
    /** select.click.selects-topmost · node-select.esc.exits-to-object · frame double-click entries */
    replaceCommitted(state, action: PayloadAction<{ ids: string[] }>) {
      state.ids = action.payload.ids;
    },
    /** select.click-empty.clears */
    clearedCommitted(state) {
      state.ids = [];
    },
    /** select.shift-click.toggles-membership */
    toggleCommitted(state, action: PayloadAction<{ id: string }>) {
      const at = state.ids.indexOf(action.payload.id);
      if (at === -1) state.ids.push(action.payload.id);
      else state.ids.splice(at, 1);
    },
    /** select.alt-click.selects-beneath — the payload is the new single
        selection; stacking-order cycling lives upstream in hit-testing. */
    cycleCommitted(state, action: PayloadAction<{ id: string }>) {
      state.ids = [action.payload.id];
    },
    /** select.drag-empty.marquee-selects */
    marqueeCommitted(state, action: PayloadAction<{ ids: string[] }>) {
      state.ids = action.payload.ids;
    },
    /** select.double-click-group.enters-group — selects the member only for
        now; the groupId is carried for the Phase B group-context state. */
    groupEnteredCommitted(state, action: PayloadAction<{ groupId: string; id: string }>) {
      state.ids = [action.payload.id];
    },
  },
  extraReducers: (builder) => {
    // A drawn object lands SELECTED: the thing just made is the thing you
    // want to style or move, and the panels bind to the selection, so this
    // is what puts a new shape's own parameters in reach immediately.
    builder.addMatcher(isDrawCommit, (state, action) => {
      state.ids = [action.payload.object.id];
    });
    // A document swap invalidates every selected id wholesale.
    builder.addMatcher(
      isAnyOf(
        documentSlice.actions.loadedCommitted,
        documentSlice.actions.stressFixtureLoaded,
        documentSlice.actions.stressFixtureCleared,
      ),
      (state) => {
        state.ids = [];
      },
    );
  },
});

export const {
  replaceCommitted: selectionReplaceCommitted,
  clearedCommitted: selectionClearedCommitted,
  toggleCommitted: selectionToggleCommitted,
  cycleCommitted: selectionCycleCommitted,
  marqueeCommitted: selectionMarqueeCommitted,
  groupEnteredCommitted: selectionGroupEnteredCommitted,
} = selectionSlice.actions;
