"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAssetUrl } from "@/lib/assets/use-asset-url";
import { getAssetUrl } from "@/lib/assets/blob-store";
import type { PhotoDocument, PhotoOp } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";
import { effectiveDims, isGeometryOp, straightenScale, type Dims } from "@/lib/photo/geometry";
import {
  collectAdjustState,
  compileAdjust,
  isAdjustIdentity,
  type AdjustState,
} from "@/lib/photo/adjust-math";
import { applyAdjust } from "@/lib/photo/ops";
import { foldOverlays, paintOverlayContent } from "@/lib/photo/overlay-raster";
import { ensureFamiliesLoaded } from "@/lib/layout/webfonts";
import { CropOverlay } from "./CropOverlay";
import { StraightenOverlay } from "./StraightenOverlay";
import { OverlayHandles } from "./OverlayHandles";
import { GuideChrome } from "./GuideChrome";

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
 * MIRROR edge fill (bleedExpand) — reflect each edge strip (and each corner
 * block) outward, matching sharp's `extendWith: "mirror"`. The center image is
 * drawn separately at (px, px); this fills only the outer band + corners.
 */
function drawMirrorBorder(
  octx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  px: number,
  cw: number,
  ch: number,
): void {
  // Top / bottom / left / right strips, each reflected across the image edge.
  octx.save();
  octx.translate(px, px);
  octx.scale(1, -1);
  octx.drawImage(src, 0, 0, cw, px, 0, 0, cw, px); // top
  octx.restore();

  octx.save();
  octx.translate(px, px + ch);
  octx.scale(1, -1);
  octx.drawImage(src, 0, ch - px, cw, px, 0, -px, cw, px); // bottom
  octx.restore();

  octx.save();
  octx.translate(px, px);
  octx.scale(-1, 1);
  octx.drawImage(src, 0, 0, px, ch, 0, 0, px, ch); // left
  octx.restore();

  octx.save();
  octx.translate(px + cw, px);
  octx.scale(-1, 1);
  octx.drawImage(src, cw - px, 0, px, ch, -px, 0, px, ch); // right
  octx.restore();

  // Corners — reflect the px×px corner block across both axes so they stay
  // continuous with both adjacent edges.
  const corner = (sx: number, sy: number, dx: number, dy: number) => {
    octx.save();
    octx.translate(dx + px, dy + px);
    octx.scale(-1, -1);
    octx.drawImage(src, sx, sy, px, px, 0, 0, px, px);
    octx.restore();
  };
  corner(0, 0, 0, 0); // top-left
  corner(cw - px, 0, px + cw, 0); // top-right
  corner(0, ch - px, 0, px + ch); // bottom-left
  corner(cw - px, ch - px, px + cw, px + ch); // bottom-right
}

/**
 * SMEAR edge fill (bleedExpand) — stretch the 1px edge line across the band (and
 * the single corner pixel across each corner block). This is the client-side
 * equivalent of sharp's `extendWith: "copy"`: SMEAR ≡ COPY (a directional edge
 * stretch), the manual-only strategy analyzeEdges never auto-picks.
 */
function drawSmearBorder(
  octx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  px: number,
  cw: number,
  ch: number,
): void {
  octx.drawImage(src, 0, 0, cw, 1, px, 0, cw, px); // top edge line
  octx.drawImage(src, 0, ch - 1, cw, 1, px, px + ch, cw, px); // bottom
  octx.drawImage(src, 0, 0, 1, ch, 0, px, px, ch); // left
  octx.drawImage(src, cw - 1, 0, 1, ch, px + cw, px, px, ch); // right
  octx.drawImage(src, 0, 0, 1, 1, 0, 0, px, px); // corner pixels
  octx.drawImage(src, cw - 1, 0, 1, 1, px + cw, 0, px, px);
  octx.drawImage(src, 0, ch - 1, 1, 1, 0, px + ch, px, px);
  octx.drawImage(src, cw - 1, ch - 1, 1, 1, px + cw, px + ch, px, px);
}

/**
 * Apply ONE geometry op to the running offscreen canvas, returning a fresh
 * canvas. Crop rects are effective-MASTER-space, so they scale to proxy pixels by
 * `runningScale` (proxy/master — invariant under crop/rotate/flip/bleed/fit/resize,
 * since each scales the added/removed region by the same factor; straighten leaves
 * dims unchanged, so it is a single constant for the whole recipe). The three
 * print-geometry ops (bleedExpand / fitToSize / resize) replay their STORED-EXPLICIT
 * pixels here in parity with the worker's sharp mapping (extend / extract+extend /
 * resize). Non-geometry ops (adjust, …) are the LUT pass and pass through untouched.
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
    case "bleedExpand": {
      // Grow every edge by op.px (master px) → op.px·runningScale proxy px, with
      // the strategy's fill in the new band (parity: sharp `extend`).
      const px = Math.max(1, Math.round(op.px * runningScale));
      const out = makeCanvas(cw + 2 * px, ch + 2 * px);
      const octx = ctxOf(out);
      if (op.strategy === "solid") {
        octx.fillStyle = op.color ?? "#ffffff";
        octx.fillRect(0, 0, out.width, out.height);
      } else if (op.strategy === "smear") {
        drawSmearBorder(octx, current, px, cw, ch);
      } else {
        drawMirrorBorder(octx, current, px, cw, ch);
      }
      octx.drawImage(current, px, px);
      return out;
    }
    case "fitToSize": {
      if (op.rect) {
        // fill → an anchored crop (parity: sharp extract). rect is master-space.
        let sx = Math.round(op.rect.x * runningScale);
        let sy = Math.round(op.rect.y * runningScale);
        let sw = Math.round(op.rect.w * runningScale);
        let sh = Math.round(op.rect.h * runningScale);
        sx = Math.min(Math.max(sx, 0), cw);
        sy = Math.min(Math.max(sy, 0), ch);
        sw = Math.min(Math.max(sw, 1), cw - sx);
        sh = Math.min(Math.max(sh, 1), ch - sy);
        const out = makeCanvas(sw, sh);
        ctxOf(out).drawImage(current, sx, sy, sw, sh, 0, 0, sw, sh);
        return out;
      }
      if (op.pad) {
        // fit → anchored white padding (parity: sharp extend with background).
        const l = Math.round(op.pad.l * runningScale);
        const t = Math.round(op.pad.t * runningScale);
        const r = Math.round(op.pad.r * runningScale);
        const b = Math.round(op.pad.b * runningScale);
        const out = makeCanvas(cw + l + r, ch + t + b);
        const octx = ctxOf(out);
        octx.fillStyle = "#ffffff";
        octx.fillRect(0, 0, out.width, out.height);
        octx.drawImage(current, l, t);
        return out;
      }
      return current;
    }
    case "resize": {
      // Stored-explicit output dims (master px) → proxy px (parity: sharp resize).
      const nw = Math.max(1, Math.round(op.targetPx.width * runningScale));
      const nh = Math.max(1, Math.round(op.targetPx.height * runningScale));
      const out = makeCanvas(nw, nh);
      ctxOf(out).drawImage(current, 0, 0, cw, ch, 0, 0, nw, nh);
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

/** Fixed field order for a cheap, stable AdjustState serialization — the adjust
    cache key. Any change to the folded setpoints re-runs ONLY the LUT pass. */
const ADJUST_KEYS = [
  "brightness",
  "contrast",
  "exposure",
  "highlights",
  "shadows",
  "saturation",
  "temperature",
] as const satisfies readonly (keyof AdjustState)[];

function adjustKeyOf(s: AdjustState): string {
  return ADJUST_KEYS.map((k) => s[k]).join("|");
}

/** Run the compiled adjust LUT+matrix over a COPY of the geometry compose,
    returning a fresh canvas (the geometry compose is never mutated — split view
    needs the untouched "before" half). This is the only per-drag work: the
    geometry replay stays cached, this pass is the <100 ms budget. */
function applyAdjustPass(geom: HTMLCanvasElement, state: AdjustState): HTMLCanvasElement {
  const out = makeCanvas(geom.width, geom.height);
  const octx = ctxOf(out);
  octx.drawImage(geom, 0, 0);
  const img = octx.getImageData(0, 0, out.width, out.height);
  applyAdjust(img.data, compileAdjust(state));
  octx.putImageData(img, 0, 0);
  return out;
}

/**
 * The proxy canvas (wire region 5). PE1 drew the fit-to-viewport proxy; PE2 added
 * the GEOMETRY REPLAY (crop / rotate / flip / straighten folded through an
 * offscreen pipeline); PE4 adds the ADJUST PASS and SPLIT VIEW.
 *
 * TWO-LAYER CACHE (the <100 ms slider budget rides on this):
 *   1. GEOMETRY compose — keyed by (base, cursor, recipe, GEOMETRY preview only).
 *      An adjust preview does NOT enter this key, so a slider drag never triggers
 *      a geometry replay.
 *   2. ADJUST result — a separate cache of the LUT+matrix pass over the cached
 *      geometry compose, keyed by (geometry-canvas identity, adjust-state string).
 *      A slider drag re-runs ONLY this pass on the already-composed geometry.
 * The folded adjust state = collectAdjustState(applied slice + the live preview
 * op) — a preview adjust participates so the canvas previews live.
 *
 * `comparing` (the Compare hold-peek / space-peek) overrides everything: it skips
 * all ops and paints the raw proxy with an "Original" chip — and it also overrides
 * split view (both halves become the original while held).
 *
 * SPLIT VIEW (store.splitView, Section D): draws the geometry-only compose (BEFORE)
 * on the left of a draggable divider and geometry+adjust (AFTER) on the right, both
 * from the SAME cached geometry compose at the SAME box so the halves align
 * pixel-perfect. The divider + Before/After chips are a DOM overlay (SplitDivider).
 *
 * The displayed-image box + display scale are published as `layout` so the crop /
 * straighten overlays and the split divider land their chrome exactly over the
 * drawn image; the layout only changes on resize / doc / ops / preview.
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
  const splitView = usePhotoStore((s) => s.splitView);
  const selectedOverlayId = usePhotoStore((s) => s.selectedOverlayId);

  // Decoded logo-overlay bitmaps, keyed by asset id — populated async, drawn once
  // ready (the proxyImgRef pattern). Persists across StrictMode remounts.
  const overlayImgRef = useRef<Map<string, HTMLImageElement>>(new Map());
  // Stable keys of the folded overlays' logo assets + text families, so the
  // preload effects fire only when the set actually changes.
  const overlayAssetKey = useMemo(() => {
    if (!doc) return "";
    return foldOverlays(doc.recipe.slice(0, doc.cursor))
      .flatMap((o) => (o.op === "logoOverlay" ? [o.assetId] : []))
      .join("|");
  }, [doc]);
  const overlayFamilyKey = useMemo(() => {
    if (!doc) return "";
    return foldOverlays(doc.recipe.slice(0, doc.cursor))
      .flatMap((o) => (o.op === "textOverlay" ? [o.font.family] : []))
      .join("|");
  }, [doc]);

  // Split-view divider position, fraction of the displayed image width [0.05,0.95].
  const [splitPos, setSplitPos] = useState(0.5);
  const splitPosRef = useRef(splitPos);
  splitPosRef.current = splitPos;

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
  const splitViewRef = useRef(splitView);
  splitViewRef.current = splitView;

  // GEOMETRY compose memo — key excludes the adjust preview so a slider drag is a
  // cache HIT here (no geometry replay).
  const geomCacheRef = useRef<{ key: readonly unknown[]; canvas: HTMLCanvasElement } | null>(null);
  // ADJUST result memo — the LUT+matrix pass over the cached geometry compose.
  // Invalidated when the geometry canvas identity OR the folded adjust state moves.
  const adjustCacheRef = useRef<{
    geom: HTMLCanvasElement;
    key: string;
    canvas: HTMLCanvasElement;
  } | null>(null);

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
    const splitOn = splitViewRef.current && d != null;

    // The live preview folds on top of the applied slice. A geometry-shaped
    // preview (straighten/crop/…) re-composes geometry; an ADJUST or OVERLAY
    // preview does NOT enter the geometry key (isGeometryOp is the single source
    // of truth), so a slider or overlay drag never busts the geometry cache.
    const combinedOps = preview ? [...appliedOps, preview] : appliedOps;
    const geomPreview = preview && isGeometryOp(preview) ? preview : null;

    // Effective-master dims (applied ops folded) — the space overlay boxes address.
    // Computed here so the overlay pass and the published layout share it; a
    // straighten preview keeps dims, so the box aligns whether previewing or not.
    const eff = d ? effectiveDims({ w: masterW, h: masterH }, appliedOps) : { w: masterW, h: masterH };

    // Folded adjust state — the preview adjust participates so it previews live.
    const adjustState: AdjustState | null =
      !isComparing && d ? collectAdjustState(combinedOps) : null;
    const adjustActive = adjustState != null && !isAdjustIdentity(adjustState);

    // A geometry canvas is needed whenever there are ops, an active adjust (the
    // LUT pass reads pixels off a canvas), or split view (both halves come from
    // the geometry compose). Otherwise the raw base draws straight through.
    const needGeom =
      !isComparing && (appliedOps.length > 0 || geomPreview != null || adjustActive || splitOn);

    // BEFORE = geometry-only; AFTER = geometry + adjust. Default both to base.
    let before: CanvasImageSource = base;
    let after: CanvasImageSource = base;
    let srcW = baseW;
    let srcH = baseH;

    if (needGeom) {
      // LAYER 1 — geometry compose (cache key EXCLUDES the adjust preview).
      const geomOps = geomPreview ? [...appliedOps, geomPreview] : appliedOps;
      const key: readonly unknown[] = [base, baseW, d?.recipe, d?.cursor, geomPreview, runningScale];
      let gc = geomCacheRef.current;
      if (!gc || !sameKey(gc.key, key)) {
        gc = { key, canvas: composeGeometry(base, baseW, baseH, geomOps, runningScale) };
        geomCacheRef.current = gc;
      }
      before = gc.canvas;
      after = gc.canvas;
      srcW = gc.canvas.width;
      srcH = gc.canvas.height;

      // LAYER 2 — adjust LUT pass over the cached geometry compose (its own cache).
      if (adjustActive && adjustState) {
        const aKey = adjustKeyOf(adjustState);
        let ac = adjustCacheRef.current;
        if (!ac || ac.geom !== gc.canvas || ac.key !== aKey) {
          ac = { geom: gc.canvas, key: aKey, canvas: applyAdjustPass(gc.canvas, adjustState) };
          adjustCacheRef.current = ac;
        }
        after = ac.canvas;
      }
    }

    const pad = 24;
    const availW = Math.max(1, cssW - pad * 2);
    const availH = Math.max(1, cssH - pad * 2);
    const fit = Math.min(availW / srcW, availH / srcH);
    const dispW = srcW * fit;
    const dispH = srcH * fit;
    const x = (cssW - dispW) / 2;
    const y = (cssH - dispH) / 2;

    // Paint. Comparing wins (raw original); then split; then the plain composite.
    // The drop shadow is drawn once (with the AFTER/base pass) so the split seam
    // never double-shadows — the BEFORE half overpaints inside the box, shadowless.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.22)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 3;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(isComparing ? base : after, x, y, dispW, dispH);
    ctx.restore();

    if (!isComparing && splitOn) {
      const f = Math.min(0.95, Math.max(0.05, splitPosRef.current));
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, dispW * f, dispH);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(before, x, y, dispW, dispH);
      ctx.restore();
    }

    // PE6 OVERLAYS — folded text/logo overlays above the composite, at display
    // scale, rotation baked via ctx transforms (the TRUE rotated box; the AABB is
    // export-only). Folds combinedOps so an in-flight overlay drag (previewOp)
    // previews live; the same `foldOverlays` the panel + export use. Skipped while
    // comparing (the raw original is shown then). Drawn on the always-redrawn main
    // canvas — never composited into the geometry/adjust offscreen caches, so
    // those keys stay overlay-free; the recipe/preview deps already redraw here.
    if (!isComparing && d && eff.w > 0) {
      const oScale = dispW / eff.w;
      for (const ov of foldOverlays(combinedOps)) {
        ctx.save();
        ctx.translate(x + (ov.box.x + ov.box.w / 2) * oScale, y + (ov.box.y + ov.box.h / 2) * oScale);
        ctx.rotate((ov.rotation * Math.PI) / 180);
        const img = ov.op === "logoOverlay" ? overlayImgRef.current.get(ov.assetId) ?? null : null;
        paintOverlayContent(ctx, ov, oScale, img);
        ctx.restore();
      }
    }

    if (isComparing) drawOriginalChip(ctx, x, y);

    // Zoom % = fraction of the full-resolution (effective) master shown on screen.
    const fullResW = srcW / runningScale;
    onZoomRef.current(Math.round((dispW / fullResW) * 100));

    // Overlay layout: coords address the effective master (`eff`, folded above).
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
      geomCacheRef.current = null;
      adjustCacheRef.current = null;
      schedule();
      return;
    }
    const img = new Image();
    img.onload = () => {
      proxyImgRef.current = img;
      geomCacheRef.current = null; // new base — invalidate both compose memos
      adjustCacheRef.current = null;
      schedule();
    };
    img.src = proxyUrl;
    return () => {
      img.onload = null;
    };
  }, [proxyUrl, schedule]);

  // Repaint when the preview bitmap, the document (recipe/cursor), the live
  // preview op, the compare peek, or the split view / divider position changes.
  // (The offscreen caches are independent of splitView — it only changes the final
  // composition — but the split divider drag and toggle still need a redraw.)
  useEffect(() => {
    schedule();
  }, [previewBitmap, doc, previewOp, comparing, splitView, splitPos, schedule]);

  // PE6: ensure the folded text overlays' font faces are loaded, then repaint so
  // text renders in the real face (idempotent; ensureFamiliesLoaded dedupes).
  useEffect(() => {
    if (!overlayFamilyKey) return;
    let alive = true;
    void ensureFamiliesLoaded(overlayFamilyKey.split("|")).then((loaded) => {
      if (loaded && alive) schedule();
    });
    return () => {
      alive = false;
    };
  }, [overlayFamilyKey, schedule]);

  // PE6: decode the folded logo overlays' bytes into the image cache, repainting
  // as each arrives (the proxy-load pattern). StrictMode-safe via the alive guard.
  useEffect(() => {
    if (!overlayAssetKey) return;
    let alive = true;
    const cache = overlayImgRef.current;
    for (const id of overlayAssetKey.split("|")) {
      if (cache.has(id)) continue;
      void getAssetUrl(id).then((url) => {
        if (!url || !alive) return;
        const img = new Image();
        img.onload = () => {
          if (!alive) return;
          cache.set(id, img);
          schedule();
        };
        img.src = url;
      });
    }
    return () => {
      alive = false;
    };
  }, [overlayAssetKey, schedule]);

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
  // Overlay handle chrome: the Text & image tool with an overlay selected. Hidden
  // while comparing (the raw original is shown, so the handles would misalign).
  const showOverlayHandles =
    doc != null && layout != null && activeTool === "text" && selectedOverlayId != null && !comparing;
  // Split-view chrome rides above the canvas; the compare peek overrides split
  // view (both halves become the original while held), so hide the divider then.
  const showSplit = doc != null && layout != null && splitView && !comparing;
  // Trim/bleed/safe guides: whenever a target size is set and the crop tool ISN'T
  // active (the crop overlay owns that surface) — toggle-free at PE5. Hidden while
  // comparing (the raw original is shown then, so the effective-dims box mismatches).
  const showGuides =
    doc != null && layout != null && doc.target.size != null && activeTool !== "crop" && !comparing;

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-[#d3d3d3]">
      <canvas ref={canvasRef} data-testid="photo-canvas" className="block" />
      {showGuides && layout && <GuideChrome layout={layout} />}
      {showCropChrome && previewOp?.op === "straighten" && <StraightenOverlay layout={layout} />}
      {showCropChrome && <CropOverlay layout={layout} />}
      {showOverlayHandles && layout && <OverlayHandles layout={layout} />}
      {showSplit && layout && <SplitDivider layout={layout} pos={splitPos} onChange={setSplitPos} />}
    </div>
  );
}

/**
 * Split-view divider (wire Section D). A DOM overlay over the displayed image box:
 * a "Before" chip top-left, an "After" chip top-right, a white divider line, and a
 * draggable circular handle (pointer-capture, clamped to 5%..95% of the image
 * width). It only positions chrome — the actual before/after halves are composited
 * on the canvas from the same cached geometry compose, so they align pixel-perfect.
 */
function SplitDivider({
  layout,
  pos,
  onChange,
}: {
  layout: CanvasImageLayout;
  pos: number;
  onChange: (p: number) => void;
}) {
  const { x, y, w, h } = layout;
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lineX = x + w * pos;

  const chipStyle: React.CSSProperties = {
    background: "rgba(255,255,255,.9)",
    boxShadow: "0 1px 2px rgba(0,0,0,.12)",
  };

  const updateFromClientX = (clientX: number) => {
    const el = overlayRef.current;
    if (!el || w <= 0) return;
    // The overlay is inset-0 over the same container `layout.x` is measured from,
    // so its left edge is the shared basis for both the canvas draw and this drag.
    const rect = el.getBoundingClientRect();
    const f = (clientX - rect.left - x) / w;
    onChange(Math.min(0.95, Math.max(0.05, f)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragging.current = true;
    updateFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging.current) updateFromClientX(e.clientX);
  };
  const endDrag = () => {
    dragging.current = false;
  };

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0">
      <div
        data-testid="photo-split-before"
        className="absolute rounded-[4px] px-[7px] py-[2px] text-[9.5px] text-[#777]"
        style={{ left: x + 8, top: y + 8, ...chipStyle }}
      >
        Before
      </div>
      <div
        data-testid="photo-split-after"
        className="absolute rounded-[4px] px-[7px] py-[2px] text-[9.5px] text-[#777]"
        style={{ left: x + w - 8, top: y + 8, transform: "translateX(-100%)", ...chipStyle }}
      >
        After
      </div>
      <div
        className="absolute"
        style={{
          left: lineX - 1,
          top: y,
          width: 2,
          height: h,
          background: "#fff",
          boxShadow: "0 0 4px rgba(0,0,0,.35)",
        }}
      />
      <div
        data-testid="photo-split-divider"
        role="slider"
        aria-label="Before / after split"
        aria-valuemin={5}
        aria-valuemax={95}
        aria-valuenow={Math.round(pos * 100)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="absolute flex items-center justify-center rounded-full border border-[#b0b0b0] bg-white text-[10px] text-[#888] shadow-[0_1px_3px_rgba(0,0,0,.28)]"
        style={{
          left: lineX,
          top: y + h / 2,
          width: 24,
          height: 24,
          transform: "translate(-50%, -50%)",
          pointerEvents: "auto",
          cursor: "ew-resize",
          touchAction: "none",
        }}
      >
        ⇄
      </div>
    </div>
  );
}
