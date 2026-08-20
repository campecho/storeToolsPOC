import { STAPLES_EXTENSION, STAPLES_MIME, staplesFileName } from "../../core/storage";
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
 * The download/upload tier of the StorageProvider seam (PLAN.md §6.9):
 * feature-detected where the File System Access API is absent, and driven
 * deliberately by e2e (?storage=fallback) because Playwright cannot operate
 * native pickers. The format is identical to the primary tier; what
 * degrades is the transport — no folder control (the browser's download
 * directory wins), no retained handle, so no silent re-save and every Save
 * is a Save As.
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
        // Chromium fires "cancel" on a dismissed file input; browsers that
        // do not simply leave a hidden input behind, which is harmless.
        input.oncancel = () => {
          input.remove();
          resolve(null);
        };
        doc.body.append(input);
        input.click();
      });
    },

    saveCurrent() {
      // No handle to retain on this tier — the caller falls through to
      // saveFileAs, which is the honest behavior: every save re-downloads.
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
      // reliably honored (headless Chromium falls back to "download").
      doc.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      // The browser owns the outcome from here: there is no signal for a
      // cancelled download, so a triggered one counts as saved under the
      // name it was handed — the named limit of this tier, surfaced in the
      // UI copy rather than papered over.
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
