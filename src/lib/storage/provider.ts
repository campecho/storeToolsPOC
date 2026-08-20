import { createFallbackProvider } from "./fallback-provider";
import { createFsaProvider } from "./fsa-provider";
import { createHandleStore } from "./handle-store";
import type { StorageProvider } from "./types";

/**
 * The app-wide provider instance (docs/STORAGE_PLAN.md): File System Access
 * where the pickers exist — Chromium, the store profile — and the
 * download/upload fallback everywhere else. One instance for the whole app,
 * because the retained file handle and the folder grant are app-wide state.
 * e2e forces the fallback with ?storage=fallback (non-production only)
 * since Playwright cannot drive native pickers.
 */

let instance: StorageProvider | null = null;

/** SSR renders the File menu's frame before any browser exists — every
    operation is inert there, and the real provider is created client-side.
    Never cached, so a same-module test environment can still inject. */
const inertProvider: StorageProvider = {
  kind: "fallback",
  supportsFolders: false,
  openFile: () => Promise.resolve(null),
  saveCurrent: () => Promise.resolve(null),
  saveFileAs: () => Promise.resolve(null),
  detachCurrent: () => {},
  chooseDefaultFolder: () => Promise.resolve(null),
  defaultFolderName: () => Promise.resolve(null),
  listDefaultFolder: () => Promise.resolve(null),
  openFromDefaultFolder: () => Promise.resolve(null),
  listRecents: () => Promise.resolve([]),
  openRecent: () => Promise.resolve(null),
};

export function getStorageProvider(): StorageProvider {
  if (instance !== null) return instance;
  if (typeof window === "undefined") return inertProvider;
  const forcedFallback =
    process.env.NODE_ENV !== "production" &&
    new URLSearchParams(window.location.search).get("storage") === "fallback";
  const hasFsa =
    window.showOpenFilePicker !== undefined &&
    window.showSaveFilePicker !== undefined &&
    window.showDirectoryPicker !== undefined;
  instance =
    forcedFallback || !hasFsa
      ? createFallbackProvider(document)
      : createFsaProvider(window, createHandleStore(window.indexedDB));
  return instance;
}

/** Test seam: replace or clear the app-wide instance. */
export function setStorageProviderForTests(provider: StorageProvider | null): void {
  instance = provider;
}
