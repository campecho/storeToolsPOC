import { useEffect, useState } from "react";
import type { DocumentFileApi } from "./useDocumentFile";
import type { FolderEntry, RecentEntry } from "./types";

/**
 * The debug-bar file group (PLAN.md §6.9 S1/S2, "pending real chrome"):
 * name + dirty dot, Open/Save/Save As, and — on the File System Access tier
 * — the default-folder setup, its in-app file listing, and recents. Basic
 * unstyled controls like everything else in the bar; the contracts live in
 * the registry chords and the StorageProvider seam, not in this JSX.
 */
export function FileControls({ api }: { api: DocumentFileApi }) {
  const [folderName, setFolderName] = useState<string | null>(null);
  const [menu, setMenu] = useState<"none" | "folder" | "recents">("none");
  const [entries, setEntries] = useState<FolderEntry[] | null>(null);
  const [recents, setRecents] = useState<RecentEntry[]>([]);

  useEffect(() => {
    if (api.supportsFolders) void api.folderName().then(setFolderName);
  }, [api]);

  const chooseFolder = () => {
    void api.chooseFolder().then((name) => {
      if (name !== null) {
        setFolderName(name);
        setMenu("none");
      }
    });
  };

  const toggleFolderMenu = () => {
    if (menu === "folder") {
      setMenu("none");
      return;
    }
    void api.listFolder().then((listed) => {
      setEntries(listed);
      setMenu("folder");
    });
  };

  const toggleRecentsMenu = () => {
    if (menu === "recents") {
      setMenu("none");
      return;
    }
    void api.listRecents().then((listed) => {
      setRecents(listed);
      setMenu("recents");
    });
  };

  return (
    <span className="debug-group file-controls" role="group" aria-label="File">
      <span className="file-name" data-testid="file-name">
        {api.fileName ?? "Untitled"}
        {api.dirty && (
          <span className="file-dirty" data-testid="file-dirty" title="Unsaved changes">
            ●
          </span>
        )}
      </span>
      <button onClick={api.open}>Open…</button>
      <button onClick={api.save}>{api.canSaveSilently ? "Save" : "Save (downloads)"}</button>
      <button onClick={api.saveAs}>Save As…</button>
      {api.supportsFolders &&
        (folderName === null ? (
          <button onClick={chooseFolder}>Set documents folder…</button>
        ) : (
          <>
            <button aria-expanded={menu === "folder"} onClick={toggleFolderMenu}>
              📁 {folderName} ▾
            </button>
            <button aria-expanded={menu === "recents"} onClick={toggleRecentsMenu}>
              Recents ▾
            </button>
          </>
        ))}
      {menu === "folder" && (
        <span className="file-menu" role="menu" aria-label="Documents folder">
          {entries === null ? (
            <span className="file-menu-note">Folder unavailable — see the error.</span>
          ) : entries.length === 0 ? (
            <span className="file-menu-note">No .staples files here yet.</span>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.name}
                role="menuitem"
                onClick={() => {
                  setMenu("none");
                  api.openFromFolder(entry.name);
                }}
              >
                {entry.name} — {new Date(entry.modified).toLocaleString()}
              </button>
            ))
          )}
          <button role="menuitem" onClick={chooseFolder}>
            Choose a different folder…
          </button>
        </span>
      )}
      {menu === "recents" && (
        <span className="file-menu" role="menu" aria-label="Recent documents">
          {recents.length === 0 ? (
            <span className="file-menu-note">No recent documents.</span>
          ) : (
            recents.map((recent, index) => (
              <button
                key={`${recent.name}-${recent.openedAt}`}
                role="menuitem"
                onClick={() => {
                  setMenu("none");
                  api.openRecent(index);
                }}
              >
                {recent.name}
              </button>
            ))
          )}
        </span>
      )}
      {api.error !== null && (
        <span className="debug-error" role="alert">
          {api.error}
          <button aria-label="Dismiss file error" onClick={api.dismissError}>
            ×
          </button>
        </span>
      )}
    </span>
  );
}
