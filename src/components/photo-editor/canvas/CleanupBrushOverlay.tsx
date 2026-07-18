"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { PhotoOp } from "@/lib/schema/photo";
import { usePhotoStore } from "@/lib/store/photo-store";
import {
  requestEraseFill,
  storeEraseMask,
  storeErasePatch,
} from "@/lib/photo/client";
import {
  boundsSeeded,
  emptyBounds,
  extendBounds,
  fillRectFromBounds,
  type StrokeBounds,
} from "@/lib/photo/cleanup-mask";
import type { CanvasImageLayout } from "./PhotoCanvas";

/**
 * Clean-up brush chrome (wire Section B "Clean up", PE9 — the classical-fill
 * preview loop every model op inherits). Mounts inside the PhotoCanvas container
 * while the Clean up tool is active and a `layout` exists (beside CropOverlay).
 *
 * It is the untrusted operator's INTENT surface: pointer-captured freehand strokes
 * accumulate into (a) an offscreen GRAYSCALE-ON-BLACK mask canvas at proxy-scale of
 * the effective image — soft white radial dabs on a black fill, so the exported PNG
 * is OPAQUE and its luminance is the fill factor (the ErasePayloadSchema mask
 * contract) — and (b) a translucent red VIEW canvas echoing the strokes on screen
 * (wireframe feel; the real result is the server patch). On pointerup it computes
 * the padded, clamped, integer fill rect (cleanup-mask.ts), runs the fill ONCE on
 * the server at full resolution (requestEraseFill), stores the mask + approved
 * patch blobs, builds the STORED-EXPLICIT erase op, and hands it to the store as a
 * `pendingPreview` — the PreviewApproveBar owns Apply / Discard. The heavy fill runs
 * server-side; the canvas never freezes (an honest "Working…" chip covers the wait).
 *
 * STALE / ABORT DISCIPLINE (plan §10, the model-op contract): a new stroke, an
 * undo/redo, or a tool switch ABORTS any in-flight fill (AbortController); a fill
 * whose response arrives after history moved or the tool changed is DROPPED (the
 * doc.recipe/cursor identity captured at request time is re-checked on return). The
 * local mask clears on Apply (op committed → recipe moves), Discard (pendingPreview
 * → null with no history move), tool switch (unmount), and any history move.
 */

const TINT = "rgba(204,0,0,.28)";

type Pt = { x: number; y: number };
type Stroke = { brush: number; pts: Pt[] };

/** Soft white radial dabs stamped along a stroke path, in MASK-canvas px. A solid
    white core (to 55% of the radius) plus a feathered edge → the soft brush edge
    the worker reads as the blend factor. Points are interpolated so a fast stroke
    never gaps between move events. */
function stampMaskStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  maskScale: number,
): void {
  const rMask = (stroke.brush * maskScale) / 2;
  if (rMask < 0.5) return;
  const stamp = (mx: number, my: number) => {
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, rMask);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mx, my, rMask, 0, Math.PI * 2);
    ctx.fill();
  };
  const pts = stroke.pts;
  if (pts.length === 1) {
    stamp(pts[0].x * maskScale, pts[0].y * maskScale);
    return;
  }
  const step = Math.max(1, rMask * 0.5);
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x * maskScale;
    const ay = pts[i - 1].y * maskScale;
    const bx = pts[i].x * maskScale;
    const by = pts[i].y * maskScale;
    const dist = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      stamp(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  }
}

export function CleanupBrushOverlay({ layout }: { layout: CanvasImageLayout }) {
  const doc = usePhotoStore((s) => s.doc);
  const cleanupBrushSize = usePhotoStore((s) => s.cleanupBrushSize);
  const pendingPreview = usePhotoStore((s) => s.pendingPreview);

  const overlayRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);

  // Latest inputs through refs so async callbacks (the fill) never go stale.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const docRef = useRef(doc);
  docRef.current = doc;

  // Accumulated strokes (session, across pointerups) + their bbox + the largest
  // brush used (drives the rect pad). Mutable refs — no re-render per point.
  const strokesRef = useRef<Stroke[]>([]);
  const boundsRef = useRef<StrokeBounds>(emptyBounds());
  const maxBrushRef = useRef(0);
  // Strokes before this index are already INCORPORATED in a pending preview — the
  // canvas shows their actual fill result, so their red echo would only obscure
  // the pixels the associate must judge before Apply ("you always see a preview").
  // Fresh strokes (index ≥ this) still echo until their fill lands. Reset with the
  // stroke list (clearLocal).
  const echoFromRef = useRef(0);
  const drawingRef = useRef<{ active: boolean; stroke: Stroke | null; last: Pt | null }>({
    active: false,
    stroke: null,
    last: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [badge, setBadge] = useState<Pt | null>(null);

  // Redraw ALL accumulated strokes onto the view canvas at the current scale (the
  // safe path on a layout change); incremental segments draw during a live stroke.
  const renderView = useCallback(() => {
    const c = viewRef.current;
    const lay = layoutRef.current;
    if (!c || !lay) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, lay.w, lay.h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = TINT;
    for (const stroke of strokesRef.current.slice(echoFromRef.current)) {
      ctx.lineWidth = Math.max(1, stroke.brush * lay.scale);
      const pts = stroke.pts;
      ctx.beginPath();
      if (pts.length === 1) {
        const x = pts[0].x * lay.scale;
        const y = pts[0].y * lay.scale;
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.01, y);
      } else {
        ctx.moveTo(pts[0].x * lay.scale, pts[0].y * lay.scale);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * lay.scale, pts[i].y * lay.scale);
      }
      ctx.stroke();
    }
  }, []);

  // One live segment (cheap) — the transform + style survive from the last render.
  const drawSegment = useCallback((from: Pt, to: Pt, brushEff: number) => {
    const c = viewRef.current;
    const lay = layoutRef.current;
    if (!c || !lay) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = TINT;
    ctx.lineWidth = Math.max(1, brushEff * lay.scale);
    ctx.beginPath();
    ctx.moveTo(from.x * lay.scale, from.y * lay.scale);
    ctx.lineTo(to.x * lay.scale, to.y * lay.scale);
    ctx.stroke();
  }, []);

  const clearLocal = useCallback(() => {
    strokesRef.current = [];
    boundsRef.current = emptyBounds();
    maxBrushRef.current = 0;
    echoFromRef.current = 0;
    drawingRef.current = { active: false, stroke: null, last: null };
    setBadge(null);
    setError(null);
    renderView();
  }, [renderView]);

  const abortInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setWorking(false);
  }, []);

  // Size the view canvas to the displayed image box and repaint from the stroke
  // list (correct after a resize/zoom that changed layout.scale).
  useEffect(() => {
    const c = viewRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(layout.w * dpr));
    c.height = Math.max(1, Math.round(layout.h * dpr));
    renderView();
  }, [layout, renderView]);

  // A history move (Apply's pushOp, undo/redo, setCursor) stales the local brush —
  // abort any fill and clear. Fires on mount too (a no-op with nothing brushed).
  const recipe = doc?.recipe;
  const docCursor = doc?.cursor;
  useEffect(() => {
    abortInFlight();
    clearLocal();
  }, [recipe, docCursor, abortInFlight, clearLocal]);

  // Discard: the pending preview cleared WITHOUT a history move → drop the brush.
  // (Apply also nulls it, but the history-move effect already cleared then.)
  const prevPendingRef = useRef(pendingPreview);
  useEffect(() => {
    const prev = prevPendingRef.current;
    prevPendingRef.current = pendingPreview;
    if (prev && !pendingPreview) {
      abortInFlight();
      clearLocal();
    }
  }, [pendingPreview, abortInFlight, clearLocal]);

  // Tool switch / unmount: never leave a fill running for a surface that's gone.
  useEffect(() => () => abortRef.current?.abort(), []);

  const toLocal = (clientX: number, clientY: number): Pt => {
    const rect = overlayRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };
  const localToEff = (p: Pt): Pt => ({
    x: (p.x - layout.x) / layout.scale,
    y: (p.y - layout.y) / layout.scale,
  });

  const syncBadge = () => {
    const b = boundsRef.current;
    const lay = layoutRef.current;
    if (!lay || !boundsSeeded(b)) {
      setBadge(null);
      return;
    }
    setBadge({ x: lay.x + b.minX * lay.scale, y: lay.y + b.minY * lay.scale });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    overlayRef.current?.setPointerCapture(e.pointerId);
    const local = toLocal(e.clientX, e.clientY);
    const eff = localToEff(local);
    const stroke: Stroke = { brush: cleanupBrushSize, pts: [eff] };
    strokesRef.current.push(stroke);
    drawingRef.current = { active: true, stroke, last: eff };
    maxBrushRef.current = Math.max(maxBrushRef.current, cleanupBrushSize);
    extendBounds(boundsRef.current, eff.x, eff.y);
    drawSegment(eff, { x: eff.x + 0.01, y: eff.y }, cleanupBrushSize);
    setCursor(local);
    syncBadge();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const local = toLocal(e.clientX, e.clientY);
    setCursor(local);
    const g = drawingRef.current;
    if (!g.active || !g.stroke) return;
    const eff = localToEff(local);
    g.stroke.pts.push(eff);
    extendBounds(boundsRef.current, eff.x, eff.y);
    if (g.last) drawSegment(g.last, eff, g.stroke.brush);
    g.last = eff;
    syncBadge();
  };

  const endStroke = (e: React.PointerEvent) => {
    const g = drawingRef.current;
    if (!g.active) return;
    drawingRef.current = { active: false, stroke: null, last: null };
    overlayRef.current?.releasePointerCapture?.(e.pointerId);
    void runFill();
  };

  /** Build the grayscale-on-black mask PNG from the accumulated strokes, at
      proxy-scale of the effective image (any resolution is fine — the dims ride the
      payload and the worker resizes the mask to the effective image). */
  async function buildMask(): Promise<{ blob: Blob; width: number; height: number } | null> {
    const d = docRef.current;
    const lay = layoutRef.current;
    if (!d || !lay) return null;
    const maskScale = d.source.proxyWidth / d.source.width;
    const w = Math.max(1, Math.round(lay.image.w * maskScale));
    const h = Math.max(1, Math.round(lay.image.h * maskScale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    for (const stroke of strokesRef.current) stampMaskStroke(ctx, stroke, maskScale);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
    return blob ? { blob, width: w, height: h } : null;
  }

  async function runFill() {
    const d = docRef.current;
    const lay = layoutRef.current;
    if (!d || !lay) return;
    const rect = fillRectFromBounds(boundsRef.current, maxBrushRef.current, lay.image);
    if (!rect) return;
    const mask = await buildMask();
    if (!mask) return;
    setBadge({ x: lay.x + rect.x * lay.scale, y: lay.y + rect.y * lay.scale });

    // Supersede any in-flight fill (a re-brush cancels the previous request).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const startRecipe = d.recipe;
    const startCursor = d.cursor;
    // ONE staleness rule, re-checked after every await below: history moved or
    // the tool changed while this fill was out — the response belongs to a state
    // the associate has already left.
    const isStale = () => {
      const st = usePhotoStore.getState();
      return (
        !st.doc ||
        st.doc.recipe !== startRecipe ||
        st.doc.cursor !== startCursor ||
        st.activeTool !== "cleanup"
      );
    };
    setWorking(true);
    setError(null);

    const outcome = await requestEraseFill({
      doc: d,
      maskBlob: mask.blob,
      maskDims: { width: mask.width, height: mask.height },
      rect,
      signal: controller.signal,
    });

    // Superseded by a newer stroke / undo / tool switch → drop silently.
    if (controller.signal.aborted) return;
    abortRef.current = null;

    if (isStale()) {
      setWorking(false);
      return;
    }
    setWorking(false);
    if (!outcome.ok) {
      setError(outcome.error.message);
      return;
    }

    // Commit-time invariant guard: the patch's pixel dims must equal the rect the
    // op will carry — every later render enforces exactly that on the erase:<id>
    // part, so an op that would fail export must never be offered for approval.
    // (The server validates the rect and reports the patch dims; this closes the
    // loop against any drift between the two.)
    const bmp = await createImageBitmap(outcome.patch).catch(() => null);
    const bmpOk = bmp && bmp.width === rect.w && bmp.height === rect.h;
    bmp?.close();
    if (!bmpOk) {
      if (!isStale()) setError("The cleanup result didn't match the brushed area — try again.");
      return;
    }

    // Persist the mask (intent) + the approved patch — independent writes, so
    // they fan out — then preview the op.
    const [maskAssetId, patchStored] = await Promise.all([
      storeEraseMask(mask.blob),
      storeErasePatch(outcome.patch),
    ]);

    // Re-check staleness after the async decode + blob writes before committing.
    if (isStale()) return;
    const op: PhotoOp = {
      op: "erase",
      label: "Remove object",
      maskAssetId,
      patch: { id: patchStored.partId, assetId: patchStored.assetId, rect },
    };
    usePhotoStore.getState().setPendingPreview(op);
    // These strokes now preview as REAL filled pixels on the canvas — stop echoing
    // them so the tint never obscures the result being judged (see echoFromRef).
    echoFromRef.current = strokesRef.current.length;
    renderView();
  }

  const ringSize = Math.max(6, cleanupBrushSize * layout.scale);

  return (
    <div
      ref={overlayRef}
      data-testid="photo-cleanup-overlay"
      className="absolute inset-0"
      style={{ pointerEvents: "auto", cursor: "crosshair", touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={() => setCursor(null)}
    >
      {/* Translucent stroke echo over the displayed image (the real result is the
          server patch, revealed once the preview lands). */}
      <canvas
        ref={viewRef}
        className="pointer-events-none absolute"
        style={{ left: layout.x, top: layout.y, width: layout.w, height: layout.h }}
      />

      {/* Brush-size cursor ring following the pointer. */}
      {cursor && (
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            left: cursor.x,
            top: cursor.y,
            width: ringSize,
            height: ringSize,
            transform: "translate(-50%, -50%)",
            border: "1.5px solid rgba(204,0,0,.8)",
            boxShadow: "0 0 0 1px rgba(255,255,255,.6)",
          }}
        />
      )}

      {/* "Brushed area" badge near the mask bbox (dashed brand accent). */}
      {badge && (
        <div
          data-testid="photo-cleanup-badge"
          className="pointer-events-none absolute rounded-[5px] border border-dashed border-brand bg-white/90 px-[7px] py-[2px] text-[10px] font-semibold text-brand-deep shadow-[0_1px_2px_rgba(0,0,0,.12)]"
          style={{ left: badge.x, top: badge.y, transform: "translateY(-115%)" }}
        >
          Brushed area
        </div>
      )}

      {/* Honest in-flight chip — the canvas never freezes while the fill runs. */}
      {working && (
        <div
          data-testid="photo-cleanup-working"
          className="pointer-events-none absolute flex items-center gap-[6px] rounded-full border border-brand-border bg-brand-tint px-[10px] py-[3px] text-[11px] font-medium text-brand-deep shadow-[0_1px_3px_rgba(0,0,0,.14)]"
          style={{ left: layout.x + layout.w / 2, top: layout.y + 12, transform: "translateX(-50%)" }}
        >
          <Loader2 size={11} strokeWidth={2.4} className="animate-spin" />
          Working…
        </div>
      )}

      {/* Typed failure — the server's friendly message, verbatim. */}
      {error && (
        <div
          data-testid="photo-cleanup-error"
          role="alert"
          className="pointer-events-none absolute flex max-w-[300px] items-start gap-[6px] rounded-[6px] border border-brand-border bg-brand-tint px-[10px] py-2 text-[11.5px] leading-relaxed text-brand-deep shadow-[0_1px_3px_rgba(0,0,0,.16)]"
          style={{ left: layout.x + layout.w / 2, top: layout.y + 12, transform: "translateX(-50%)" }}
        >
          <AlertTriangle size={13} strokeWidth={2} className="mt-[1px] shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
