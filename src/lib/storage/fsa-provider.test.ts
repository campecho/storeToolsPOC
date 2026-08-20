import { describe, expect, it } from "vitest";
import { createFsaProvider, type FsaWindow } from "./fsa-provider";
import type { HandleStore, RecentFileEntry } from "./handle-store";

/**
 * The FSA tier over injected fakes (docs/STORAGE_PLAN.md; the publisher prototype's test, ported): Playwright
 * cannot drive native pickers, so the picker calls, permission lifecycle,
 * retained handle, and folder listing are proven here against hand-built
 * handles, and e2e exercises the fallback tier end to end instead.
 */

type FakeFileHandle = FileSystemFileHandle & {
  written: Uint8Array[];
  permissions: { queries: string[]; requests: string[] };
};

function makeFileHandle(
  name: string,
  bytes: Uint8Array,
  options: {
    lastModified?: number;
    queryResult?: PermissionState;
    requestResult?: PermissionState;
  } = {},
): FakeFileHandle {
  const written: Uint8Array[] = [];
  const permissions = { queries: [] as string[], requests: [] as string[] };
  const handle = {
    kind: "file" as const,
    name,
    written,
    permissions,
    getFile: () =>
      Promise.resolve({
        arrayBuffer: () => Promise.resolve(bytes.buffer.slice(0)),
        lastModified: options.lastModified ?? 0,
      }),
    createWritable: () =>
      Promise.resolve({
        write: (data: Uint8Array) => {
          written.push(data);
          return Promise.resolve();
        },
        close: () => Promise.resolve(),
      }),
    queryPermission: (descriptor?: { mode?: string }) => {
      permissions.queries.push(descriptor?.mode ?? "read");
      return Promise.resolve(options.queryResult ?? "granted");
    },
    requestPermission: (descriptor?: { mode?: string }) => {
      permissions.requests.push(descriptor?.mode ?? "read");
      return Promise.resolve(options.requestResult ?? "granted");
    },
  };
  return handle as unknown as FakeFileHandle;
}

function makeDirectoryHandle(name: string, files: FakeFileHandle[]): FileSystemDirectoryHandle {
  const dir = {
    kind: "directory" as const,
    name,
    values: async function* () {
      yield* files;
    },
    getFileHandle: (fileName: string) => {
      const found = files.find((file) => file.name === fileName);
      return found === undefined
        ? Promise.reject(new DOMException("not found", "NotFoundError"))
        : Promise.resolve(found);
    },
    queryPermission: () => Promise.resolve("granted" as PermissionState),
    requestPermission: () => Promise.resolve("granted" as PermissionState),
  };
  return dir as unknown as FileSystemDirectoryHandle;
}

function memoryStore(initialFolder: FileSystemDirectoryHandle | null = null): HandleStore & {
  recents: RecentFileEntry[];
} {
  let folder = initialFolder;
  const recents: RecentFileEntry[] = [];
  return {
    recents,
    getDefaultFolder: () => Promise.resolve(folder),
    setDefaultFolder: (handle) => {
      folder = handle;
      return Promise.resolve();
    },
    getRecents: () => Promise.resolve([...recents]),
    pushRecent: (entry) => {
      recents.unshift({ ...entry, openedAt: 0 });
      return Promise.resolve();
    },
  };
}

const noPickers: FsaWindow = {};

function abortingPicker(): never {
  throw new DOMException("user dismissed", "AbortError");
}

describe("createFsaProvider", () => {
  it("opens a picked file, retains its handle, and records a recent", async () => {
    const handle = makeFileHandle("job.staples", new Uint8Array([1, 2, 3]));
    const store = memoryStore();
    const provider = createFsaProvider(
      { showOpenFilePicker: () => Promise.resolve([handle]) },
      store,
    );
    const opened = await provider.openFile();
    expect(opened).toEqual({ name: "job.staples", bytes: new Uint8Array([1, 2, 3]) });
    expect(store.recents.map((r) => r.name)).toEqual(["job.staples"]);
    // The retained handle is what plain Save writes through.
    expect(await provider.saveCurrent(new Uint8Array([9]))).toBe("job.staples");
    expect(handle.written).toEqual([new Uint8Array([9])]);
  });

  it("passes the default folder as startIn when a grant exists", async () => {
    const dir = makeDirectoryHandle("Staples Documents", []);
    let seenStartIn: unknown = "unset";
    const provider = createFsaProvider(
      {
        showOpenFilePicker: (options) => {
          seenStartIn = options?.startIn;
          return Promise.resolve([makeFileHandle("a.staples", new Uint8Array(0))]);
        },
      },
      memoryStore(dir),
    );
    await provider.openFile();
    expect(seenStartIn).toBe(dir);
  });

  it("returns null when the user cancels a picker", async () => {
    const provider = createFsaProvider(
      { showOpenFilePicker: abortingPicker, showSaveFilePicker: abortingPicker },
      memoryStore(),
    );
    expect(await provider.openFile()).toBeNull();
    expect(await provider.saveFileAs("x.staples", new Uint8Array(0))).toBeNull();
  });

  it("saveCurrent yields null with nothing retained, and after detach", async () => {
    const handle = makeFileHandle("job.staples", new Uint8Array(0));
    const provider = createFsaProvider(
      { showOpenFilePicker: () => Promise.resolve([handle]) },
      memoryStore(),
    );
    expect(await provider.saveCurrent(new Uint8Array(0))).toBeNull();
    await provider.openFile();
    provider.detachCurrent();
    expect(await provider.saveCurrent(new Uint8Array(0))).toBeNull();
  });

  it("re-requests a lapsed grant before writing, and throws when refused", async () => {
    const lapsed = makeFileHandle("job.staples", new Uint8Array(0), {
      queryResult: "prompt",
      requestResult: "granted",
    });
    const provider = createFsaProvider(
      { showOpenFilePicker: () => Promise.resolve([lapsed]) },
      memoryStore(),
    );
    await provider.openFile();
    expect(await provider.saveCurrent(new Uint8Array([1]))).toBe("job.staples");
    expect(lapsed.permissions.requests).toContain("readwrite");

    const refused = makeFileHandle("job.staples", new Uint8Array(0), {
      queryResult: "prompt",
      requestResult: "denied",
    });
    const refusedProvider = createFsaProvider(
      { showOpenFilePicker: () => Promise.resolve([refused]) },
      memoryStore(),
    );
    await refusedProvider.openFile();
    await expect(refusedProvider.saveCurrent(new Uint8Array(0))).rejects.toThrow(
      /Write permission/,
    );
  });

  it("saveFileAs writes through the chosen handle and retains it", async () => {
    const handle = makeFileHandle("copy.staples", new Uint8Array(0));
    const store = memoryStore();
    const provider = createFsaProvider(
      { showSaveFilePicker: () => Promise.resolve(handle) },
      store,
    );
    expect(await provider.saveFileAs("copy.staples", new Uint8Array([5]))).toBe("copy.staples");
    expect(handle.written).toEqual([new Uint8Array([5])]);
    expect(store.recents.map((r) => r.name)).toEqual(["copy.staples"]);
    expect(await provider.saveCurrent(new Uint8Array([6]))).toBe("copy.staples");
  });

  it("stores the folder grant when one is chosen", async () => {
    const dir = makeDirectoryHandle("Staples Documents", []);
    const store = memoryStore();
    const provider = createFsaProvider(
      { showDirectoryPicker: () => Promise.resolve(dir) },
      store,
    );
    expect(await provider.chooseDefaultFolder()).toBe("Staples Documents");
    expect(await provider.defaultFolderName()).toBe("Staples Documents");
  });

  it("lists only .staples files from the folder, newest first; null with no grant", async () => {
    const dir = makeDirectoryHandle("docs", [
      makeFileHandle("old.staples", new Uint8Array(0), { lastModified: 100 }),
      makeFileHandle("skip.pdf", new Uint8Array(0), { lastModified: 900 }),
      makeFileHandle("new.staples", new Uint8Array(0), { lastModified: 500 }),
    ]);
    const provider = createFsaProvider(noPickers, memoryStore(dir));
    expect(await provider.listDefaultFolder()).toEqual([
      { name: "new.staples", modified: 500 },
      { name: "old.staples", modified: 100 },
    ]);
    const empty = createFsaProvider(noPickers, memoryStore());
    expect(await empty.listDefaultFolder()).toBeNull();
  });

  it("opens a named file from the folder and retains it", async () => {
    const file = makeFileHandle("pick.staples", new Uint8Array([7]));
    const dir = makeDirectoryHandle("docs", [file]);
    const provider = createFsaProvider(noPickers, memoryStore(dir));
    const opened = await provider.openFromDefaultFolder("pick.staples");
    expect(opened).toEqual({ name: "pick.staples", bytes: new Uint8Array([7]) });
    expect(await provider.saveCurrent(new Uint8Array([8]))).toBe("pick.staples");
  });

  it("reopens a recent through its stored handle", async () => {
    const store = memoryStore();
    const handle = makeFileHandle("recent.staples", new Uint8Array([4]));
    await store.pushRecent({ name: "recent.staples", handle });
    const provider = createFsaProvider(noPickers, store);
    expect(await provider.listRecents()).toEqual([{ name: "recent.staples", openedAt: 0 }]);
    const opened = await provider.openRecent(0);
    expect(opened).toEqual({ name: "recent.staples", bytes: new Uint8Array([4]) });
    expect(await provider.openRecent(5)).toBeNull();
  });
});
