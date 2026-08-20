import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../model";
import { documentSetupCommitted } from "./documentActions";
import { fileOpenedCommitted, fileSavedCommitted, selectFileDirty, selectFileName } from "./fileSlice";
import { redoCommitted, undoCommitted } from "./history";
import { createAppStore, documentLoadedCommitted, selectDocument } from "./index";

/**
 * The file slice and its dirty rule (PLAN.md §6.9): dirty is reference
 * identity against the last-saved document, which works because history
 * restores exact snapshot references — undoing back to the save point must
 * read clean again, and a fresh gesture after it dirty.
 */

const STAMP = "2026-08-20T12:00:00.000Z";

function openedFixture(store: ReturnType<typeof createAppStore>) {
  const doc = createEmptyDocument();
  store.dispatch(documentLoadedCommitted(doc));
  store.dispatch(fileOpenedCommitted({ fileName: "job.staples", createdAt: STAMP, doc }));
}

describe("fileSlice", () => {
  it("starts untitled and clean", () => {
    const store = createAppStore();
    expect(selectFileName(store.getState())).toBeNull();
    expect(selectFileDirty(store.getState())).toBe(false);
  });

  it("reads dirty after a gesture with no file, and clean again after undoing it out", () => {
    const store = createAppStore();
    store.dispatch(documentSetupCommitted({ margin: 0.75 }));
    expect(selectFileDirty(store.getState())).toBe(true);
    store.dispatch(undoCommitted());
    expect(selectFileDirty(store.getState())).toBe(false);
  });

  it("opening a file names it and reads clean", () => {
    const store = createAppStore();
    openedFixture(store);
    expect(selectFileName(store.getState())).toBe("job.staples");
    expect(selectFileDirty(store.getState())).toBe(false);
    expect(store.getState().file.createdAt).toBe(STAMP);
  });

  it("tracks dirty across gesture, undo back to the save point, and redo", () => {
    const store = createAppStore();
    openedFixture(store);
    store.dispatch(documentSetupCommitted({ margin: 0.75 }));
    expect(selectFileDirty(store.getState())).toBe(true);
    store.dispatch(undoCommitted());
    expect(selectFileDirty(store.getState())).toBe(false);
    store.dispatch(redoCommitted());
    expect(selectFileDirty(store.getState())).toBe(true);
  });

  it("a save resets the baseline to the document as packed", () => {
    const store = createAppStore();
    openedFixture(store);
    store.dispatch(documentSetupCommitted({ margin: 0.75 }));
    const packed = selectDocument(store.getState());
    store.dispatch(
      fileSavedCommitted({ fileName: "job.staples", createdAt: STAMP, doc: packed }),
    );
    expect(selectFileName(store.getState())).toBe("job.staples");
    expect(selectFileDirty(store.getState())).toBe(false);
    // Undoing PAST the save point is edits-away-from-the-file again.
    store.dispatch(undoCommitted());
    expect(selectFileDirty(store.getState())).toBe(true);
  });

  it("save-as renames the file", () => {
    const store = createAppStore();
    openedFixture(store);
    const doc = selectDocument(store.getState());
    store.dispatch(fileSavedCommitted({ fileName: "copy.staples", createdAt: STAMP, doc }));
    expect(selectFileName(store.getState())).toBe("copy.staples");
  });

  it("a debug/fixture load detaches the document from its file and reads clean", () => {
    const store = createAppStore();
    openedFixture(store);
    store.dispatch(documentLoadedCommitted(createEmptyDocument()));
    expect(selectFileName(store.getState())).toBeNull();
    expect(selectFileDirty(store.getState())).toBe(false);
    store.dispatch(documentSetupCommitted({ margin: 0.75 }));
    expect(selectFileDirty(store.getState())).toBe(true);
  });
});
