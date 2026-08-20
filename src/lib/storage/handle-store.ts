/**
 * IndexedDB persistence for File System Access handles (docs/STORAGE_PLAN.md
 * P2). Handles are structured-cloneable — localStorage cannot hold one — and
 * a persisted handle is what turns "pick your documents folder" into a
 * one-time setup. One store, shared by every editor: the folder grant covers
 * layout and photo alike. DB `stp-storage-v1`, beside the sibling stp-* keys.
 */

const DB_NAME = "stp-storage-v1";
const STORE = "entries";
const DEFAULT_FOLDER_KEY = "defaultFolder";
const RECENTS_KEY = "recents";

export const RECENTS_LIMIT = 8;

export type RecentFileEntry = {
  name: string;
  handle: FileSystemFileHandle;
  openedAt: number;
};

export type HandleStore = {
  getDefaultFolder(): Promise<FileSystemDirectoryHandle | null>;
  setDefaultFolder(handle: FileSystemDirectoryHandle): Promise<void>;
  getRecents(): Promise<RecentFileEntry[]>;
  /** Prepends (deduplicating by name) and caps at RECENTS_LIMIT. */
  pushRecent(entry: { name: string; handle: FileSystemFileHandle }): Promise<void>;
};

export function createHandleStore(
  idb: IDBFactory | undefined,
  now: () => number = Date.now,
): HandleStore {
  if (idb === undefined) {
    // SSR and unit tests: degrade to an empty store, the blob-store pattern.
    return {
      getDefaultFolder: () => Promise.resolve(null),
      setDefaultFolder: () => Promise.resolve(),
      getRecents: () => Promise.resolve([]),
      pushRecent: () => Promise.resolve(),
    };
  }

  const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const request = idb.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
    });

  const withStore = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await openDb();
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("indexedDB request failed"));
      });
    } finally {
      db.close();
    }
  };

  const get = <T>(key: string): Promise<T | undefined> =>
    withStore("readonly", (store) => store.get(key) as IDBRequest<T | undefined>);
  const set = (key: string, value: unknown): Promise<IDBValidKey> =>
    withStore("readwrite", (store) => store.put(value, key));

  return {
    async getDefaultFolder() {
      return (await get<FileSystemDirectoryHandle>(DEFAULT_FOLDER_KEY)) ?? null;
    },
    async setDefaultFolder(handle) {
      await set(DEFAULT_FOLDER_KEY, handle);
    },
    async getRecents() {
      return (await get<RecentFileEntry[]>(RECENTS_KEY)) ?? [];
    },
    async pushRecent(entry) {
      const kept = (await this.getRecents()).filter((recent) => recent.name !== entry.name);
      const next = [{ ...entry, openedAt: now() }, ...kept].slice(0, RECENTS_LIMIT);
      await set(RECENTS_KEY, next);
    },
  };
}
