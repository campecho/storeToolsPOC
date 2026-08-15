import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * Pre-schema document state. Schema v3 (PLAN.md §6.6) replaces this slice's
 * types wholesale in its own Phase A slice; this exists only so the canvas
 * foundation has a page to draw and enough objects to exercise the §6.2
 * spike gates. Nothing here is a document-model decision.
 */

/** Page geometry in canonical inches. Defaults: US Letter, 1/8" bleed, 1/2" margin. */
export type PageSetup = {
  widthIn: number;
  heightIn: number;
  bleedIn: number;
  marginIn: number;
};

/** A flat rectangle for the stress fixture — not a schema-v3 object. */
export type PlaceholderObject = {
  id: string;
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
  rotationDeg: number;
  fill: string;
};

export type DocumentState = {
  page: PageSetup;
  objects: PlaceholderObject[];
};

const initialState: DocumentState = {
  page: { widthIn: 8.5, heightIn: 11, bleedIn: 0.125, marginIn: 0.5 },
  objects: [],
};

export const documentSlice = createSlice({
  name: "document",
  initialState,
  reducers: {
    /** Debug bar: load the deterministic spike-gate fixture. */
    stressFixtureLoaded(state, action: PayloadAction<{ objects: PlaceholderObject[] }>) {
      state.objects = action.payload.objects;
    },
    /** Debug bar: back to the empty page. */
    stressFixtureCleared(state) {
      state.objects = [];
    },
  },
});

export const { stressFixtureLoaded, stressFixtureCleared } = documentSlice.actions;
