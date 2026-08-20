import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Group, LayoutObject } from "../model";
import { objectPasteCommitted } from "./documentActions";

/**
 * Clipboard slice (PLAN.md §6.3): the objects a cut or copy is holding.
 *
 * APP state, like selection — it never serializes with the document and never
 * enters undo history. Undoing a paste removes the pasted objects; it does
 * not un-copy what the clipboard holds, because copying changed no document.
 *
 * The clipboard stores the ORIGINALS as they were at copy time, not copies:
 * fresh ids are minted at paste, once per paste, so pasting twice yields two
 * independent sets rather than two references to one. Cut stores the same
 * snapshot before the delete commits, which is what lets cut-then-undo leave
 * the clipboard intact.
 *
 * `pastes` counts how many times the current contents have been pasted, so
 * successive pastes cascade instead of stacking exactly on top of each other
 * (document.ctrl-v.pastes-clipboard). Copying again resets the count.
 *
 * A document swap does NOT clear this, though it clears the selection: a
 * selection is ids into the document that just went away, while the clipboard
 * holds whole objects that stand on their own. Keeping them is what makes
 * copying from one document and pasting into another work at all.
 */

export type ClipboardState = {
  objects: LayoutObject[];
  /** The groups those objects sit in, as `copiedGroups` resolved them. */
  groups: Group[];
  pastes: number;
};

const initialState: ClipboardState = { objects: [], groups: [], pastes: 0 };

export const clipboardSlice = createSlice({
  name: "clipboard",
  initialState,
  reducers: {
    /** document.ctrl-c.copies-selection · document.ctrl-x.cuts-selection */
    copyCommitted(state, action: PayloadAction<{ objects: LayoutObject[]; groups: Group[] }>) {
      state.objects = action.payload.objects;
      state.groups = action.payload.groups;
      state.pastes = 0;
    },
  },
  extraReducers: (builder) => {
    // The cascade advances on the paste itself rather than on a second action:
    // one keystroke stays one commit per §6.3, and the count can never drift
    // from the number of pastes that actually landed.
    builder.addMatcher(objectPasteCommitted.match, (state) => {
      state.pastes += 1;
    });
  },
});

export const { copyCommitted: clipboardCopyCommitted } = clipboardSlice.actions;
