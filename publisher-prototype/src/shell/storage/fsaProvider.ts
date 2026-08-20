import { STAPLES_EXTENSION, STAPLES_MIME } from "../../core/storage";
import type { HandleStore } from "./handleStore";
import type { FolderEntry, OpenedFile, RecentEntry, StorageProvider } from "./types";

/**
 * The File System Access implementation of the StorageProvider seam
 * (PLAN.md §6.9) — the primary tier, Chromium on the store profile. Real
 * files, a retained handle for silent Ctrl+S, and the default folder as a
 * persisted directory grant: pickers start in it, and the in-app Open
 * listing enumerates it with no OS dialog at all.
 *
 * The window surface is injected so the picker calls can be faked in node
 * tests — Playwright cannot drive native pickers, which is exactly why the
 * seam exists (§6.9's testing note).
 */

export type FsaWindow = Pick<
  Window,
  "showOpenFilePicker" | "showSaveFilePicker" | "showDirectoryPicker"
>;

/** One picker id = one remembered location per purpose; the default-folder
    handle passed as startIn overrides it whenever a grant exists. */
const PICKER_ID = "staples-documents";

const FILE_TYPES = [
  { description: "Staples document", accept: { [STAPLES_MIME]: [STAPLES_EXTENSION] } },
];

function isPickerCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function ensurePermission(
  handle: FileSystemHandle,
  mode: "read" | "readwrite",
): Promise<boolean> {
  // A handle restored from IndexedDB comes back with its grant in "prompt"
  // until the user re-affirms it — or in "granted" under Chromium's
  // persistent permissions ("Allow on every visit"), which is what makes the
  // default folder a one-time setup. Both methods are optional (Chromium-
  // only); a runtime without them can only try the operation and let it
  // throw.
  if (handle.queryPermission === undefined || handle.requestPermission === undefined) return true;
  if ((await handle.queryPermission({ mode })) === "granted") return true;
  return (await handle.requestPermission({ mode })) === "granted";
}

async function readHandle(handle: FileSystemFileHandle): Promise<OpenedFile> {
  const file = await handle.getFile();
  return { name: handle.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

async function writeHandle(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  // createWritable stages the bytes and swaps them in on close() — the
  // atomic write §13.2 requires, for free.
  const writable = await handle.createWritable();
  // fflate types its output over ArrayBufferLike; it always allocates plain
  // ArrayBuffers, which is what the write sink's typing insists on.
  await writable.write(bytes as Uint8Array<ArrayBuffer>);
  await writable.close();
}

export function createFsaProvider(w: FsaWindow, store: HandleStore): StorageProvider {
  let currentHandle: FileSystemFileHandle | null = null;

  const startIn = async (): Promise<FileSystemHandle | undefined> =>
    (await store.getDefaultFolder()) ?? undefined;

  const retainAndRead = async (handle: FileSystemFileHandle): Promise<OpenedFile> => {
    const opened = await readHandle(handle);
    currentHandle = handle;
    await store.pushRecent({ name: handle.name, handle });
    return opened;
  };

  const grantedDefaultFolder = async (): Promise<FileSystemDirectoryHandle | null> => {
    const dir = await store.getDefaultFolder();
    if (dir === null) return null;
    if (!(await ensurePermission(dir, "read"))) {
      throw new Error(
        `Access to "${dir.name}" was not granted. Re-affirm the permission, or choose the folder again.`,
      );
    }
    return dir;
  };

  return {
    kind: "fsa",
    supportsFolders: true,

    async openFile() {
      const picker = w.showOpenFilePicker;
      if (picker === undefined) return null;
      let handles: FileSystemFileHandle[];
      try {
        handles = await picker.call(w, {
          id: PICKER_ID,
          multiple: false,
          types: FILE_TYPES,
          startIn: await startIn(),
        });
      } catch (error) {
        if (isPickerCancel(error)) return null;
        throw error;
      }
      const handle = handles[0];
      return handle === undefined ? null : retainAndRead(handle);
    },

    async saveCurrent(bytes) {
      if (currentHandle === null) return null;
      if (!(await ensurePermission(currentHandle, "readwrite"))) {
        throw new Error(`Write permission for "${currentHandle.name}" was not granted.`);
      }
      await writeHandle(currentHandle, bytes);
      return currentHandle.name;
    },

    async saveFileAs(suggestedName, bytes) {
      const picker = w.showSaveFilePicker;
      if (picker === undefined) return null;
      let handle: FileSystemFileHandle;
      try {
        handle = await picker.call(w, {
          id: PICKER_ID,
          suggestedName,
          types: FILE_TYPES,
          startIn: await startIn(),
        });
      } catch (error) {
        if (isPickerCancel(error)) return null;
        throw error;
      }
      await writeHandle(handle, bytes);
      currentHandle = handle;
      await store.pushRecent({ name: handle.name, handle });
      return handle.name;
    },

    detachCurrent() {
      currentHandle = null;
    },

    async chooseDefaultFolder() {
      const picker = w.showDirectoryPicker;
      if (picker === undefined) return null;
      let dir: FileSystemDirectoryHandle;
      try {
        // readwrite up front: the folder is where saves land, and one prompt
        // covering both directions beats a second prompt at first save.
        dir = await picker.call(w, { id: PICKER_ID, mode: "readwrite" });
      } catch (error) {
        if (isPickerCancel(error)) return null;
        throw error;
      }
      await store.setDefaultFolder(dir);
      return dir.name;
    },

    async defaultFolderName() {
      return (await store.getDefaultFolder())?.name ?? null;
    },

    async listDefaultFolder() {
      const dir = await grantedDefaultFolder();
      if (dir === null) return null;
      const entries: FolderEntry[] = [];
      for await (const entry of dir.values()) {
        if (entry.kind !== "file") continue;
        if (!entry.name.toLowerCase().endsWith(STAPLES_EXTENSION)) continue;
        const file = await (entry as FileSystemFileHandle).getFile();
        entries.push({ name: entry.name, modified: file.lastModified });
      }
      return entries.sort((a, b) => b.modified - a.modified);
    },

    async openFromDefaultFolder(name) {
      const dir = await grantedDefaultFolder();
      if (dir === null) return null;
      return retainAndRead(await dir.getFileHandle(name));
    },

    async listRecents() {
      return (await store.getRecents()).map(
        ({ name, openedAt }): RecentEntry => ({ name, openedAt }),
      );
    },

    async openRecent(index) {
      const recent = (await store.getRecents())[index];
      if (recent === undefined) return null;
      if (!(await ensurePermission(recent.handle, "read"))) {
        throw new Error(`Access to "${recent.name}" was not granted.`);
      }
      return retainAndRead(recent.handle);
    },
  };
}
