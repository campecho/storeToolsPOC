/**
 * IndexedDB persistence for File System Access handles (PLAN.md §6.9 S2).
 * Handles are structured-cloneable, which is the entire reason this store
 * exists — localStorage cannot hold one, and a handle that survives the
 * session is what turns "pick your documents folder" into a one-time setup.
 * Two keys: the default-folder handle, and the recents list. A runtime
 * without indexedDB (tests, exotic embeds) degrades to an empty store.
 */

const DB_NAME = "staples-shell-v1";
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
  /** Prepends (deduplicating by name — good enough for a flat documents
      folder) and caps the list at RECENTS_LIMIT. */
  pushRecent(entry: { name: string; handle: FileSystemFileHandle }): Promise<void>;
};

export function createHandleStore(
  idb: IDBFactory | undefined,
  now: () => number = Date.now,
): HandleStore {
  if (idb === undefined) {
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
