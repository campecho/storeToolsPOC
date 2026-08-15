import { configureStore } from "@reduxjs/toolkit";
import { viewportSlice } from "./viewportSlice";
import { documentSlice } from "./documentSlice";

/**
 * Store assembly (PLAN.md §6.3): RTK is framework-free, so the store lives
 * in core; `react-redux` appears only in the shell.
 */
export function createAppStore() {
  return configureStore({
    reducer: {
      viewport: viewportSlice.reducer,
      document: documentSlice.reducer,
    },
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export * from "./viewportSlice";
export * from "./documentSlice";
