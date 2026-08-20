"use client";

import { useEffect, useState } from "react";
import { useLayoutStore, selectFileDirty } from "@/store";
import {
  chooseStorageFolder,
  detachLayoutFile,
  getStorageFolderName,
  listRecentFiles,
  listStorageFolder,
  openLayoutFile,
  openLayoutFileFromFolder,
  openRecentFile,
  runFileOp,
  saveLayoutFile,
  saveLayoutFileAs,
  storageSavesSilently,
  storageSupportsFolders,
} from "@/lib/storage/layout-file";
import type { FolderEntry, RecentEntry } from "@/lib/storage/types";

/**
 * The File menu (docs/STORAGE_PLAN.md P1/P2) — the ribbon's File tab, live:
 * Open/Save/Save As against `.staples` files on the device, plus the
 * default-folder surfaces (set the folder once, open from its listing,
 * recents) on the File System Access tier. This replaces the inert label
 * STUBS.md carried since the wire build.
 */
export function FileMenu() {
  const fileName = useLayoutStore((s) => s.fileName);
  const dirty = useLayoutStore(selectFileDirty);
  const fileError = useLayoutStore((s) => s.fileError);
  const setFileError = useLayoutStore((s) => s.setFileError);

  const [open, setOpen] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [entries, setEntries] = useState<FolderEntry[] | null>(null);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const supportsFolders = storageSupportsFolders();

  // The document detached from its file (reset, preset, import): drop the
  // provider's retained handle so Save can never write over the old file.
  useEffect(() => {
    if (fileName === null) detachLayoutFile();
  }, [fileName]);

  // The unsaved-work guard — only once a file exists and has newer edits;
  // untitled work already survives reloads through localStorage.
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const openMenu = () => {
    setOpen(true);
    if (!supportsFolders) return;
    void getStorageFolderName().then(setFolderName);
    void listStorageFolder().then(setEntries, () => setEntries(null));
    void listRecentFiles().then(setRecents, () => setRecents([]));
  };

  const act = (op: () => Promise<void>) => {
    setOpen(false);
    runFileOp(op);
  };

  const chooseFolder = () => {
    setOpen(false);
    void chooseStorageFolder().then(
      (name) => {
        if (name !== null) setFolderName(name);
      },
      (error: unknown) => setFileError(error instanceof Error ? error.message : String(error)),
    );
  };

  const itemClass =
    "block w-full cursor-pointer px-3 py-[6px] text-left text-[12px] text-[#3d3d3d] hover:bg-[#f0f0f0]";
  const headingClass = "px-3 pb-1 pt-2 text-[10px] font-semibold uppercase text-[#8f8f8f]";

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="ribbon-file"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="cursor-pointer px-[15px] pb-2 pt-[7px] text-[12px] font-semibold text-brand"
      >
        File
        {dirty && (
          <span data-testid="file-dirty" title="Unsaved changes" className="ml-1 text-[#c8102e]">
            ●
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            data-testid="file-menu"
            className="absolute left-0 top-full z-50 w-72 border border-[#d4d4d4] bg-white py-1 shadow-lg"
          >
            <div
              className="truncate px-3 pb-1 pt-1 text-[11px] text-[#8f8f8f]"
              data-testid="file-menu-name"
            >
              {fileName ?? "Untitled — not saved to a file yet"}
            </div>
            <button type="button" className={itemClass} onClick={() => act(openLayoutFile)}>
              Open… <span className="float-right text-[#8f8f8f]">Ctrl+O</span>
            </button>
            <button type="button" className={itemClass} onClick={() => act(saveLayoutFile)}>
              {storageSavesSilently() ? "Save" : "Save (downloads)"}{" "}
              <span className="float-right text-[#8f8f8f]">Ctrl+S</span>
            </button>
            <button type="button" className={itemClass} onClick={() => act(saveLayoutFileAs)}>
              Save As… <span className="float-right text-[#8f8f8f]">Ctrl+Shift+S</span>
            </button>
            {supportsFolders && (
              <>
                <div className="my-1 border-t border-[#e4e4e4]" />
                {folderName === null ? (
                  <button type="button" className={itemClass} onClick={chooseFolder}>
                    Set documents folder…
                  </button>
                ) : (
                  <>
                    <div className={headingClass}>📁 {folderName}</div>
                    {entries === null ? (
                      <div className="px-3 py-1 text-[11px] text-[#8f8f8f]">
                        Folder unavailable — re-affirm access below.
                      </div>
                    ) : entries.length === 0 ? (
                      <div className="px-3 py-1 text-[11px] text-[#8f8f8f]">
                        No .staples files here yet.
                      </div>
                    ) : (
                      entries.slice(0, 8).map((entry) => (
                        <button
                          key={entry.name}
                          type="button"
                          className={itemClass}
                          onClick={() => act(() => openLayoutFileFromFolder(entry.name))}
                        >
                          <span className="block truncate">{entry.name}</span>
                          <span className="block text-[10px] text-[#8f8f8f]">
                            {new Date(entry.modified).toLocaleString()}
                          </span>
                        </button>
                      ))
                    )}
                    <button type="button" className={itemClass} onClick={chooseFolder}>
                      Choose a different folder…
                    </button>
                  </>
                )}
                {recents.length > 0 && (
                  <>
                    <div className={headingClass}>Recent</div>
                    {recents.map((recent, index) => (
                      <button
                        key={`${recent.name}-${recent.openedAt}`}
                        type="button"
                        className={itemClass}
                        onClick={() => act(() => openRecentFile(index))}
                      >
                        <span className="block truncate">{recent.name}</span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
            {fileError !== null && (
              <div
                role="alert"
                data-testid="file-error"
                className="mx-3 my-1 border border-[#f2c4c9] bg-[#fdf3f4] px-2 py-1 text-[11px] text-[#a4262c]"
              >
                {fileError}
                <button
                  type="button"
                  aria-label="Dismiss file error"
                  className="ml-2 cursor-pointer font-semibold"
                  onClick={() => setFileError(null)}
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </>
      )}
      {!open && fileError !== null && (
        <div
          role="alert"
          data-testid="file-error"
          className="absolute left-0 top-full z-50 mt-1 w-72 border border-[#f2c4c9] bg-[#fdf3f4] px-2 py-1 text-[11px] text-[#a4262c] shadow"
        >
          {fileError}
          <button
            type="button"
            aria-label="Dismiss file error"
            className="ml-2 cursor-pointer font-semibold"
            onClick={() => setFileError(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
