"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useLayoutStore } from "@/store";
import { clampZoom, fitZoom, inToPx, rulerTicks } from "@/lib/layout/geometry";
import { formatIn, sizeLabel } from "@/lib/layout/presets";
import { PageSurface } from "./PageSurface";

/**
 * Rulers + pasteboard + the true-scale publication page (wire regions 5–6,
 * plan §3.5). The page renders at `inches × 96 × zoom`, fit on mount and
 * whenever page geometry changes; rulers are real — inch-numbered, tracking
 * zoom and pan, origin locked to the page's top-left corner. The Zoom tool
 * clicks in (Alt reverses), the Move tool drags the pasteboard, and
 * Ctrl/Cmd+scroll zooms.
 */

const RULER_BREADTH = 18;

function Ruler({
  axis,
  originPx,
  lengthPx,
  zoom,
}: {
  axis: "x" | "y";
  originPx: number;
  lengthPx: number;
  zoom: number;
}) {
  if (lengthPx <= 0) return null;
  const ticks = rulerTicks(originPx, lengthPx, zoom);
  const tickStart = { major: 6, mid: 10, minor: 13 };

  return (
    <svg
      width={axis === "x" ? lengthPx : RULER_BREADTH}
      height={axis === "x" ? RULER_BREADTH : lengthPx}
      className="block"
      aria-hidden
    >
      {ticks.map((t) =>
        axis === "x" ? (
          <Fragment key={t.px}>
            <line
              x1={t.px}
              x2={t.px}
              y1={tickStart[t.level]}
              y2={RULER_BREADTH}
              stroke="#c4c4c4"
              strokeWidth={1}
            />
            {t.label !== undefined && (
              <text x={t.px + 3} y={8} fontSize={8} fill="#888">
                {t.label}
              </text>
            )}
          </Fragment>
        ) : (
          <Fragment key={t.px}>
            <line
              y1={t.px}
              y2={t.px}
              x1={tickStart[t.level]}
              x2={RULER_BREADTH}
              stroke="#c4c4c4"
              strokeWidth={1}
            />
            {t.label !== undefined && (
              <text
                x={8}
                y={t.px - 3}
                fontSize={8}
                fill="#888"
                transform={`rotate(-90 8 ${t.px - 3})`}
              >
                {t.label}
              </text>
            )}
          </Fragment>
        ),
      )}
    </svg>
  );
}

export function CanvasViewport() {
  const doc = useLayoutStore((s) => s.doc);
  const zoom = useLayoutStore((s) => s.zoom);
  const pan = useLayoutStore((s) => s.pan);
  const tool = useLayoutStore((s) => s.tool);
  const guidesVisible = useLayoutStore((s) => s.guidesVisible);
  const fitRequestId = useLayoutStore((s) => s.fitRequestId);

  const boardRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const dragFrom = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const fittedFor = useRef<number | null>(null);

  // measure the pasteboard
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => setVp({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // fit on mount and when page geometry changes (§3.5) — not on window resize
  useEffect(() => {
    if (!vp.w || !vp.h) return;
    if (fittedFor.current === fitRequestId) return;
    fittedFor.current = fitRequestId;
    const s = useLayoutStore.getState();
    s.setZoom(fitZoom(s.doc.size.w, s.doc.size.h, s.doc.bleed, vp.w, vp.h));
    s.setPan({ x: 0, y: 0 });
  }, [vp, fitRequestId]);

  // Ctrl/Cmd + scroll zooms — non-passive so the browser page-zoom is suppressed
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const s = useLayoutStore.getState();
      s.setZoom(clampZoom(s.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const pageW = inToPx(doc.size.w, zoom);
  const pageH = inToPx(doc.size.h, zoom);
  const originX = vp.w / 2 + pan.x - pageW / 2;
  const originY = vp.h / 2 + pan.y - pageH / 2;

  const cursor =
    tool === "move"
      ? dragging
        ? "cursor-grabbing"
        : "cursor-grab"
      : tool === "zoom"
        ? "cursor-zoom-in"
        : "";

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* top ruler row: corner box + horizontal ruler */}
      <div className="flex h-[18px] shrink-0">
        <div className="w-[18px] shrink-0 border-b border-r border-[#e0e0e0] bg-[#ededed]" />
        <div className="flex-1 overflow-hidden border-b border-[#e0e0e0] bg-[#ededed]">
          <Ruler axis="x" originPx={originX} lengthPx={vp.w} zoom={zoom} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left ruler */}
        <div className="w-[18px] shrink-0 overflow-hidden border-r border-[#e0e0e0] bg-[#ededed]">
          <Ruler axis="y" originPx={originY} lengthPx={vp.h} zoom={zoom} />
        </div>

        {/* pasteboard */}
        <div
          ref={boardRef}
          data-testid="pasteboard"
          className={`relative flex-1 select-none overflow-hidden bg-pasteboard ${cursor}`}
          onPointerDown={(e) => {
            if (tool !== "move") return;
            e.currentTarget.setPointerCapture(e.pointerId);
            dragFrom.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
            setDragging(true);
          }}
          onPointerMove={(e) => {
            const from = dragFrom.current;
            if (!from) return;
            useLayoutStore.getState().setPan({
              x: from.panX + (e.clientX - from.x),
              y: from.panY + (e.clientY - from.y),
            });
          }}
          onPointerUp={() => {
            dragFrom.current = null;
            setDragging(false);
          }}
          onClick={(e) => {
            if (tool !== "zoom") return;
            const s = useLayoutStore.getState();
            if (e.altKey) s.zoomOut();
            else s.zoomIn();
          }}
        >
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap text-[11px] text-[#7a7a7a]">
            {doc.name} · {sizeLabel(doc.size.w, doc.size.h)} {formatIn(doc.size.w)} ×{" "}
            {formatIn(doc.size.h)} in · {Math.round(zoom * 100)}%
          </div>

          {/* publication page — centered, offset by the pan */}
          <div
            className="absolute left-1/2 top-1/2"
            style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))` }}
          >
            <PageSurface doc={doc} zoom={zoom} guidesVisible={guidesVisible} />
          </div>

          {/* guide legend */}
          <div className="pointer-events-none absolute bottom-[14px] right-4 z-10 flex flex-col gap-[6px] rounded-[7px] border border-[#e2e2e2] bg-white px-[11px] py-2">
            <div className="flex items-center gap-[7px]">
              <div className="w-4 border-t-[1.5px] border-dashed border-brand" />
              <span className="text-[10px] text-[#888]">Bleed {formatIn(doc.bleed)} in</span>
            </div>
            <div className="flex items-center gap-[7px]">
              <div className="w-4 border-t border-dashed border-guide" />
              <span className="text-[10px] text-[#888]">Margin {formatIn(doc.margin)} in</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
