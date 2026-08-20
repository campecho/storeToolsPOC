import { beforeEach, describe, expect, it } from "vitest";
import { selectFileDirty, useLayoutStore } from "@/store";
import { packStaples } from "./container";
import {
  openLayoutFile,
  saveLayoutFile,
  saveLayoutFileAs,
} from "./layout-file";
import { setStorageProviderForTests } from "./provider";
import type { OpenedFile, StorageProvider } from "./types";

/**
 * The layout-editor file lifecycle over an injected in-memory provider
 * (docs/STORAGE_PLAN.md P1): open replaces the document and sets the
 * baseline, save marks it, edits and undo move dirty exactly as the
 * reference-identity rule says.
 */

const initialState = useLayoutStore.getState();

function memoryProvider(openResult: OpenedFile | null = null): StorageProvider & {
  saved: { name: string; bytes: Uint8Array }[];
  retained: boolean;
} {
  const state = {
    saved: [] as { name: string; bytes: Uint8Array }[],
    retained: false,
  };
  return {
    kind: "fsa",
    supportsFolders: true,
    openFile: () => {
      state.retained = openResult !== null;
      return Promise.resolve(openResult);
    },
    saveCurrent: (bytes) => {
      if (!state.retained) return Promise.resolve(null);
      const name = state.saved[state.saved.length - 1]?.name ?? openResult?.name ?? null;
      if (name === null) return Promise.resolve(null);
      state.saved.push({ name, bytes });
      return Promise.resolve(name);
    },
    saveFileAs: (suggestedName, bytes) => {
      state.retained = true;
      state.saved.push({ name: suggestedName, bytes });
      return Promise.resolve(suggestedName);
    },
    detachCurrent: () => {
      state.retained = false;
    },
    chooseDefaultFolder: () => Promise.resolve(null),
    defaultFolderName: () => Promise.resolve(null),
    listDefaultFolder: () => Promise.resolve(null),
    openFromDefaultFolder: () => Promise.resolve(null),
    listRecents: () => Promise.resolve([]),
    openRecent: () => Promise.resolve(null),
    get retained() {
      return state.retained;
    },
    get saved() {
      return state.saved;
    },
  };
}

function packedFixture(name: string): OpenedFile {
  const doc = { ...initialState.doc, name: "Opened doc" };
  return {
    name,
    bytes: packStaples({
      doc,
      created: "2026-08-20T09:00:00.000Z",
      modified: "2026-08-20T09:00:00.000Z",
    }),
  };
}

beforeEach(() => {
  useLayoutStore.setState(initialState, true);
  setStorageProviderForTests(null);
});

describe("layout file lifecycle", () => {
  it("opening a .staples file replaces the document and reads clean", async () => {
    setStorageProviderForTests(memoryProvider(packedFixture("job.staples")));
    await openLayoutFile();
    const s = useLayoutStore.getState();
    expect(s.doc.name).toBe("Opened doc");
    expect(s.fileName).toBe("job.staples");
    expect(s.fileCreatedAt).toBe("2026-08-20T09:00:00.000Z");
    expect(s.past).toEqual([]);
    expect(selectFileDirty(s)).toBe(false);
  });

  it("edits read dirty — and undo stays conservatively dirty (this store's undo rebuilds the doc object)", async () => {
    setStorageProviderForTests(memoryProvider(packedFixture("job.staples")));
    await openLayoutFile();
    useLayoutStore.getState().setPageSize(6, 4);
    expect(selectFileDirty(useLayoutStore.getState())).toBe(true);
    useLayoutStore.getState().undo();
    // Pinned on purpose: reference-identity dirty cannot go clean across
    // this undo (selectFileDirty's comment carries the reasoning). Only a
    // save clears it — a false "unsaved" costs a prompt, never work.
    expect(selectFileDirty(useLayoutStore.getState())).toBe(true);
  });

  it("save writes through the retained handle and moves the baseline", async () => {
    const provider = memoryProvider(packedFixture("job.staples"));
    setStorageProviderForTests(provider);
    await openLayoutFile();
    useLayoutStore.getState().setPageSize(6, 4);
    await saveLayoutFile();
    expect(provider.saved.map((s) => s.name)).toEqual(["job.staples"]);
    const s = useLayoutStore.getState();
    expect(s.fileName).toBe("job.staples");
    expect(selectFileDirty(s)).toBe(false);
    // The saved bytes carry the edited document, and the created stamp holds.
    expect(s.fileCreatedAt).toBe("2026-08-20T09:00:00.000Z");
  });

  it("an untitled save falls through to Save As with the doc-derived name", async () => {
    const provider = memoryProvider();
    setStorageProviderForTests(provider);
    await saveLayoutFile();
    expect(provider.saved.map((s) => s.name)).toEqual(["Untitled publication.staples"]);
    const s = useLayoutStore.getState();
    expect(s.fileName).toBe("Untitled publication.staples");
    expect(selectFileDirty(s)).toBe(false);
  });

  it("save-as re-suggests the current file name once one exists", async () => {
    const provider = memoryProvider(packedFixture("job.staples"));
    setStorageProviderForTests(provider);
    await openLayoutFile();
    await saveLayoutFileAs();
    expect(provider.saved.map((s) => s.name)).toEqual(["job.staples"]);
  });

  it("resetDoc detaches the file entirely", async () => {
    setStorageProviderForTests(memoryProvider(packedFixture("job.staples")));
    await openLayoutFile();
    useLayoutStore.getState().resetDoc();
    const s = useLayoutStore.getState();
    expect(s.fileName).toBeNull();
    expect(s.savedDoc).toBeNull();
    expect(selectFileDirty(s)).toBe(false);
  });
});
