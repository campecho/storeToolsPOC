"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useLayoutStore } from "@/store";
import type { BBox, HandleDir } from "@/lib/layout/objects";
import type { LayoutDocument, LayoutObject, LineObject } from "@/schema";
import { clampZoom, fitZoom, inToPx, pxToIn, rulerTicks } from "@/lib/layout/geometry";
import { formatIn, sizeLabel } from "@/lib/layout/presets";
import {
  DRAW_THRESHOLD_IN,
  bboxOf,
  createFrame,
  createLine,
  resizeBBox,
} from "@/lib/layout/objects";
import { PageSurface } from "./PageSurface";
import { ObjectNode } from "./ObjectNode";
import { SelectionOverlay } from "./SelectionOverlay";

/**
 * Rulers + pasteboard + the true-scale publication page (wire regions 5–6,
 * plan §3.5, editing per L4). The page renders at `inches × 96 × zoom`, fit
 * on mount and when page geometry changes; rulers track zoom/pan from the
 * page origin. Tools: Zoom clicks (Alt reverses), Move pans, Ctrl/Cmd+scroll
 * zooms; Rect/Ellipse/Line/Picture drag-to-draw; Select clicks, drag-moves,
 * and resizes via the selection handles. Drags write transient document
 * updates and commit one history snapshot at pointer-up (§3.3).
 */

const RULER_BREADTH = 18;
const DRAW_TOOLS = new Set(["rect", "ellipse", "line", "pic"]);

type Gesture =
  | { kind: "pan"; fromX: number; fromY: number; panX: number; panY: number }
  | { kind: "draw"; startX: number; startY: number }
  | {
      kind: "move";
      id: string;
      startX: number;
      startY: number;
      startObj: LayoutObject;
      before: LayoutDocument;
    }
  | {
      kind: "resize";
      id: string;
      dir: HandleDir;
      startX: number;
      startY: number;
      startBBox: BBox;
      before: LayoutDocument;
    }
  | {
      kind: "endpoint";
      id: string;
      which: "p1" | "p2";
      startX: number;
      startY: number;
      startObj: LineObject;
      before: LayoutDocument;
    };

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

/** Dashed preview while a draw gesture is in flight, in page coordinates. */
function DraftPreview({
  draft,
  line,
  zoom,
}: {
  draft: { x1: number; y1: number; x2: number; y2: number };
  line: boolean;
  zoom: number;
}) {
  if (line) {
    const x = Math.min(draft.x1, draft.x2);
    const y = Math.min(draft.y1, draft.y2);
    return (
      <svg
        className="pointer-events-none absolute overflow-visible"
        style={{
          left: inToPx(x, zoom),
          top: inToPx(y, zoom),
          width: Math.max(inToPx(Math.abs(draft.x2 - draft.x1), zoom), 1),
          height: Math.max(inToPx(Math.abs(draft.y2 - draft.y1), zoom), 1),
        }}
      >
        <line
          x1={inToPx(draft.x1 - x, zoom)}
          y1={inToPx(draft.y1 - y, zoom)}
          x2={inToPx(draft.x2 - x, zoom)}
          y2={inToPx(draft.y2 - y, zoom)}
          stroke="var(--color-brand)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      </svg>
    );
  }
  return (
    <div
      className="pointer-events-none absolute border-[1.5px] border-dashed border-brand bg-[rgba(204,0,0,.03)]"
      style={{
        left: inToPx(Math.min(draft.x1, draft.x2), zoom),
        top: inToPx(Math.min(draft.y1, draft.y2), zoom),
        width: inToPx(Math.abs(draft.x2 - draft.x1), zoom),
        height: inToPx(Math.abs(draft.y2 - draft.y1), zoom),
      }}
    />
  );
}

export function CanvasViewport() {
  const doc = useLayoutStore((s) => s.doc);
  const activePageId = useLayoutStore((s) => s.activePageId);
  const zoom = useLayoutStore((s) => s.zoom);
  const pan = useLayoutStore((s) => s.pan);
  const tool = useLayoutStore((s) => s.tool);
  const guidesVisible = useLayoutStore((s) => s.guidesVisible);
  const fitRequestId = useLayoutStore((s) => s.fitRequestId);
  const selectedIds = useLayoutStore((s) => s.selectedIds);

  const boardRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [panning, setPanning] = useState(false);
  const [draft, setDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );
  const gesture = useRef<Gesture | null>(null);
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

  const page = doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];
  const selected =
    selectedIds.length === 1 ? page.objects.find((o) => o.id === selectedIds[0]) : undefined;

  const pageW = inToPx(doc.size.w, zoom);
  const pageH = inToPx(doc.size.h, zoom);
  const originX = vp.w / 2 + pan.x - pageW / 2;
  const originY = vp.h / 2 + pan.y - pageH / 2;

  /** Pointer event → page-space inches. */
  const toPageIn = (e: { clientX: number; clientY: number }) => {
    const rect = boardRef.current!.getBoundingClientRect();
    return {
      x: pxToIn(e.clientX - rect.left - originX, zoom),
      y: pxToIn(e.clientY - rect.top - originY, zoom),
    };
  };

  const capture = (e: React.PointerEvent) => {
    boardRef.current?.setPointerCapture(e.pointerId);
  };

  /** Select-tool pointer-down on an object: select it and start a move. */
  const startMove = (obj: LayoutObject) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    const p = toPageIn(e);
    const s = useLayoutStore.getState();
    s.setSelection([obj.id]);
    gesture.current = {
      kind: "move",
      id: obj.id,
      startX: p.x,
      startY: p.y,
      startObj: obj,
      before: s.doc,
    };
  };

  const startResize = (obj: LayoutObject) => (dir: HandleDir, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    const p = toPageIn(e);
    gesture.current = {
      kind: "resize",
      id: obj.id,
      dir,
      startX: p.x,
      startY: p.y,
      startBBox: bboxOf(obj),
      before: useLayoutStore.getState().doc,
    };
  };

  const startEndpoint = (obj: LineObject) => (which: "p1" | "p2", e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    const p = toPageIn(e);
    gesture.current = {
      kind: "endpoint",
      id: obj.id,
      which,
      startX: p.x,
      startY: p.y,
      startObj: obj,
      before: useLayoutStore.getState().doc,
    };
  };

  const onBoardPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (tool === "move") {
      capture(e);
      gesture.current = { kind: "pan", fromX: e.clientX, fromY: e.clientY, panX: pan.x, panY: pan.y };
      setPanning(true);
    } else if (DRAW_TOOLS.has(tool)) {
      capture(e);
      const p = toPageIn(e);
      gesture.current = { kind: "draw", startX: p.x, startY: p.y };
      setDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    } else if (tool === "select") {
      // reached the pasteboard itself — nothing was hit
      if (selectedIds.length) useLayoutStore.getState().setSelection([]);
    }
  };

  const onBoardPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const s = useLayoutStore.getState();
    if (g.kind === "pan") {
      s.setPan({ x: g.panX + (e.clientX - g.fromX), y: g.panY + (e.clientY - g.fromY) });
      return;
    }
    const p = toPageIn(e);
    const dx = p.x - g.startX;
    const dy = p.y - g.startY;
    if (g.kind === "draw") {
      setDraft({ x1: g.startX, y1: g.startY, x2: p.x, y2: p.y });
    } else if (g.kind === "move") {
      const o = g.startObj;
      s.transformObject(
        g.id,
        o.type === "line"
          ? { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy }
          : { x: o.x + dx, y: o.y + dy },
        true,
      );
    } else if (g.kind === "resize") {
      const b = resizeBBox(g.startBBox, g.dir, dx, dy, e.shiftKey);
      s.transformObject(g.id, { x: b.x, y: b.y, w: b.w, h: b.h }, true);
    } else {
      s.transformObject(
        g.id,
        g.which === "p1"
          ? { x1: g.startObj.x1 + dx, y1: g.startObj.y1 + dy }
          : { x2: g.startObj.x2 + dx, y2: g.startObj.y2 + dy },
        true,
      );
    }
  };

  const onBoardPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setPanning(false);
    if (!g) return;
    const s = useLayoutStore.getState();
    if (g.kind === "draw") {
      setDraft(null);
      const p = toPageIn(e);
      const dx = p.x - g.startX;
      const dy = p.y - g.startY;
      if (tool === "line") {
        if (Math.hypot(dx, dy) < DRAW_THRESHOLD_IN) return;
        s.addObject(createLine(g.startX, g.startY, p.x, p.y));
      } else {
        const w = Math.abs(dx);
        const h = Math.abs(dy);
        if (w < DRAW_THRESHOLD_IN && h < DRAW_THRESHOLD_IN) return;
        const type = tool === "pic" ? "picture" : (tool as "rect" | "ellipse");
        s.addObject(createFrame(type, Math.min(g.startX, p.x), Math.min(g.startY, p.y), w, h));
      }
    } else if (g.kind !== "pan") {
      s.commitGesture(g.before);
    }
  };

  const cursor =
    tool === "move"
      ? panning
        ? "cursor-grabbing"
        : "cursor-grab"
      : tool === "zoom"
        ? "cursor-zoom-in"
        : DRAW_TOOLS.has(tool)
          ? "cursor-crosshair"
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
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
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
            <PageSurface doc={doc} zoom={zoom} guidesVisible={guidesVisible}>
              {page.objects.map((o) => (
                <ObjectNode
                  key={o.id}
                  obj={o}
                  zoom={zoom}
                  interactive={tool === "select"}
                  onPointerDown={startMove(o)}
                />
              ))}
              {draft && <DraftPreview draft={draft} line={tool === "line"} zoom={zoom} />}
              {selected && tool === "select" && (
                <SelectionOverlay
                  obj={selected}
                  zoom={zoom}
                  onHandleDown={startResize(selected)}
                  onEndpointDown={
                    selected.type === "line" ? startEndpoint(selected) : () => undefined
                  }
                />
              )}
            </PageSurface>
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
