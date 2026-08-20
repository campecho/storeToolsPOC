import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { LayoutDocument } from "../model";
import { documentSlice } from "./documentSlice";
import type { DocumentHistoryState } from "./history";

/**
 * Which .staples file the working document belongs to (PLAN.md §6.9), and
 * the baseline dirty is judged against. The FILE HANDLE itself is shell
 * state — it is not serializable and never enters the store; this slice
 * carries only what the core can honestly own: the file's name, the
 * manifest's created stamp (carried through so re-saves keep the original),
 * and the exact document object the file last held.
 *
 * File actions are neither tool gestures nor panel commits — they are load
 * events like document/loadedCommitted, dispatched by the shell AFTER the
 * asynchronous IO completes, never on the keypress. They are deliberately
 * not undoable: un-saving a file is not a thing, and un-opening one is what
 * opening the previous file is for.
 */

export type FileState = {
  fileName: string | null;
  createdAt: string | null;
  savedDoc: LayoutDocument | null;
};

const initialState: FileState = { fileName: null, createdAt: null, savedDoc: null };

type FileCommit = { fileName: string; createdAt: string; doc: LayoutDocument };

export const fileSlice = createSlice({
  name: "file",
  initialState,
  reducers: {
    /** A .staples file was opened: the shell dispatched loadedCommitted with
        this same document object, so present === savedDoc and the document
        reads clean until the first gesture. */
    openedCommitted(_state, action: PayloadAction<FileCommit>) {
      const { fileName, createdAt, doc } = action.payload;
      return { fileName, createdAt, savedDoc: doc };
    },
    /** A save completed: the baseline becomes the document as packed. Save
        and Save As share this — the file name says where the bytes went. */
    savedCommitted(_state, action: PayloadAction<FileCommit>) {
      const { fileName, createdAt, doc } = action.payload;
      return { fileName, createdAt, savedDoc: doc };
    },
  },
  extraReducers: (builder) => {
    // A debug-bar load (fixture or JSON import) detaches the document from
    // any file: it is a different document, and Ctrl+S silently overwriting
    // the previously open file with it would be the worst possible reading.
    // The baseline is the loaded document itself, so a load reads clean and
    // the first gesture after it reads dirty.
    builder.addCase(documentSlice.actions.loadedCommitted, (_state, action) => ({
      fileName: null,
      createdAt: null,
      savedDoc: action.payload,
    }));
  },
});

export const { openedCommitted: fileOpenedCommitted, savedCommitted: fileSavedCommitted } =
  fileSlice.actions;

/** The file's display name, null while untitled. Primitive selectors on
    purpose — an object-returning selector re-renders every subscriber on
    every action. */
export function selectFileName(state: { file: FileState }): string | null {
  return state.file.fileName;
}

/** Whether the document has edits its file does not. Dirty is REFERENCE
    identity against the baseline: history restores the exact snapshot object
    on undo, so undoing back to the save point reads clean again. With no
    baseline (a fresh session, or after the stress fixture), any retained
    past entry means edits exist — and undoing them all back out reads clean. */
export function selectFileDirty(state: {
  document: DocumentHistoryState;
  file: FileState;
}): boolean {
  const { savedDoc } = state.file;
  return savedDoc !== null
    ? state.document.present !== savedDoc
    : state.document.past.length > 0;
}
