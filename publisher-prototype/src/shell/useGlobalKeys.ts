import { useEffect, useRef } from "react";
import { COPY_OFFSET_IN } from "../core/gestures";
import { fitZoom, zoomInStep, zoomOutStep, type Size } from "../core/geometry/viewport";
import { copiedGroups, copiesOf } from "../core/model";
import { effectivePageSetup } from "../core/render/pageSetup";
import {
  clipboardCopyCommitted,
  objectDeleteCommitted,
  objectDuplicateCommitted,
  objectPasteCommitted,
  redoCommitted,
  selectDocument,
  selectionClearedCommitted,
  selectionReplaceCommitted,
  undoCommitted,
  zoomFitCommitted,
  zoomStepCommitted,
} from "../core/store";
import { useAppDispatch, useAppSelector } from "./hooks";
import { isTextEntryTarget } from "./isTextEntryTarget";
import { createGroupId, createObjectId } from "./objectId";

/**
 * The global key chords (core/registry/globalKeys.ts): undo/redo, select all
 * and deselect, the object clipboard, keyboard duplicate, and the zoom keys.
 *
 * They live here rather than in useToolGestures because none of them is a
 * gesture: no tool has to be armed, no pointer is involved, and nothing
 * needs canvas geometry. They live in ONE place rather than beside each
 * feature so the set is readable as a set — and so a new chord cannot
 * silently collide with an old one.
 *
 * Every chord requires Ctrl or Cmd, which is what keeps it clear of the bare
 * tool letters in App.tsx, and every one it handles is preventDefault-ed:
 * these are the browser's own chords too, and a paste that also bookmarks the
 * page or a zoom that also scales the browser window would be worse than no
 * binding at all. preventDefault comes BEFORE the empty-selection checks for
 * the same reason it does on Delete — "nothing was selected" is no reason to
 * let Ctrl+D open a bookmark dialog.
 */
export function useGlobalKeys({
  pageIndex,
  vpSize,
  onSelectionSurfaced,
}: {
  pageIndex: number;
  vpSize: Size;
  /** Hands the page to the Select tool — the tool that acts on a selection. */
  onSelectionSurfaced: () => void;
}): void {
  const dispatch = useAppDispatch();
  const doc = useAppSelector(selectDocument);
  const selectedIds = useAppSelector((s) => s.selection.ids);
  const clipboard = useAppSelector((s) => s.clipboard);
  const viewport = useAppSelector((s) => s.viewport);

  // The listener registers once and reads current values through the ref, the
  // same shape useToolGestures uses: re-subscribing on every document change
  // would churn a window listener per keystroke's worth of state.
  const argsRef = useRef({ doc, selectedIds, clipboard, viewport, pageIndex, vpSize, onSelectionSurfaced });
  argsRef.current = { doc, selectedIds, clipboard, viewport, pageIndex, vpSize, onSelectionSurfaced };

  // A held pointer button stands in for "a gesture may be in flight". The
  // canvas chords can check the gesture session directly (useToolGestures);
  // these cannot, because a preview lives outside the store by design (§6.3),
  // and a chord that edited the document mid-drag would leave the gesture to
  // commit against a page that had moved under it. Losing focus with the
  // button down would eat the pointerup, so blur clears it too.
  const pointerDownRef = useRef(false);
  useEffect(() => {
    const down = () => (pointerDownRef.current = true);
    const up = () => (pointerDownRef.current = false);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", up);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || isTextEntryTarget(e.target)) return;
      if (pointerDownRef.current) return;
      const args = argsRef.current;
      const objects = args.doc.pages[args.pageIndex]?.objects ?? [];
      const selection = objects.filter((o) => args.selectedIds.includes(o.id));
      const key = e.key.toLowerCase();

      switch (key) {
        case "z": {
          // document.ctrl-z.undoes / document.ctrl-shift-z.redoes. Both are
          // no-ops on an empty stack, so neither needs a guard here.
          e.preventDefault();
          dispatch(e.shiftKey ? redoCommitted() : undoCommitted());
          return;
        }
        case "y": {
          // document.ctrl-shift-z.redoes' other half — Publisher's redo.
          e.preventDefault();
          dispatch(redoCommitted());
          return;
        }
        case "a": {
          e.preventDefault();
          if (e.shiftKey) {
            // document.ctrl-shift-a.deselects
            dispatch(selectionClearedCommitted());
            return;
          }
          // document.ctrl-a.selects-all: locked objects stay out, exactly as
          // they stay out of a click, and the page's top level is the context
          // — a selection spanning the whole page is in no one group.
          const ids = objects.filter((o) => !o.locked).map((o) => o.id);
          if (ids.length === 0) return;
          dispatch(selectionReplaceCommitted({ ids, enteredGroupId: null }));
          args.onSelectionSurfaced();
          return;
        }
        case "c":
        case "x": {
          // document.ctrl-c.copies-selection / document.ctrl-x.cuts-selection.
          // A cut is the copy plus a delete: two actions, because only the
          // delete belongs in history. Undoing a cut brings the objects back
          // and leaves the clipboard still holding them.
          e.preventDefault();
          if (selection.length === 0) return;
          dispatch(
            clipboardCopyCommitted({
              objects: selection,
              groups: copiedGroups(selection, objects, args.doc.groups),
            }),
          );
          if (key === "x") {
            dispatch(objectDeleteCommitted({ pageIndex: args.pageIndex, ids: [...args.selectedIds] }));
          }
          return;
        }
        case "v": {
          // document.ctrl-v.pastes-clipboard: fresh ids at paste time, so
          // pasting twice yields two independent sets. The offset steps with
          // each paste of the same contents, which is what keeps the second
          // paste from hiding under the first.
          e.preventDefault();
          if (args.clipboard.objects.length === 0) return;
          const step = COPY_OFFSET_IN * (args.clipboard.pastes + 1);
          const copies = copiesOf({
            objects: args.clipboard.objects,
            groups: args.clipboard.groups,
            dx: step,
            dy: step,
            idFactory: createObjectId,
            groupIdFactory: createGroupId,
          });
          dispatch(objectPasteCommitted({ pageIndex: args.pageIndex, ...copies }));
          args.onSelectionSurfaced();
          return;
        }
        case "d": {
          // document.ctrl-d.duplicates-selection: Alt-drag's outcome without
          // the drag, so it commits Alt-drag's action and leaves the clipboard
          // alone.
          e.preventDefault();
          if (selection.length === 0) return;
          const copies = copiesOf({
            objects: selection,
            groups: copiedGroups(selection, objects, args.doc.groups),
            dx: COPY_OFFSET_IN,
            dy: COPY_OFFSET_IN,
            idFactory: createObjectId,
            groupIdFactory: createGroupId,
          });
          dispatch(objectDuplicateCommitted({ pageIndex: args.pageIndex, ...copies }));
          args.onSelectionSurfaced();
          return;
        }
        case "0": {
          // viewport.ctrl-zero.fits-page — the debug bar's Fit, on a key.
          e.preventDefault();
          if (args.vpSize.w <= 0 || args.vpSize.h <= 0) return;
          const setup = effectivePageSetup(args.doc, args.pageIndex);
          dispatch(
            zoomFitCommitted({
              zoom: fitZoom(setup.size.w, setup.size.h, setup.bleed, args.vpSize.w, args.vpSize.h),
              pan: { x: 0, y: 0 },
            }),
          );
          return;
        }
        case "=":
        case "+":
        case "-": {
          // viewport.ctrl-plus.steps-in / viewport.ctrl-minus.steps-out: the
          // preset ladder the Zoom tool's click climbs. Pan is carried through
          // unchanged, so the step holds the view's centre.
          e.preventDefault();
          const zoom = key === "-" ? zoomOutStep(args.viewport.zoom) : zoomInStep(args.viewport.zoom);
          dispatch(zoomStepCommitted({ zoom, pan: args.viewport.pan }));
          return;
        }
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);
}
