import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { createAppStore, type AppStore } from "./core/store";
import { App } from "./shell/App";
import "./shell/app.css";

declare global {
  interface Window {
    /**
     * Dev-only store handle: gesture-clause e2e tests assert on store state
     * after dispatch (PLAN.md §5 testing note), and Redux DevTools sessions
     * double as living documentation (§6.3).
     */
    __PROTOTYPE_STORE__?: AppStore;
  }
}

const container = document.getElementById("root");
if (!container) throw new Error("index.html must provide #root");

const store = createAppStore();
if (import.meta.env.DEV) {
  window.__PROTOTYPE_STORE__ = store;
}

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
