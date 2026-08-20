import type { GestureClause } from "./types";

/**
 * Global key chords (PLAN.md §5, extending its per-tool contract vocabulary).
 *
 * §5 gives every clause a tool, because every clause so far belongs to one:
 * a gesture happens with a tool armed. These do not. Undo runs under the pen
 * as readily as under Select, and zoom-to-fit belongs to the viewport rather
 * than to the Zoom tool that also reaches it. Hanging them on the nearest
 * tool would have that tool's contract claim behavior it does not own, so
 * they get their own list — same `GestureClause` shape, same one-id-three-
 * places discipline, read by the same documents and tests.
 *
 * Two prefixes stand in for the tool id, naming what the chord acts on:
 * `document.` for the page and its objects, `viewport.` for the view of it.
 *
 * Every chord here carries a modifier. That is deliberate and not merely
 * conventional: the tool letters are bare keys (KEYBOARD_SHORTCUTS.md §1),
 * and the two sets can only share a keyboard because the letter handler
 * ignores anything modified.
 */
export const globalKeyClauses: readonly GestureClause[] = [
  {
    id: "document.ctrl-z.undoes",
    trigger: "Ctrl/Cmd+Z",
    behavior:
      "Steps the document back one committed gesture or panel edit; a no-op on an empty past. Viewport-only changes never entered history, so undo never rewinds a zoom or a pan.",
    action: "history/undoCommitted",
  },
  {
    id: "document.ctrl-shift-z.redoes",
    trigger: "Ctrl/Cmd+Shift+Z, or Ctrl/Cmd+Y",
    behavior:
      "Steps forward again through what undo rewound; a no-op on an empty future, and a fresh commit clears it. Both chords are offered because Publisher's redo is Ctrl+Y and Adobe's is Ctrl+Shift+Z.",
    action: "history/redoCommitted",
  },
  {
    id: "document.ctrl-a.selects-all",
    trigger: "Ctrl/Cmd+A",
    behavior:
      "Selects every unlocked object on the current page and leaves any entered group, so the selection is read at the page's top level. Locked objects stay out, exactly as they stay out of a click.",
    action: "selection/replaceCommitted",
  },
  {
    id: "document.ctrl-shift-a.deselects",
    trigger: "Ctrl/Cmd+Shift+A",
    behavior:
      "Clears the selection and leaves any entered group — the keyboard's version of clicking empty canvas. Esc is NOT this: it cancels the gesture in flight.",
    action: "selection/clearedCommitted",
  },
  {
    id: "document.ctrl-c.copies-selection",
    trigger: "Ctrl/Cmd+C",
    behavior:
      "Puts the selected objects on the clipboard, with any group of theirs that is selected whole. The document is untouched, so this is not an undo step.",
    action: "clipboard/copyCommitted",
  },
  {
    id: "document.ctrl-x.cuts-selection",
    trigger: "Ctrl/Cmd+X",
    behavior:
      "Copies the selection to the clipboard and then deletes it — two actions, because only the delete belongs in history: undoing a cut restores the objects and leaves the clipboard holding them.",
    action: "object/deleteCommitted",
  },
  {
    id: "document.ctrl-v.pastes-clipboard",
    trigger: "Ctrl/Cmd+V",
    behavior:
      "Puts fresh copies of the clipboard's contents on the current page, offset from their source, and selects them; each further paste of the same contents steps the offset again. A copied group pastes as a group.",
    action: "object/pasteCommitted",
  },
  {
    id: "document.ctrl-d.duplicates-selection",
    trigger: "Ctrl/Cmd+D",
    behavior:
      "Drops a copy of the selection at a fixed offset and selects it — Alt-drag's outcome without the drag, and without disturbing the clipboard.",
    action: "object/duplicateCommitted",
  },
  {
    id: "document.ctrl-s.saves-file",
    trigger: "Ctrl/Cmd+S",
    behavior:
      "Writes the document to its .staples file through the retained handle, with no dialog; a document that has no file yet falls through to Save As. The action commits when the write completes — never on the keypress, because the write is the save.",
    action: "file/savedCommitted",
  },
  {
    id: "document.ctrl-shift-s.saves-file-as",
    trigger: "Ctrl/Cmd+Shift+S",
    behavior:
      "Asks where to write the document — the save picker starts in the default storage folder when one is set — and retains the chosen file so plain Save writes there silently. Cancelling the picker commits nothing.",
    action: "file/savedCommitted",
  },
  {
    id: "document.ctrl-o.opens-file",
    trigger: "Ctrl/Cmd+O",
    behavior:
      "Opens a .staples file — the picker starts in the default storage folder when one is set — replacing the working document and resetting history, exactly as every load does. Cancelling the picker commits nothing.",
    action: "file/openedCommitted",
  },
  {
    id: "viewport.ctrl-zero.fits-page",
    trigger: "Ctrl/Cmd+0",
    behavior:
      "Zooms so the whole page, bleed included, fits the viewport, and re-centers it. Viewport-only: never a history entry.",
    action: "viewport/zoomFitCommitted",
  },
  {
    id: "viewport.ctrl-plus.steps-in",
    trigger: "Ctrl/Cmd+= or Ctrl/Cmd++",
    behavior:
      "Zooms in one preset step, the same ladder the Zoom tool's click climbs. Both the plain and shifted key are accepted, since the plus sign shares its key with the equals sign.",
    action: "viewport/zoomStepCommitted",
  },
  {
    id: "viewport.ctrl-minus.steps-out",
    trigger: "Ctrl/Cmd+-",
    behavior: "Zooms out one preset step, the same ladder in the other direction.",
    action: "viewport/zoomStepCommitted",
  },
];

/** The surfaces a global chord may name, standing in for a tool id. */
export const GLOBAL_KEY_SURFACES: readonly string[] = ["document", "viewport"];
