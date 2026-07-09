"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAssetUrl } from "@/lib/assets/use-asset-url";
import type { PhotoDocument } from "@/lib/schema/photo";

/**
 * The proxy canvas (wire region 5). Draws the screen proxy fit-to-viewport
 * (contain), device-pixel-ratio aware, on the suite's neutral pasteboard.
 * Redraws are rAF-coalesced on resize / source change. During the intake
 * round-trip it paints the instant local preview bitmap so the <2 s open budget
 * is met locally; once the server proxy resolves from the blob store it repaints
 * from that (higher fidelity, correct orientation). The fit-zoom percent — the
 * fraction of the full-resolution master shown on screen — is reported up for
 * the status bar (no interactive zoom yet; PE1 is fit-only).
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

  // Latest inputs read through a ref so the draw closure never goes stale and
  // the resize listener stays installed once.
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  const previewRef = useRef<ImageBitmap | null>(previewBitmap);
  previewRef.current = previewBitmap;
  const masterWidthRef = useRef<number | null>(doc?.source.width ?? null);
  masterWidthRef.current = doc?.source.width ?? null;

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

    // Prefer the server proxy once it has decoded; fall back to the instant
    // local preview during the round-trip.
    const proxy = proxyImgRef.current;
    let source: CanvasImageSource | null = null;
    let srcW = 0;
    let srcH = 0;
    if (proxy && proxy.complete && proxy.naturalWidth > 0) {
      source = proxy;
      srcW = proxy.naturalWidth;
      srcH = proxy.naturalHeight;
    } else if (previewRef.current) {
      source = previewRef.current;
      srcW = previewRef.current.width;
      srcH = previewRef.current.height;
    }

    if (!source || srcW === 0 || srcH === 0) {
      onZoomRef.current(null);
      return;
    }

    const pad = 24;
    const availW = Math.max(1, cssW - pad * 2);
    const availH = Math.max(1, cssH - pad * 2);
    const scale = Math.min(availW / srcW, availH / srcH);
    const dispW = srcW * scale;
    const dispH = srcH * scale;
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

    const masterW = masterWidthRef.current ?? srcW;
    onZoomRef.current(Math.round((dispW / masterW) * 100));
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
      schedule();
      return;
    }
    const img = new Image();
    img.onload = () => {
      proxyImgRef.current = img;
      schedule();
    };
    img.src = proxyUrl;
    return () => {
      img.onload = null;
    };
  }, [proxyUrl, schedule]);

  // Repaint when the preview bitmap arrives / changes.
  useEffect(() => {
    schedule();
  }, [previewBitmap, schedule]);

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-[#d3d3d3]">
      <canvas ref={canvasRef} data-testid="photo-canvas" className="block" />
    </div>
  );
}
