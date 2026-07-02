"use client";

import { useEffect, useRef } from "react";
import type { FrameObject } from "@/schema";
import { useLayoutStore } from "@/store";
import { inToPx } from "@/lib/layout/geometry";
import { fontStack, ptToPx } from "@/lib/layout/text";

/**
 * The contentEditable editing layer (plan §3.2/L5): positioned exactly over
 * the frame at the current zoom with identical text metrics, so editing is
 * WYSIWYG. Uncontrolled — the element owns the caret; every input writes the
 * plain text back transiently, and the whole session commits ONE history
 * snapshot on close (captured at mount, committed at unmount — the
 * per-gesture rule from §3.3). Cmd/Ctrl+B/I/U toggle real document props
 * instead of browser rich-text; Escape ends the session.
 */
export function TextEditOverlay({ obj, zoom }: { obj: FrameObject; zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const text = obj.text!;

  // Mount-only (keyed by frame id): seed the DOM content, then leave it to
  // the element — React must never reconcile a contentEditable's children,
  // or typing structure and the caret get destroyed on unrelated re-renders.
  useEffect(() => {
    const store = useLayoutStore.getState();
    const before = store.doc;
    const el = ref.current;
    if (el) {
      const page = store.doc.pages.find((p) => p.id === store.activePageId);
      const target = page?.objects.find((o) => o.id === obj.id);
      el.textContent = target?.type === "text" ? (target.text?.content ?? "") : "";
      el.focus();
      // caret at the end of the existing content
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    return () => {
      useLayoutStore.getState().commitGesture(before);
    };
  }, [obj.id]);

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
        fontFamily: fontStack(text.font.family),
        fontSize: ptToPx(text.font.size, zoom),
        fontWeight: text.font.bold ? 700 : 400,
        fontStyle: text.font.italic ? "italic" : undefined,
        textDecoration: text.font.underline ? "underline" : undefined,
        textAlign: text.align,
        lineHeight: text.lineSpacing,
        color: "#111111",
        boxShadow: "0 0 0 1.5px var(--color-brand)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onInput={(e) => {
        useLayoutStore.getState().setTextContent(obj.id, e.currentTarget.innerText ?? "");
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
            useLayoutStore.getState().setTextProps(obj.id, { [prop]: !text.font[prop] });
          }
        }
      }}
    />
  );
}
