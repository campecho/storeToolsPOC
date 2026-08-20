import { getAssetBlob } from "@/lib/assets/blob-store";
import { useLayoutStore } from "@/store";
import { packStaples, staplesFileName, unpackStaples } from "./container";
import { getStorageProvider } from "./provider";
import type { FolderEntry, OpenedFile, RecentEntry } from "./types";

/**
 * Layout-editor file operations (docs/STORAGE_PLAN.md P1/P2): pack/unpack
 * through the container, IO through the app-wide StorageProvider, state
 * through the layout store. Plain async functions rather than a hook so the
 * File menu and the keyboard shortcuts call the same code — errors throw,
 * and callers route them to the store's fileError.
 */

function applyOpened(opened: OpenedFile): void {
  const { manifest, doc, assets } = unpackStaples(opened.bytes);
  const blobs: Record<string, Blob> = {};
  for (const [id, bytes] of Object.entries(assets)) {
    // The document's asset metadata names the mime; bytes without a metadata
    // row are orphans in the file and stay out of the library.
    const meta = doc.assets[id];
    if (meta === undefined) continue;
    blobs[id] = new Blob([bytes as BlobPart], { type: meta.mime });
  }
  useLayoutStore
    .getState()
    .openStaplesDocument(doc, blobs, { name: opened.name, createdAt: manifest.created });
}

async function packCurrent(): Promise<{ bytes: Uint8Array; createdAt: string }> {
  const s = useLayoutStore.getState();
  const modified = new Date().toISOString();
  const createdAt = s.fileCreatedAt ?? modified;
  const assets: Record<string, Uint8Array> = {};
  for (const id of Object.keys(s.doc.assets)) {
    const blob = await getAssetBlob(id);
    // A missing blob is an orphaned reference (STUBS.md names the GC gap) —
    // the file carries the metadata and simply omits the bytes.
    if (blob !== null) assets[id] = new Uint8Array(await blob.arrayBuffer());
  }
  return { bytes: packStaples({ doc: s.doc, assets, created: createdAt, modified }), createdAt };
}

export async function openLayoutFile(): Promise<void> {
  const opened = await getStorageProvider().openFile();
  if (opened !== null) applyOpened(opened);
}

export async function saveLayoutFile(): Promise<void> {
  const provider = getStorageProvider();
  const { bytes, createdAt } = await packCurrent();
  const savedName = await provider.saveCurrent(bytes);
  if (savedName !== null) {
    useLayoutStore.getState().markFileSaved({ name: savedName, createdAt });
    return;
  }
  // Nothing retained — first save, or the fallback tier — so Save IS Save As.
  await saveAsWith(bytes, createdAt);
}

export async function saveLayoutFileAs(): Promise<void> {
  const { bytes, createdAt } = await packCurrent();
  await saveAsWith(bytes, createdAt);
}

async function saveAsWith(bytes: Uint8Array, createdAt: string): Promise<void> {
  const s = useLayoutStore.getState();
  const suggested = s.fileName ?? staplesFileName(s.doc.name);
  const savedName = await getStorageProvider().saveFileAs(suggested, bytes);
  if (savedName !== null) {
    useLayoutStore.getState().markFileSaved({ name: savedName, createdAt });
  }
}

/** Drops the provider's retained handle. Called when the document detaches
    from its file (reset, preset, import) so a later Ctrl+S can never write
    the new document over the old file. */
export function detachLayoutFile(): void {
  getStorageProvider().detachCurrent();
}

export function storageSupportsFolders(): boolean {
  return getStorageProvider().supportsFolders;
}

export function storageSavesSilently(): boolean {
  return getStorageProvider().kind === "fsa";
}

export function chooseStorageFolder(): Promise<string | null> {
  return getStorageProvider().chooseDefaultFolder();
}

export function getStorageFolderName(): Promise<string | null> {
  return getStorageProvider().defaultFolderName();
}

export function listStorageFolder(): Promise<FolderEntry[] | null> {
  return getStorageProvider().listDefaultFolder();
}

export async function openLayoutFileFromFolder(name: string): Promise<void> {
  const opened = await getStorageProvider().openFromDefaultFolder(name);
  if (opened !== null) applyOpened(opened);
}

export function listRecentFiles(): Promise<RecentEntry[]> {
  return getStorageProvider().listRecents();
}

export async function openRecentFile(index: number): Promise<void> {
  const opened = await getStorageProvider().openRecent(index);
  if (opened !== null) applyOpened(opened);
}

/** Route a file operation's failure to the store's fileError — the shared
    wrapper the menu and the keyboard both use. */
export function runFileOp(op: () => Promise<void>): void {
  void op().then(
    () => useLayoutStore.getState().setFileError(null),
    (error: unknown) =>
      useLayoutStore
        .getState()
        .setFileError(error instanceof Error ? error.message : String(error)),
  );
}
