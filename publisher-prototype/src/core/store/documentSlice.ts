import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { blankDocument } from "../model/defaults";
import type { Document, PageSetup } from "../model/document";
import type { LayoutObject } from "../model/objects";

/**
 * The document slice (PLAN.md §6.3, §6.6). State is a schema v3 `Document` —
 * the model owns the shape, this slice owns only the transitions.
 *
 * Document history (one entry per completed gesture) arrives with the gesture
 * pipeline; the reducers here are the two debug transitions the canvas
 * foundation needs plus the round-trip's import.
 */

export type DocumentState = Document;

const initialState: DocumentState = blankDocument();

/**
 * The page geometry the canvas draws, in canonical inches. Derived rather than
 * stored: §1.4 lets a page override the document's setup, so "the current
 * page's size" is a resolution, not a field.
 */
export type PageGeometry = {
  widthIn: number;
  heightIn: number;
  bleedIn: number;
  marginIn: number;
};

export function pageGeometry(setup: PageSetup): PageGeometry {
  return {
    widthIn: setup.trim.wIn,
    heightIn: setup.trim.hIn,
    bleedIn: setup.bleedIn,
    marginIn: setup.marginIn,
  };
}

/** The setup in force for a page: its own override, else the document's. */
export function effectivePageSetup(doc: Document, pageIndex = 0): PageSetup {
  return doc.pages[pageIndex]?.setup ?? doc.setup;
}

export const documentSlice = createSlice({
  name: "document",
  initialState,
  reducers: {
    /** Debug bar: replace the document wholesale — the round-trip's import. */
    documentReplaced(_state, action: PayloadAction<Document>) {
      return action.payload;
    },
    /** Debug bar: load the deterministic spike-gate fixture onto page 1. */
    stressFixtureLoaded(state, action: PayloadAction<{ objects: LayoutObject[] }>) {
      const page = state.pages[0];
      if (page) page.objects = action.payload.objects;
    },
    /** Debug bar: back to the empty page. */
    stressFixtureCleared(state) {
      const page = state.pages[0];
      if (page) page.objects = [];
    },
  },
});

export const { documentReplaced, stressFixtureLoaded, stressFixtureCleared } =
  documentSlice.actions;
