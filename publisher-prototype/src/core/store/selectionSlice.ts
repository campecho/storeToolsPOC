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
 * align/distribute tooling relies on.
 *
 * Shape notes:
 * - Every clause commits a UNIT of ids rather than one id: a click on a
 *   grouped object selects its whole group (core/model/groups.ts resolves
 *   which objects that is), and a lone object is simply a unit of one.
 * - `enteredGroupId` is the group context the user has descended into
 *   (select.double-click-group.enters-group) — inside it, clicks reach the
 *   group's members instead of the group. Null is the page's top level.
 *   The shell resolves the context each click ends in and sends it with the
 *   ids, so the two can never disagree.
 * - Selected ids that vanish from the document cannot happen yet — no
 *   delete action exists; pruning arrives with it. An undone draw is the
 *   near miss: the id stays selected and simply matches nothing, exactly as
 *   it did before drawing selected its result.
 */

export type SelectionState = { ids: string[]; enteredGroupId: string | null };

const initialState: SelectionState = { ids: [], enteredGroupId: null };

export const selectionSlice = createSlice({
  name: "selection",
  initialState,
  reducers: {
    /** select.click.selects-topmost · node-select.esc.exits-to-object · frame double-click entries */
    replaceCommitted(
      state,
      action: PayloadAction<{ ids: string[]; enteredGroupId?: string | null }>,
    ) {
      state.ids = action.payload.ids;
      state.enteredGroupId = action.payload.enteredGroupId ?? null;
    },
    /** select.click-empty.clears — the empty canvas is outside every group,
        so clearing also leaves whatever group was entered. */
    clearedCommitted(state) {
      state.ids = [];
      state.enteredGroupId = null;
    },
    /** select.shift-click.toggles-membership — the unit toggles whole: a
        group already selected leaves entirely, otherwise its missing members
        join in selection order. */
    toggleCommitted(state, action: PayloadAction<{ ids: string[] }>) {
      const { ids } = action.payload;
      if (ids.length === 0) return;
      if (ids.every((id) => state.ids.includes(id))) {
        state.ids = state.ids.filter((id) => !ids.includes(id));
        return;
      }
      state.ids.push(...ids.filter((id) => !state.ids.includes(id)));
    },
    /** select.alt-click.selects-beneath — the payload is the new selection;
        stacking-order cycling lives upstream in hit-testing. It relocates the
        selection wholesale, so it carries its context exactly like a plain
        click: cycling to something outside the entered group leaves it. */
    cycleCommitted(
      state,
      action: PayloadAction<{ ids: string[]; enteredGroupId?: string | null }>,
    ) {
      state.ids = action.payload.ids;
      state.enteredGroupId = action.payload.enteredGroupId ?? null;
    },
    /** select.drag-empty.marquee-selects — one sweep can cross several
        contexts, so it resolves units in the current one and leaves it
        standing rather than picking a level for the user. */
    marqueeCommitted(state, action: PayloadAction<{ ids: string[] }>) {
      state.ids = action.payload.ids;
    },
    /** select.double-click-group.enters-group — descends one level into the
        group and selects the unit found there (a nested subgroup whole, or
        the member itself at the innermost level). */
    groupEnteredCommitted(state, action: PayloadAction<{ groupId: string; ids: string[] }>) {
      state.ids = action.payload.ids;
      state.enteredGroupId = action.payload.groupId;
    },
  },
  extraReducers: (builder) => {
    // A drawn object lands SELECTED: the thing just made is the thing you
    // want to style or move, and the panels bind to the selection, so this
    // is what puts a new shape's own parameters in reach immediately.
    builder.addMatcher(isDrawCommit, (state, action) => {
      state.ids = [action.payload.object.id];
      state.enteredGroupId = null;
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
        state.enteredGroupId = null;
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
