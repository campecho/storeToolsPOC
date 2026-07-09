"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAssetUrl } from "@/lib/assets/use-asset-url";
import type { PhotoDocument, PhotoOp } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";
import { effectiveDims, straightenScale, type Dims } from "@/lib/photo/geometry";
import { CropOverlay } from "./CropOverlay";
import { StraightenOverlay } from "./StraightenOverlay";

/**
 * The displayed image's box within the canvas container (CSS px), the display
 * scale (CSS px per effective-MASTER px), and the effective-master pixel dims the
 * overlays address. PhotoCanvas computes it in `draw()` and hands it to the crop
 * / straighten overlays so their DOM chrome lands exactly over the drawn image.
 */
export interface CanvasImageLayout {
  /** Displayed image box, CSS px within the container. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** CSS px per effective-master px (dispW / effectiveMasterW). */
  scale: number;
  /** Effective-master pixel dims (ops[0..cursor) folded) the overlay coords use. */
  image: Dims;
}

/* ── offscreen geometry-replay pipeline ──────────────────────────────────── */

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctxOf(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

/**
 * Apply ONE geometry op to the running offscreen canvas, returning a fresh
 * canvas. Crop rects are effective-MASTER-space, so they scale to proxy pixels by
 * `runningScale` (proxy/master — invariant under crop/rotate/flip, and straighten
 * leaves dims unchanged, so it is a single constant for the whole recipe).
 * Non-geometry ops (adjust, …) are a later tranche's LUT pass and pass through
 * untouched here.
 */
function applyGeometryOp(
  current: HTMLCanvasElement,
  op: PhotoOp,
  runningScale: number,
): HTMLCanvasElement {
  const cw = current.width;
  const ch = current.height;
  switch (op.op) {
    case "crop": {
      let sx = Math.round(op.rect.x * runningScale);
      let sy = Math.round(op.rect.y * runningScale);
      let sw = Math.round(op.rect.w * runningScale);
      let sh = Math.round(op.rect.h * runningScale);
      sx = Math.min(Math.max(sx, 0), cw);
      sy = Math.min(Math.max(sy, 0), ch);
      sw = Math.min(Math.max(sw, 1), cw - sx);
      sh = Math.min(Math.max(sh, 1), ch - sy);
      const out = makeCanvas(sw, sh);
      const octx = ctxOf(out);
      // Shape clip → transparency outside the shape; the final composite draws
      // over the pasteboard, which shows through the corners.
      if (op.shape === "rounded") {
        const r = 0.08 * Math.min(sw, sh);
        octx.beginPath();
        octx.roundRect(0, 0, sw, sh, r);
        octx.clip();
      } else if (op.shape === "circle") {
        octx.beginPath();
        octx.ellipse(sw / 2, sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
        octx.clip();
      }
      octx.drawImage(current, sx, sy, sw, sh, 0, 0, sw, sh);
      return out;
    }
    case "rotate": {
      const turns = ((op.quarterTurns % 4) + 4) % 4;
      if (turns === 0) return current;
      const swap = turns % 2 === 1;
      const out = makeCanvas(swap ? ch : cw, swap ? cw : ch);
      const octx = ctxOf(out);
      octx.translate(out.width / 2, out.height / 2);
      octx.rotate((turns * Math.PI) / 2); // positive = clockwise (canvas y-down)
      octx.drawImage(current, -cw / 2, -ch / 2);
      return out;
    }
    case "flip": {
      const out = makeCanvas(cw, ch);
      const octx = ctxOf(out);
      if (op.axis === "horizontal") {
        octx.translate(cw, 0);
        octx.scale(-1, 1);
      } else {
        octx.translate(0, ch);
        octx.scale(1, -1);
      }
      octx.drawImage(current, 0, 0);
      return out;
    }
    case "straighten": {
      if (!op.degrees) return current;
      const k = straightenScale({ w: cw, h: ch }, op.degrees);
      const out = makeCanvas(cw, ch); // cover model — canvas size unchanged
      const octx = ctxOf(out);
      octx.translate(cw / 2, ch / 2);
      octx.rotate((op.degrees * Math.PI) / 180);
      octx.scale(k, k);
      octx.drawImage(current, -cw / 2, -ch / 2);
      return out;
    }
    default:
      return current;
  }
}

function composeGeometry(
  base: CanvasImageSource,
  baseW: number,
  baseH: number,
  ops: PhotoOp[],
  runningScale: number,
): HTMLCanvasElement {
  let cur = makeCanvas(baseW, baseH);
  ctxOf(cur).drawImage(base, 0, 0, baseW, baseH);
  for (const op of ops) cur = applyGeometryOp(cur, op, runningScale);
  return cur;
}

/** Subtle "Original" chip drawn on the canvas, top-left of the image box, while
    the Compare peek is held (space-peek or the panel's Compare button). */
function drawOriginalChip(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.font = "600 11px system-ui, -apple-system, sans-serif";
  const label = "Original";
  const padX = 8;
  const w = Math.ceil(ctx.measureText(label).width) + padX * 2;
  const h = 20;
  const cx = x + 10;
  const cy = y + 10;
  ctx.fillStyle = "rgba(20,20,20,.62)";
  ctx.beginPath();
  ctx.roundRect(cx, cy, w, h, 5);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx + padX, cy + h / 2 + 0.5);
  ctx.restore();
}

function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * The proxy canvas (wire region 5). PE1 drew the fit-to-viewport proxy on the
 * pasteboard; PE2 adds the GEOMETRY REPLAY: ops[0..cursor) + the live `previewOp`
 * are folded through an offscreen pipeline (crop / rotate / flip / straighten)
 * and the composed bitmap is what gets contain-fit + shadowed onto the visible
 * canvas. The compose is cached by (source, cursor, recipe, previewOp) so a pure
 * resize never re-runs it, and the whole thing stays rAF-coalesced.
 *
 * `comparing` (the Compare peek — also driven by the space-peek listener below)
 * skips ALL ops and the preview and paints the raw proxy with an "Original" chip.
 *
 * The displayed-image box + display scale are published as `layout` so the crop
 * and straighten overlays render their chrome exactly over the drawn image; the
 * layout only changes on resize / doc / ops / preview, never on a crop-draft drag.
 */
export function PhotoCanvas({
  doc,
  previewBitmap,
  onZoom,
}: {
  doc: PhotoDocument | null;
  previewBitmap: ImageBitmap | null;
  onZoom: (pct: number | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const proxyImgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const proxyUrl = useAssetUrl(doc?.source.proxyAssetId);

  // Session gesture state — drives the geometry replay and the overlays.
  const activeTool = usePhotoStore((s) => s.activeTool);
  const previewOp = usePhotoStore((s) => s.previewOp);
  const comparing = usePhotoStore((s) => s.comparing);
  const setComparing = usePhotoStore((s) => s.setComparing);

  // Latest inputs read through refs so the draw closure never goes stale and the
  // resize listener stays installed once.
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  const previewRef = useRef<ImageBitmap | null>(previewBitmap);
  previewRef.current = previewBitmap;
  const docRef = useRef<PhotoDocument | null>(doc);
  docRef.current = doc;
  const previewOpRef = useRef<PhotoOp | null>(previewOp);
  previewOpRef.current = previewOp;
  const comparingRef = useRef(comparing);
  comparingRef.current = comparing;

  // Composed-bitmap memo, keyed by (source, baseW, cursor, recipe, previewOp, s).
  const composeCacheRef = useRef<{ key: readonly unknown[]; canvas: HTMLCanvasElement } | null>(
    null,
  );

  // Overlay layout, published from draw() with change-detection (no render loop).
  const [layout, setLayout] = useState<CanvasImageLayout | null>(null);
  const layoutRef = useRef<CanvasImageLayout | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = container.clientWidth;
    const cssH = container.clientHeight;
    if (cssW === 0 || cssH === 0) return;

    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#d3d3d3";
    ctx.fillRect(0, 0, cssW, cssH);

    // Base source: the server proxy once decoded, else the instant local preview.
    const proxy = proxyImgRef.current;
    let base: CanvasImageSource | null = null;
    let baseW = 0;
    let baseH = 0;
    if (proxy && proxy.complete && proxy.naturalWidth > 0) {
      base = proxy;
      baseW = proxy.naturalWidth;
      baseH = proxy.naturalHeight;
    } else if (previewRef.current) {
      base = previewRef.current;
      baseW = previewRef.current.width;
      baseH = previewRef.current.height;
    }

    if (!base || baseW === 0 || baseH === 0) {
      onZoomRef.current(null);
      if (layoutRef.current !== null) {
        layoutRef.current = null;
        setLayout(null);
      }
      return;
    }

    const d = docRef.current;
    const masterW = d?.source.width ?? baseW;
    const masterH = d?.source.height ?? baseH;
    // Proxy/master effective scale — invariant across the whole geometry recipe.
    const runningScale = baseW / masterW;
    const appliedOps = d ? d.recipe.slice(0, d.cursor) : [];
    const preview = previewOpRef.current;
    const isComparing = comparingRef.current;

    let source: CanvasImageSource = base;
    let srcW = baseW;
    let srcH = baseH;
    const needsCompose = !isComparing && (appliedOps.length > 0 || preview != null);
    if (needsCompose) {
      const key: readonly unknown[] = [base, baseW, d?.recipe, d?.cursor, preview, runningScale];
      let cache = composeCacheRef.current;
      if (!cache || !sameKey(cache.key, key)) {
        const ops = preview ? [...appliedOps, preview] : appliedOps;
        cache = { key, canvas: composeGeometry(base, baseW, baseH, ops, runningScale) };
        composeCacheRef.current = cache;
      }
      source = cache.canvas;
      srcW = cache.canvas.width;
      srcH = cache.canvas.height;
    }

    const pad = 24;
    const availW = Math.max(1, cssW - pad * 2);
    const availH = Math.max(1, cssH - pad * 2);
    const fit = Math.min(availW / srcW, availH / srcH);
    const dispW = srcW * fit;
    const dispH = srcH * fit;
    const x = (cssW - dispW) / 2;
    const y = (cssH - dispH) / 2;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.22)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 3;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, x, y, dispW, dispH);
    ctx.restore();

    if (isComparing) drawOriginalChip(ctx, x, y);

    // Zoom % = fraction of the full-resolution (effective) master shown on screen.
    const fullResW = srcW / runningScale;
    onZoomRef.current(Math.round((dispW / fullResW) * 100));

    // Overlay layout: coords address the effective master (ops[0..cursor) folded);
    // straighten preview keeps dims, so the box aligns whether previewing or not.
    const src0: Dims = { w: masterW, h: masterH };
    const eff = d ? effectiveDims(src0, appliedOps) : { w: masterW, h: masterH };
    const scale = dispW / eff.w;
    const next: CanvasImageLayout = { x, y, w: dispW, h: dispH, scale, image: eff };
    const prev = layoutRef.current;
    if (
      !prev ||
      prev.x !== next.x ||
      prev.y !== next.y ||
      prev.w !== next.w ||
      prev.h !== next.h ||
      prev.scale !== next.scale ||
      prev.image.w !== next.image.w ||
      prev.image.h !== next.image.h
    ) {
      layoutRef.current = next;
      setLayout(next);
    }
  }, []);

  const schedule = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  // Resize observer — one install for the component's life.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(schedule);
    ro.observe(container);
    schedule();
    return () => {
      ro.disconnect();
      if (rafRef.current != null) {
        // Reset the handle or every post-remount schedule() no-ops (StrictMode
        // double-mount leaves the cancelled id behind otherwise).
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [schedule]);

  // Load the proxy image when the resolved object URL changes.
  useEffect(() => {
    if (!proxyUrl) {
      proxyImgRef.current = null;
      composeCacheRef.current = null;
      schedule();
      return;
    }
    const img = new Image();
    img.onload = () => {
      proxyImgRef.current = img;
      composeCacheRef.current = null; // new base — invalidate the compose memo
      schedule();
    };
    img.src = proxyUrl;
    return () => {
      img.onload = null;
    };
  }, [proxyUrl, schedule]);

  // Repaint when the preview bitmap, the document (recipe/cursor), the live
  // preview op, or the compare peek changes.
  useEffect(() => {
    schedule();
  }, [previewBitmap, doc, previewOp, comparing, schedule]);

  // Space-peek: hold Space to compare against the original (mirrors the panel's
  // Compare button hold). Ignores typing targets, cleans up StrictMode-safely.
  useEffect(() => {
    const peek = { active: false };
    const isTypingTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (!docRef.current || isTypingTarget(e.target)) return;
      e.preventDefault();
      if (peek.active) return;
      peek.active = true;
      setComparing(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !peek.active) return;
      peek.active = false;
      setComparing(false);
    };
    const onBlur = () => {
      if (!peek.active) return;
      peek.active = false;
      setComparing(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (peek.active) {
        peek.active = false;
        setComparing(false);
      }
    };
  }, [setComparing]);

  const showCropChrome = doc != null && layout != null && activeTool === "crop";

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-[#d3d3d3]">
      <canvas ref={canvasRef} data-testid="photo-canvas" className="block" />
      {showCropChrome && previewOp?.op === "straighten" && <StraightenOverlay layout={layout} />}
      {showCropChrome && <CropOverlay layout={layout} />}
    </div>
  );
}
