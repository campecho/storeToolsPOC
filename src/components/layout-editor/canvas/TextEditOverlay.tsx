"use client";

import { useEffect, useRef } from "react";
import type { FrameObject } from "@/schema";
import { surfaceObjects, useLayoutStore } from "@/store";
import { inToPx } from "@/lib/layout/geometry";
import { textSummary } from "@/lib/layout/text";
import {
  captureCaretOffset,
  parseEditableDom,
  restoreCaretOffset,
  seedEditableDom,
} from "./rich-text-dom";

/**
 * The contentEditable editing layer (plan §3.2/L5, per-run since P2):
 * positioned exactly over the frame at the current zoom, seeded with real
 * paragraph/run DOM (rich-text-dom.ts) so imported mixed styling stays
 * WYSIWYG while editing. Uncontrolled — the element owns the caret; every
 * input parses the DOM back to paragraphs transiently, and the whole session
 * commits ONE history snapshot on close (captured at mount, committed at
 * unmount — the per-gesture rule from §3.3). When the document text changes
 * from OUTSIDE the session (ribbon/inspector styling clicks) or the zoom
 * changes, the DOM reseeds and the caret is restored by plain-text offset.
 * Cmd/Ctrl+B/I/U toggle real document props; Escape ends the session.
 */
export function TextEditOverlay({ obj, zoom }: { obj: FrameObject; zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const text = obj.text!;
  const summary = textSummary(text);

  // Mount-only (keyed by frame id): capture the before-document for the
  // session's single history commit, seed the DOM, focus, caret at end.
  useEffect(() => {
    const store = useLayoutStore.getState();
    const before = store.doc;
    const el = ref.current;
    if (el) {
      const target = surfaceObjects(store).find((o) => o.id === obj.id);
      const current = target?.type === "text" && target.text ? target.text : null;
      if (current) {
        seedEditableDom(el, current, lastZoom.current);
        lastEmitted.current = JSON.stringify(current.paragraphs);
      }
      el.focus();
      const sel = window.getSelection();
      if (sel) {
        // caret at the end, INSIDE the last paragraph block — a root-level
        // caret would make the browser type outside the paragraph structure
        const range = document.createRange();
        range.selectNodeContents(el.lastElementChild ?? el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    return () => {
      useLayoutStore.getState().commitGesture(before);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.id]);

  // External change or zoom change → reseed and put the caret back. Our own
  // onInput emissions are skipped via lastEmitted, so typing never reseeds.
  const lastZoom = useRef(zoom);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const incoming = JSON.stringify(text.paragraphs);
    if (incoming === lastEmitted.current && lastZoom.current === zoom) return;
    const caret = captureCaretOffset(el);
    seedEditableDom(el, text, zoom);
    lastEmitted.current = incoming;
    lastZoom.current = zoom;
    if (caret !== null) restoreCaretOffset(el, caret);
  }, [text, zoom]);

  const insetPx = (v: number | undefined) => (v ? inToPx(v, zoom) : 0);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Text frame content"
      data-testid="text-edit-overlay"
      className="absolute z-20 overflow-hidden whitespace-pre-wrap break-words outline-none"
      style={{
        left: inToPx(obj.x, zoom),
        top: inToPx(obj.y, zoom),
        width: inToPx(obj.w, zoom),
        height: inToPx(obj.h, zoom),
        // editing a rotated frame keeps the overlay on the frame (L10)
        transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
        paddingLeft: insetPx(text.inset?.l),
        paddingRight: insetPx(text.inset?.r),
        paddingTop: insetPx(text.inset?.t),
        paddingBottom: insetPx(text.inset?.b),
        boxShadow: "0 0 0 1.5px var(--color-brand)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPaste={(e) => {
        // Plain-text paste only — foreign markup would poison the run parse.
        e.preventDefault();
        const plain = e.clipboardData.getData("text/plain");
        if (plain) document.execCommand("insertText", false, plain);
      }}
      onInput={(e) => {
        const el = e.currentTarget;
        const paragraphs = parseEditableDom(
          el,
          { font: summary.font, color: summary.color },
          { align: summary.align, lineSpacing: summary.lineSpacing },
        );
        lastEmitted.current = JSON.stringify(paragraphs);
        useLayoutStore.getState().setTextParagraphs(obj.id, paragraphs);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          useLayoutStore.getState().setEditingText(null);
          return;
        }
        if (e.metaKey || e.ctrlKey) {
          const toggle = { b: "bold", i: "italic", u: "underline" } as const;
          const key = e.key.toLowerCase() as keyof typeof toggle;
          if (key in toggle) {
            // keep formatting in the document model, not browser rich-text
            e.preventDefault();
            const prop = toggle[key];
            useLayoutStore.getState().setTextProps(obj.id, { [prop]: !summary.font[prop] });
          }
        }
      }}
    />
  );
}
