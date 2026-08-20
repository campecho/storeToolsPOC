import { STAPLES_EXTENSION, STAPLES_MIME, staplesFileName } from "./container";
import type { StorageProvider } from "./types";

/** The download attribute silently loses names carrying characters outside a
    conservative set — headless Chromium falls back to "download" wholesale on
    an em dash. The FSA tier keeps full names (the picker owns them); this
    tier trades exotic characters for a name that reliably survives, and
    reports the name it actually used. */
export function downloadSafeName(name: string): string {
  const safe = name
    .replace(/[^\w .()-]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return /\w/.test(safe) ? staplesFileName(safe) : `document${STAPLES_EXTENSION}`;
}

/**
 * Download/upload tier of the StorageProvider seam (docs/STORAGE_PLAN.md):
 * feature-detected where File System Access is absent, and driven by e2e
 * (?storage=fallback) because Playwright cannot operate native pickers. The
 * format is identical; what degrades is the transport — no folder control,
 * no retained handle, every save a fresh download.
 */
export function createFallbackProvider(doc: Document): StorageProvider {
  return {
    kind: "fallback",
    supportsFolders: false,

    openFile() {
      return new Promise((resolve, reject) => {
        const input = doc.createElement("input");
        input.type = "file";
        input.accept = STAPLES_EXTENSION;
        input.style.display = "none";
        input.setAttribute("aria-label", "Open document file");
        input.onchange = () => {
          const file = input.files?.[0];
          input.remove();
          if (file === undefined) {
            resolve(null);
            return;
          }
          file.arrayBuffer().then(
            (buffer) => resolve({ name: file.name, bytes: new Uint8Array(buffer) }),
            (error: unknown) => reject(error instanceof Error ? error : new Error(String(error))),
          );
        };
        input.oncancel = () => {
          input.remove();
          resolve(null);
        };
        doc.body.append(input);
        input.click();
      });
    },

    saveCurrent() {
      // No handle on this tier — the caller falls through to saveFileAs.
      return Promise.resolve(null);
    },

    saveFileAs(suggestedName, bytes) {
      const downloadName = downloadSafeName(suggestedName);
      const blob = new Blob([bytes as BlobPart], { type: STAPLES_MIME });
      const url = URL.createObjectURL(blob);
      const anchor = doc.createElement("a");
      anchor.href = url;
      anchor.download = downloadName;
      anchor.style.display = "none";
      // In the DOM for the click: a detached anchor's download name is not
      // reliably honored.
      doc.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      // No signal exists for a cancelled download, so a triggered one counts
      // as saved under the name it was handed — this tier's named limit.
      return Promise.resolve(downloadName);
    },

    detachCurrent() {},

    chooseDefaultFolder: () => Promise.resolve(null),
    defaultFolderName: () => Promise.resolve(null),
    listDefaultFolder: () => Promise.resolve(null),
    openFromDefaultFolder: () => Promise.resolve(null),
    listRecents: () => Promise.resolve([]),
    openRecent: () => Promise.resolve(null),
  };
}
