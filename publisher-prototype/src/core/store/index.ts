import { configureStore } from "@reduxjs/toolkit";
import type { LayoutDocument } from "../model";
import { viewportSlice } from "./viewportSlice";
import { documentSlice } from "./documentSlice";
import { selectionSlice } from "./selectionSlice";
import { withDocumentHistory } from "./history";

/**
 * Store assembly (PLAN.md §6.3): RTK is framework-free, so the store lives
 * in core; `react-redux` appears only in the shell. The document reducer is
 * wrapped in the bounded snapshot history (history.ts); selection is app
 * state alongside it, never inside it.
 */
export function createAppStore() {
  return configureStore({
    reducer: {
      viewport: viewportSlice.reducer,
      document: withDocumentHistory(documentSlice.reducer),
      selection: selectionSlice.reducer,
    },
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

/** The document consumers render. History internals (past/present/future)
    stay behind this one door — the shell never spells the path itself. */
export function selectDocument(state: RootState): LayoutDocument {
  return state.document.present;
}

export * from "./viewportSlice";
export * from "./documentSlice";
export * from "./documentActions";
export * from "./selectionSlice";
export * from "./history";
