import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { RECENTS_LIMIT, createHandleStore } from "./handleStore";

/**
 * Handle persistence over fake-indexeddb (PLAN.md §6.9 S2). Real handles are
 * structured-cloneable; the fakes here are plain objects, which clone the
 * same way — what is under test is the store's keys, dedupe, and cap, not
 * the platform's serialization.
 */

function fakeFolder(name: string): FileSystemDirectoryHandle {
  return { kind: "directory", name } as unknown as FileSystemDirectoryHandle;
}

function fakeFile(name: string): FileSystemFileHandle {
  return { kind: "file", name } as unknown as FileSystemFileHandle;
}

describe("createHandleStore", () => {
  it("degrades to an empty store without indexedDB", async () => {
    const store = createHandleStore(undefined);
    expect(await store.getDefaultFolder()).toBeNull();
    await store.setDefaultFolder(fakeFolder("docs"));
    expect(await store.getDefaultFolder()).toBeNull();
    await store.pushRecent({ name: "a.staples", handle: fakeFile("a.staples") });
    expect(await store.getRecents()).toEqual([]);
  });

  it("persists the default-folder grant", async () => {
    const idb = new IDBFactory();
    const store = createHandleStore(idb);
    expect(await store.getDefaultFolder()).toBeNull();
    await store.setDefaultFolder(fakeFolder("Staples Documents"));
    // A second store over the same factory sees it — the cross-session read.
    const reopened = createHandleStore(idb);
    expect((await reopened.getDefaultFolder())?.name).toBe("Staples Documents");
  });

  it("prepends recents, dedupes by name, and caps the list", async () => {
    let tick = 0;
    const store = createHandleStore(new IDBFactory(), () => ++tick);
    await store.pushRecent({ name: "a.staples", handle: fakeFile("a.staples") });
    await store.pushRecent({ name: "b.staples", handle: fakeFile("b.staples") });
    await store.pushRecent({ name: "a.staples", handle: fakeFile("a.staples") });
    let recents = await store.getRecents();
    expect(recents.map((r) => r.name)).toEqual(["a.staples", "b.staples"]);
    expect(recents[0]?.openedAt).toBe(3);

    for (let i = 0; i < RECENTS_LIMIT + 3; i += 1) {
      await store.pushRecent({ name: `f${i}.staples`, handle: fakeFile(`f${i}.staples`) });
    }
    recents = await store.getRecents();
    expect(recents).toHaveLength(RECENTS_LIMIT);
    expect(recents[0]?.name).toBe(`f${RECENTS_LIMIT + 2}.staples`);
  });
});
