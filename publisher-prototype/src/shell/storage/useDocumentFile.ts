import { useCallback, useEffect, useMemo, useState } from "react";
import { packStaples, staplesFileName, unpackStaples } from "../../core/storage";
import {
  documentLoadedCommitted,
  fileOpenedCommitted,
  fileSavedCommitted,
  selectDocument,
  selectFileDirty,
  selectFileName,
} from "../../core/store";
import { useAppDispatch, useAppSelector } from "../hooks";
import { createStorageProvider } from "./createProvider";
import type { FolderEntry, OpenedFile, RecentEntry } from "./types";

/** Mirrors package.json — manifest metadata only, asserted nowhere. */
const APP_VERSION = "0.1.0";

export type DocumentFileApi = {
  fileName: string | null;
  dirty: boolean;
  error: string | null;
  dismissError: () => void;
  /** Whether the default-folder surfaces render at all (fallback tier: no). */
  supportsFolders: boolean;
  /** Whether plain Save can ever be silent (fallback tier re-downloads). */
  canSaveSilently: boolean;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  /** Returns the chosen folder's name; null = cancelled or failed. */
  chooseFolder: () => Promise<string | null>;
  /** The persisted grant's folder name, without prompting. */
  folderName: () => Promise<string | null>;
  /** null = no folder set, or the listing failed (the error is surfaced). */
  listFolder: () => Promise<FolderEntry[] | null>;
  openFromFolder: (name: string) => void;
  listRecents: () => Promise<RecentEntry[]>;
  openRecent: (index: number) => void;
};

/**
 * The document's file lifecycle (PLAN.md §6.9 S1/S2), one hook: pack/unpack
 * through core/storage, IO through the StorageProvider seam, state through
 * the file slice. The retained file handle lives inside the provider — never
 * in the store, where a non-serializable would be a lie — and detaches
 * whenever a debug/fixture load unnames the file, so Ctrl+S can never write
 * a fixture over the user's document.
 */
export function useDocumentFile(): DocumentFileApi {
  const dispatch = useAppDispatch();
  const provider = useMemo(createStorageProvider, []);
  const fileName = useAppSelector(selectFileName);
  const dirty = useAppSelector(selectFileDirty);
  const createdAt = useAppSelector((s) => s.file.createdAt);
  const doc = useAppSelector(selectDocument);
  const [error, setError] = useState<string | null>(null);

  // A fixture or JSON import cleared the file name (fileSlice extraReducer);
  // the provider must drop its handle in the same breath.
  useEffect(() => {
    if (fileName === null) provider.detachCurrent();
  }, [fileName, provider]);

  // The §13.2 unsaved-work guard: leaving with edits pending asks first.
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const run = useCallback((op: () => Promise<void>): void => {
    void op().then(
      () => setError(null),
      (failure: unknown) =>
        setError(failure instanceof Error ? failure.message : String(failure)),
    );
  }, []);

  const applyOpened = useCallback(
    (opened: OpenedFile) => {
      // Embedded asset bytes are unpacked but not yet consumed — the client
      // blob store is §6.9 S3; nothing in the prototype renders them today.
      const { manifest, doc: openedDoc } = unpackStaples(opened.bytes);
      dispatch(documentLoadedCommitted(openedDoc));
      dispatch(
        fileOpenedCommitted({
          fileName: opened.name,
          createdAt: manifest.created,
          doc: openedDoc,
        }),
      );
    },
    [dispatch],
  );

  const packCurrent = useCallback(() => {
    const modified = new Date().toISOString();
    const created = createdAt ?? modified;
    return {
      bytes: packStaples({ doc, appVersion: APP_VERSION, created, modified }),
      doc,
      created,
    };
  }, [doc, createdAt]);

  const open = useCallback(
    () =>
      run(async () => {
        const opened = await provider.openFile();
        if (opened !== null) applyOpened(opened);
      }),
    [run, provider, applyOpened],
  );

  const saveAs = useCallback(
    () =>
      run(async () => {
        const { bytes, doc: packedDoc, created } = packCurrent();
        const suggested = fileName ?? staplesFileName(packedDoc.name);
        const savedName = await provider.saveFileAs(suggested, bytes);
        if (savedName !== null) {
          dispatch(fileSavedCommitted({ fileName: savedName, createdAt: created, doc: packedDoc }));
        }
      }),
    [run, packCurrent, fileName, provider, dispatch],
  );

  const save = useCallback(
    () =>
      run(async () => {
        const { bytes, doc: packedDoc, created } = packCurrent();
        const savedName = await provider.saveCurrent(bytes);
        if (savedName !== null) {
          dispatch(fileSavedCommitted({ fileName: savedName, createdAt: created, doc: packedDoc }));
          return;
        }
        // Nothing retained — first save, or the fallback tier — so Save IS
        // Save As, same bytes.
        const asName = await provider.saveFileAs(
          fileName ?? staplesFileName(packedDoc.name),
          bytes,
        );
        if (asName !== null) {
          dispatch(fileSavedCommitted({ fileName: asName, createdAt: created, doc: packedDoc }));
        }
      }),
    [run, packCurrent, provider, fileName, dispatch],
  );

  const chooseFolder = useCallback(async (): Promise<string | null> => {
    try {
      const name = await provider.chooseDefaultFolder();
      setError(null);
      return name;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return null;
    }
  }, [provider]);

  const folderName = useCallback(() => provider.defaultFolderName(), [provider]);

  const listFolder = useCallback(async (): Promise<FolderEntry[] | null> => {
    try {
      const entries = await provider.listDefaultFolder();
      setError(null);
      return entries;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return null;
    }
  }, [provider]);

  const openFromFolder = useCallback(
    (name: string) =>
      run(async () => {
        const opened = await provider.openFromDefaultFolder(name);
        if (opened !== null) applyOpened(opened);
      }),
    [run, provider, applyOpened],
  );

  const listRecents = useCallback(() => provider.listRecents(), [provider]);

  const openRecent = useCallback(
    (index: number) =>
      run(async () => {
        const opened = await provider.openRecent(index);
        if (opened !== null) applyOpened(opened);
      }),
    [run, provider, applyOpened],
  );

  return {
    fileName,
    dirty,
    error,
    dismissError: useCallback(() => setError(null), []),
    supportsFolders: provider.supportsFolders,
    canSaveSilently: provider.kind === "fsa",
    open,
    save,
    saveAs,
    chooseFolder,
    folderName,
    listFolder,
    openFromFolder,
    listRecents,
    openRecent,
  };
}
