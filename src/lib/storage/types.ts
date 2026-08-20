/**
 * The StorageProvider seam (docs/STORAGE_PLAN.md): every path document bytes
 * take to or from the device goes through this one interface — File System
 * Access on Chromium (the store profile), the download/upload fallback
 * elsewhere, an in-memory fake in tests. Mirrors the publisher prototype's
 * seam of the same name; the prototype owns the design.
 */

export type OpenedFile = { name: string; bytes: Uint8Array };

export type FolderEntry = { name: string; modified: number };

export type RecentEntry = { name: string; openedAt: number };

export interface StorageProvider {
  readonly kind: "fsa" | "fallback";
  readonly supportsFolders: boolean;
  /** OS/file-input open dialog. null = cancelled or unavailable. */
  openFile(): Promise<OpenedFile | null>;
  /** Silent write to the retained handle; null = nothing retained. */
  saveCurrent(bytes: Uint8Array): Promise<string | null>;
  /** Save dialog (or download). Returns the name written, null = cancelled. */
  saveFileAs(suggestedName: string, bytes: Uint8Array): Promise<string | null>;
  /** Drops the retained handle — a reset/preset/import detaches the file. */
  detachCurrent(): void;
  chooseDefaultFolder(): Promise<string | null>;
  defaultFolderName(): Promise<string | null>;
  listDefaultFolder(): Promise<FolderEntry[] | null>;
  openFromDefaultFolder(name: string): Promise<OpenedFile | null>;
  listRecents(): Promise<RecentEntry[]>;
  openRecent(index: number): Promise<OpenedFile | null>;
}
