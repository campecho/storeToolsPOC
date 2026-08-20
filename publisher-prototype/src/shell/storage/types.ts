/**
 * The StorageProvider seam (PLAN.md §6.9): every path bytes take to or from
 * the device goes through this one interface. Two shipped implementations —
 * File System Access (Chromium, the store profile) and the download/upload
 * fallback — plus whatever a test injects; the format is identical through
 * all of them, only the transport differs. If a mandated fixed OS path ever
 * becomes binding, a desktop shell implements exactly this interface
 * (SEAMS.md, 2026-08-20 entry).
 */

export type OpenedFile = { name: string; bytes: Uint8Array };

export type FolderEntry = { name: string; modified: number };

export type RecentEntry = { name: string; openedAt: number };

export interface StorageProvider {
  readonly kind: "fsa" | "fallback";
  readonly supportsFolders: boolean;
  /** OS open dialog (or file input). null = cancelled or unavailable.
      Retains the handle where the platform has one, for silent re-save. */
  openFile(): Promise<OpenedFile | null>;
  /** Silent write to the retained file handle. Returns the file name written,
      or null when nothing is retained — the caller falls through to
      saveFileAs. Throws when the platform refuses the write. */
  saveCurrent(bytes: Uint8Array): Promise<string | null>;
  /** Save dialog (or download). Returns the file name written, null =
      cancelled. Retains the chosen file where the platform has handles. */
  saveFileAs(suggestedName: string, bytes: Uint8Array): Promise<string | null>;
  /** Drops the retained handle — a fixture or debug load detaches the
      document from its file, and Ctrl+S must not overwrite the old one. */
  detachCurrent(): void;
  /** One-time default-folder grant (§6.9). Returns the folder name, null =
      cancelled or unsupported. The grant persists across sessions. */
  chooseDefaultFolder(): Promise<string | null>;
  /** The persisted default folder's name, without prompting. */
  defaultFolderName(): Promise<string | null>;
  /** The default folder's .staples entries, newest first; null = no folder
      set or folders unsupported. May prompt to re-affirm the grant. */
  listDefaultFolder(): Promise<FolderEntry[] | null>;
  openFromDefaultFolder(name: string): Promise<OpenedFile | null>;
  listRecents(): Promise<RecentEntry[]>;
  openRecent(index: number): Promise<OpenedFile | null>;
}
