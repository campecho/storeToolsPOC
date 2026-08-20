/**
 * File System Access API surface the shell calls (PLAN.md §6.9).
 * TypeScript's DOM lib ships the handle types but not the pickers or the
 * permission methods, which are Chromium-only; these ambient declarations
 * cover exactly what fsaProvider.ts uses — createProvider.ts feature-detects
 * whether any of it exists at runtime, and the methods are optional here for
 * the same reason.
 */

type FsaPermissionMode = "read" | "readwrite";

type FsaPermissionDescriptor = { mode?: FsaPermissionMode };

interface FileSystemHandle {
  queryPermission?(descriptor?: FsaPermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FsaPermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
}

type FsaFileType = { description?: string; accept: Record<string, string[]> };

type FsaOpenFilePickerOptions = {
  id?: string;
  multiple?: boolean;
  types?: FsaFileType[];
  excludeAcceptAllOption?: boolean;
  startIn?: FileSystemHandle | string;
};

type FsaSaveFilePickerOptions = {
  id?: string;
  suggestedName?: string;
  types?: FsaFileType[];
  excludeAcceptAllOption?: boolean;
  startIn?: FileSystemHandle | string;
};

type FsaDirectoryPickerOptions = {
  id?: string;
  mode?: FsaPermissionMode;
  startIn?: FileSystemHandle | string;
};

interface Window {
  showOpenFilePicker?(options?: FsaOpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(options?: FsaSaveFilePickerOptions): Promise<FileSystemFileHandle>;
  showDirectoryPicker?(options?: FsaDirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
