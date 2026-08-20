import { createFallbackProvider } from "./fallbackProvider";
import { createFsaProvider } from "./fsaProvider";
import { createHandleStore } from "./handleStore";
import type { StorageProvider } from "./types";

/**
 * Picks the storage tier (PLAN.md §6.9): File System Access where the
 * pickers exist — Chromium, the store profile — and the download/upload
 * fallback everywhere else. e2e forces the fallback with ?storage=fallback
 * (dev-only, the __PROTOTYPE_STORE__ precedent) because Playwright cannot
 * drive native pickers; the FSA tier is unit-tested over injected fakes
 * instead.
 */
export function createStorageProvider(): StorageProvider {
  const forcedFallback =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("storage") === "fallback";
  const hasFsa =
    window.showOpenFilePicker !== undefined &&
    window.showSaveFilePicker !== undefined &&
    window.showDirectoryPicker !== undefined;
  if (forcedFallback || !hasFsa) return createFallbackProvider(document);
  return createFsaProvider(window, createHandleStore(window.indexedDB));
}
