import { useEffect } from "react";
import { useFeedbackStore, useLayoutStore } from "@/store";
import { NUDGE_IN } from "@/lib/layout/objects";

/**
 * Editor-wide keyboard (plan L4): Delete/Backspace, Cmd/Ctrl+D duplicate,
 * Cmd/Ctrl+C/X/V copy/cut/paste (plan L13), arrow nudge 1/32 in (Shift ×10),
 * Cmd/Ctrl+Z / Shift+Z undo/redo, Cmd/Ctrl+]/[ z-order, Esc deselect. Typing
 * surfaces keep their keys — the contentEditable guard below yields the
 * clipboard shortcuts to the browser inside a text session — and per §3.1 the
 * suite overlays (report modal, notifications, celebrate) own the keyboard
 * while open, so the editor yields entirely.
 */
export function useEditorKeyboard() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      const f = useFeedbackStore.getState();
      if (f.reportOpen || f.notifOpen || f.celebrateOpen) return;

      const s = useLayoutStore.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d" && s.selectedIds.length) {
        e.preventDefault();
        s.duplicateSelection();
        return;
      }
      // clipboard (plan L13) — only claim the keystroke when there's something
      // to act on, so an empty editor never swallows a native copy/paste
      if (mod && e.key.toLowerCase() === "c") {
        if (s.selectedIds.length) {
          e.preventDefault();
          s.copySelection();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "x") {
        if (s.selectedIds.length) {
          e.preventDefault();
          s.cutSelection();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        if (s.clipboard.length) {
          e.preventDefault();
          s.pasteClipboard();
        }
        return;
      }
      if (mod && e.key === "]") {
        e.preventDefault();
        s.reorder("forward");
        return;
      }
      if (mod && e.key === "[") {
        e.preventDefault();
        s.reorder("backward");
        return;
      }
      if (e.key === "Escape") {
        if (s.selectedGuide) s.selectGuide(null);
        if (s.selectedIds.length) s.setSelection([]);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        // a selected ruler guide deletes first (plan L11), else the objects
        if (s.selectedGuide) {
          e.preventDefault();
          s.removeGuide(s.selectedGuide.axis, s.selectedGuide.index);
          return;
        }
        if (s.selectedIds.length) {
          e.preventDefault();
          s.deleteSelection();
          return;
        }
      }
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const a = arrows[e.key];
      if (a && s.selectedIds.length) {
        e.preventDefault();
        const step = NUDGE_IN * (e.shiftKey ? 10 : 1);
        s.nudgeSelection(a[0] * step, a[1] * step);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
