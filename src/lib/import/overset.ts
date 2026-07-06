import type { FrameObject, LayoutDocument, LayoutObject, TextProps } from "@/schema";
import { inToPx } from "@/lib/layout/geometry";
import { isOverflowing } from "@/lib/layout/text";
import { paraCss, runCss } from "@/components/layout-editor/canvas/rich-text-dom";

/**
 * Import overset check (plan §10.4, part of P4). Publisher's "shrink text to
 * fit" and our font remapping (§10.5) mean an imported frame's declared point
 * size can render taller than its box — "overset" text the associate must fix.
 * This measures which imported text frames overflow so the report panel can
 * list them.
 *
 * The verdict must MATCH what the canvas shows: TextFrameNode inset-pads a
 * `overflow-hidden` content box and flags overflow via `isOverflowing(scroll,
 * client)`. So the measurement builds a detached element at the frame's content
 * width, seeds it with the exact per-run/per-paragraph CSS the canvas renders
 * (runCss/paraCss), and compares its natural height against the frame's inset
 * content-height budget — the same subpixel cushion, at 96dpi / zoom 1.
 *
 * The DOM-touching part is one thin function (measureFrameOverflow); the size
 * math and frame selection are pure so they unit-test in the node env, and all
 * `document` access is guarded so an SSR/node import never throws.
 */

/** True when every run across every paragraph is empty — an empty frame renders
    no content, so it can never overset (short-circuits before any measurement). */
export function isEmptyText(text: TextProps): boolean {
  return text.paragraphs.every((p) => p.runs.every((r) => r.text === ""));
}

/** px for one inset side at a zoom — 0 when absent, matching TextFrameNode's
    `insetPx` (the padding it applies to the content box). */
function insetPx(v: number | undefined, zoom: number): number {
  return v ? inToPx(v, zoom) : 0;
}

/**
 * The frame's inner content box in px — the frame size at 96dpi less its text
 * insets, exactly the box TextFrameNode pads to: `width` is what the runs wrap
 * within, `height` is the budget they must fit inside.
 */
export function contentBoxPx(
  frame: Pick<FrameObject, "w" | "h" | "text">,
  zoom: number,
): { width: number; height: number } {
  const inset = frame.text?.inset;
  return {
    width: inToPx(frame.w, zoom) - insetPx(inset?.l, zoom) - insetPx(inset?.r, zoom),
    height: inToPx(frame.h, zoom) - insetPx(inset?.t, zoom) - insetPx(inset?.b, zoom),
  };
}

/** Every imported text frame the check considers — text frames on all pages
    (the canvas mounts only the active one, so we can't rely on rendered nodes;
    masters carry furniture, not imported body copy). Pure, so which frames get
    measured is testable without a DOM. */
export function importedTextFrames(
  doc: { pages: ReadonlyArray<{ objects: ReadonlyArray<LayoutObject> }> },
): FrameObject[] {
  const frames: FrameObject[] = [];
  for (const page of doc.pages) {
    for (const obj of page.objects) {
      if (obj.type === "text" && obj.text) frames.push(obj);
    }
  }
  return frames;
}

/**
 * Measure one imported text frame against the canvas's own layout: seed a
 * detached element sized to the frame's content width with the same paragraph/
 * run structure and CSS TextFrameNode renders, then compare its natural
 * scrollHeight to the inset content-height budget. `host` is the offscreen
 * measuring container (created once by collectOversetIds and reused per frame).
 */
export function measureFrameOverflow(frame: FrameObject, host: HTMLElement, zoom = 1): boolean {
  const text = frame.text;
  if (!text || isEmptyText(text)) return false; // an empty frame never oversets
  const { width, height } = contentBoxPx(frame, zoom);

  const d = host.ownerDocument;
  const content = d.createElement("div");
  // Mirror TextFrameNode's content wrapper: a fixed content width, the canvas's
  // wrap rules, and no height cap so scrollHeight reads the natural height.
  content.style.boxSizing = "border-box";
  content.style.width = `${width}px`;
  content.style.whiteSpace = "pre-wrap";
  content.style.overflowWrap = "break-word";

  for (const p of text.paragraphs) {
    const pd = d.createElement("div");
    Object.assign(pd.style, paraCss(p, zoom));
    // the paragraph carries its first run's size so empty lines keep height
    pd.style.fontSize = runCss(p.runs[0], zoom).fontSize;
    for (const r of p.runs) {
      const span = d.createElement("span");
      Object.assign(span.style, runCss(r, zoom));
      span.textContent = r.text;
      pd.appendChild(span);
    }
    // an empty paragraph still occupies its line
    if (p.runs.every((r) => r.text === "")) pd.appendChild(d.createElement("br"));
    content.appendChild(pd);
  }

  host.appendChild(content);
  const overflow = isOverflowing(content.scrollHeight, height);
  content.remove();
  return overflow;
}

/**
 * Measure a whole imported document's text frames and return the ids that
 * overflow. Builds one offscreen measuring container (removed when done) so the
 * check spans every page, not just the mounted one. SSR/node-safe: with no DOM
 * (or no text frames) there is nothing to measure, so it returns no ids.
 */
export function collectOversetIds(doc: LayoutDocument, zoom = 1): string[] {
  const frames = importedTextFrames(doc);
  if (!frames.length || typeof document === "undefined") return [];

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "absolute",
    visibility: "hidden",
    left: "-99999px",
    top: "0",
  });
  document.body.appendChild(host);

  const ids: string[] = [];
  try {
    for (const frame of frames) {
      if (measureFrameOverflow(frame, host, zoom)) ids.push(frame.id);
    }
  } finally {
    host.remove();
  }
  return ids;
}
