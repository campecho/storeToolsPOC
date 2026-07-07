import type { FrameObject, LayoutDocument, LayoutObject, TextProps } from "@/schema";
import { inToPx } from "@/lib/layout/geometry";
import { isOverflowing } from "@/lib/layout/text";
import { paraCss, runCss } from "@/components/layout-editor/canvas/rich-text-dom";

/**
 * Import overset check + autofit (plan §10.4–§10.5, part of P4). Publisher's
 * "shrink text on overflow" and our font remapping (§10.5) mean an imported
 * frame's declared point size can render taller than its box: the remapped
 * stand-in font runs ~1–3% wider, so a line that fit in Publisher wraps and
 * clips. Two exports work together off one measurement:
 *
 *  - `computeAutofit(doc)` — for every candidate frame, the largest uniform
 *    render-time scale (1%-quantized, down to AUTOFIT_MIN_SCALE) that makes it
 *    fit. A scale within the floor band is auto-applied (silently-but-reported);
 *    a frame the floor can't rescue renders at its TRUE declared size and stays
 *    badged. This is what the OversetCheck effect runs.
 *  - `collectOversetIds(doc)` — the raw "which frames overflow AS THEY CURRENTLY
 *    RENDER" verdict (at each frame's stored `text.fontScale`). Kept as the
 *    honest overflow probe.
 *
 * The verdict must MATCH what the canvas shows: TextFrameNode inset-pads a
 * `overflow-hidden` content box and flags overflow via `isOverflowing(scroll,
 * client)`. So the measurement builds a detached element at the frame's content
 * width, seeds it with the exact per-run/per-paragraph CSS the canvas renders
 * (runCss/paraCss, at a given scale), and compares its natural height against
 * the frame's inset content-height budget — the same subpixel cushion, at
 * 96dpi / zoom 1.
 *
 * The DOM-touching part is one thin function (measureFrameOverflow); the size
 * math, frame selection, and the autofit SCAN (via an injectable measure fn)
 * are pure so they unit-test in the node env, and all `document` access is
 * guarded so an SSR/node import never throws.
 */

/**
 * Import-autofit floor band (§10.5). The largest shrink we apply silently:
 * a frame that fits at ≥ 0.88 is auto-scaled (and reported); one that needs
 * more than a 12% reduction renders at its declared size and stays badged, so
 * we never quietly render body copy small enough to hurt legibility. Tunable —
 * chosen so the observed ~1–3% stand-in overrun is absorbed with wide margin,
 * while a genuinely oversized frame still surfaces to the associate.
 */
export const AUTOFIT_MIN_SCALE = 0.88;

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
 * measuring container (created once by the caller and reused per frame).
 *
 * `fontScale` is the render-time uniform scale to probe at — it is passed
 * EXPLICITLY into runCss (both the run spans and the paragraph div's mirrored
 * fontSize) and always applied to the frame's DECLARED run sizes. The frame's
 * stored `text.fontScale` is deliberately NOT read here, so a re-measure after
 * a shrink starts from declared sizes rather than compounding the prior scale
 * (idempotency — see computeAutofit's convergence contract).
 */
export function measureFrameOverflow(
  frame: FrameObject,
  host: HTMLElement,
  zoom = 1,
  fontScale = 1,
): boolean {
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
    // the paragraph carries its first run's scaled size so empty lines keep height
    pd.style.fontSize = runCss(p.runs[0], zoom, fontScale).fontSize;
    for (const r of p.runs) {
      const span = d.createElement("span");
      Object.assign(span.style, runCss(r, zoom, fontScale));
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

/** The offscreen measuring container the DOM measurer reads scrollHeight from —
    detached from layout, hidden, one per collectOversetIds/computeAutofit pass.
    Caller appends it to the body and removes it when done. */
function createMeasureHost(): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "absolute",
    visibility: "hidden",
    left: "-99999px",
    top: "0",
  });
  return host;
}

/**
 * Measure a whole imported document's text frames and return the ids that
 * overflow AS THEY CURRENTLY RENDER — each frame is probed at its own stored
 * `text.fontScale` (absent = 1), so the verdict matches the canvas after an
 * autofit shrink, not the declared-size worst case. Builds one offscreen
 * measuring container (removed when done) so the check spans every page, not
 * just the mounted one. SSR/node-safe: with no DOM (or no text frames) there is
 * nothing to measure, so it returns no ids.
 */
export function collectOversetIds(doc: LayoutDocument, zoom = 1): string[] {
  const frames = importedTextFrames(doc);
  if (!frames.length || typeof document === "undefined") return [];

  const host = createMeasureHost();
  document.body.appendChild(host);

  const ids: string[] = [];
  try {
    for (const frame of frames) {
      const scale = frame.text?.fontScale ?? 1;
      if (measureFrameOverflow(frame, host, zoom, scale)) ids.push(frame.id);
    }
  } finally {
    host.remove();
  }
  return ids;
}

/** One autofit entry: the render-time scale to apply to a frame (1 = declared,
    which the store treats as "clear any stored fontScale"). */
export type AutofitEntry = { objectId: string; scale: number };

/** Overflow probe for one candidate at a trial scale — true = still overflows.
    The default is the real DOM measurer (measureFrameOverflow); the scan is
    written against this seam so its decision logic unit-tests without a browser. */
export type OverflowProbe = (frame: FrameObject, scale: number) => boolean;

export interface AutofitOptions {
  /** Inject a synthetic probe to test the scan headlessly; omit for the real
      DOM measurer. */
  measure?: OverflowProbe;
  zoom?: number;
}

/**
 * Descending 1%-quantized scan for the largest scale that fits: probes 1.00,
 * 0.99, … down to `minScale`, returning the first scale with no overflow, or
 * null if even the floor overflows. Overflow is monotonic in scale (bigger text
 * → taller → more overflow), so the first fit IS the largest fit.
 */
function scanForFit(frame: FrameObject, measure: OverflowProbe, minScale: number): number | null {
  const floorPct = Math.round(minScale * 100);
  for (let pct = 100; pct >= floorPct; pct--) {
    const scale = pct / 100;
    if (!measure(frame, scale)) return scale;
  }
  return null;
}

/**
 * Import autofit (§10.5's "shrink text on overflow"). For every CANDIDATE
 * imported text frame — one that overflows at its declared size OR currently
 * carries a `text.fontScale` to reconcile — find the largest 1%-quantized scale
 * (down to AUTOFIT_MIN_SCALE) that makes it fit, measuring always from DECLARED
 * run sizes (never compounding the stored scale). The result:
 *
 *  - fits at 1.00 → `{ scale: 1 }` (clears any stale scale; also how a frame
 *    that only carried a scale but now fits converges back to declared);
 *  - fits at s < 1 within the floor band → `{ scale: s }` (auto-applied,
 *    silently-but-reported by the store);
 *  - overflows even at the floor → `{ scale: 1 }` AND the id in `overset` — per
 *    the product decision, beyond-floor frames render at their TRUE declared
 *    size and stay badged (no half-shrink).
 *
 * A frame that fits at declared size and carries no scale is NOT a candidate:
 * no entry, no change. `entries` covers exactly the candidates evaluated, in
 * document (page then object) order — deterministic. Pass `{ measure }` to run
 * the scan against a synthetic probe (tests); the default builds the one
 * offscreen host and is SSR/node-safe (no DOM and no injected probe → empty).
 */
export function computeAutofit(
  doc: LayoutDocument,
  opts: AutofitOptions = {},
): { entries: AutofitEntry[]; overset: string[] } {
  const zoom = opts.zoom ?? 1;
  const frames = importedTextFrames(doc);
  const entries: AutofitEntry[] = [];
  const overset: string[] = [];
  if (!frames.length) return { entries, overset };

  // An injected probe (tests) runs headless; otherwise stand up the one shared
  // offscreen host the DOM measurer reads, and tear it down after. With neither
  // a probe nor a DOM there is nothing to measure — return empty (SSR-safe).
  const injected = opts.measure;
  let host: HTMLElement | undefined;
  if (!injected) {
    if (typeof document === "undefined") return { entries, overset };
    host = createMeasureHost();
    document.body.appendChild(host);
  }
  const measure: OverflowProbe =
    injected ?? ((frame, scale) => measureFrameOverflow(frame, host!, zoom, scale));

  try {
    for (const frame of frames) {
      const carriesScale = frame.text?.fontScale != null;
      const fit = scanForFit(frame, measure, AUTOFIT_MIN_SCALE);
      if (fit === null) {
        // Overflows even at the floor: render at declared size, keep the badge.
        entries.push({ objectId: frame.id, scale: 1 });
        overset.push(frame.id);
      } else if (fit < 1) {
        // Overflowed at declared, fits within the floor band → auto-apply.
        entries.push({ objectId: frame.id, scale: fit });
      } else if (carriesScale) {
        // Fits at declared and carried a stale scale → converge back to 1.
        entries.push({ objectId: frame.id, scale: 1 });
      }
      // else: fits at declared, no stored scale — not a candidate, no entry.
    }
  } finally {
    host?.remove();
  }
  return { entries, overset };
}
