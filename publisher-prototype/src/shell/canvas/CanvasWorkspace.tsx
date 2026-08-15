import { useEffect, useRef, useState } from "react";
import {
  WHEEL_ZOOM_FACTOR,
  pageOriginPx,
  zoomAtPoint,
  zoomInStep,
  zoomOutStep,
  type Size,
  type Viewport,
} from "../../core/geometry/viewport";
import { panCommitted, zoomStepCommitted, zoomWheelCommitted } from "../../core/store";
import { useAppDispatch, useAppSelector } from "../hooks";
import { CanvasStage } from "./CanvasStage";
import { HorizontalRuler, VerticalRuler } from "./Rulers";
import { SvgOverlay } from "./SvgOverlay";

export type ActiveTool = "zoom" | "pan";

type PanDrag = { startX: number; startY: number; dx: number; dy: number };

/**
 * The canvas region: rulers + Konva stage + SVG overlay off one shared
 * viewport (PLAN.md §6.2), with the §6.3 gesture rule enforced by shape —
 * in-flight pan lives in local state, every surface renders from the
 * effective (committed ⊕ in-flight) viewport, and exactly one action
 * commits on pointer-up.
 */
export function CanvasWorkspace({
  activeTool,
  showProbe,
  onVpSizeChange,
}: {
  activeTool: ActiveTool;
  showProbe: boolean;
  onVpSizeChange: (size: Size) => void;
}) {
  const dispatch = useAppDispatch();
  const committed = useAppSelector((s) => s.viewport);
  const page = useAppSelector((s) => s.document.page);
  const objects = useAppSelector((s) => s.document.objects);

  const areaRef = useRef<HTMLDivElement>(null);
  const [vpSize, setVpSize] = useState<Size>({ w: 0, h: 0 });
  const [panDrag, setPanDrag] = useState<PanDrag | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const pageSize: Size = { w: page.widthIn, h: page.heightIn };
  const effective: Viewport = panDrag
    ? { zoom: committed.zoom, pan: { x: committed.pan.x + panDrag.dx, y: committed.pan.y + panDrag.dy } }
    : committed;

  // Latest values for the natively-attached wheel listener.
  const frameRef = useRef({ committed, vpSize, pageSize });
  frameRef.current = { committed, vpSize, pageSize };
  const dragJustEndedRef = useRef(false);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const size = { w: el.clientWidth, h: el.clientHeight };
      setVpSize(size);
      onVpSizeChange(size);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVpSizeChange]);

  // Wheel must be a native non-passive listener to preventDefault reliably.
  // Plain-wheel pan deltas coalesce through one rAF so a fast wheel doesn't
  // flood the store with dispatches.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const acc = { x: 0, y: 0 };
    let flush = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { committed: vp, vpSize: size, pageSize: pg } = frameRef.current;
      if (size.w <= 0 || size.h <= 0) return;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const factor = e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
        dispatch(zoomWheelCommitted(zoomAtPoint(vp, size, pg, anchor, vp.zoom * factor)));
        return;
      }
      // pan.wheel.scrolls: vertical by default, horizontal with Shift.
      acc.x += e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
      acc.y += e.shiftKey ? 0 : e.deltaY;
      if (flush === 0) {
        flush = requestAnimationFrame(() => {
          flush = 0;
          const cur = frameRef.current.committed;
          dispatch(panCommitted({ pan: { x: cur.pan.x - acc.x, y: cur.pan.y - acc.y } }));
          acc.x = 0;
          acc.y = 0;
        });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (flush !== 0) cancelAnimationFrame(flush);
    };
  }, [dispatch]);

  // pan.space-drag.temporary-pan: Space pans from within any tool.
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) =>
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !isTyping(e)) setSpaceHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const panning = activeTool === "pan" || spaceHeld;
  const cursor = panDrag ? "grabbing" : panning ? "grab" : "zoom-in";
  const origin = pageOriginPx(effective, vpSize, pageSize);

  return (
    <div className="workspace">
      <div className="ruler-corner" />
      <HorizontalRuler originPx={origin.x} lengthPx={vpSize.w} zoom={effective.zoom} />
      <VerticalRuler originPx={origin.y} lengthPx={vpSize.h} zoom={effective.zoom} />
      <div
        ref={areaRef}
        className="canvas-area"
        data-testid="canvas-area"
        style={{ cursor }}
        onPointerDown={(e) => {
          if (!panning || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setPanDrag({ startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
        }}
        onPointerMove={(e) => {
          if (!panDrag) return;
          setPanDrag({ ...panDrag, dx: e.clientX - panDrag.startX, dy: e.clientY - panDrag.startY });
        }}
        onPointerUp={(e) => {
          if (!panDrag) return;
          e.currentTarget.releasePointerCapture(e.pointerId);
          // pan.drag.moves-viewport: the one committed action for the gesture.
          dispatch(
            panCommitted({
              pan: { x: committed.pan.x + panDrag.dx, y: committed.pan.y + panDrag.dy },
            }),
          );
          dragJustEndedRef.current = panDrag.dx !== 0 || panDrag.dy !== 0;
          setPanDrag(null);
        }}
        onClick={(e) => {
          if (dragJustEndedRef.current) {
            dragJustEndedRef.current = false;
            return;
          }
          if (activeTool !== "zoom" || panning || vpSize.w <= 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          // zoom.click.steps-in / zoom.alt-click.steps-out
          const next = e.altKey ? zoomOutStep(committed.zoom) : zoomInStep(committed.zoom);
          dispatch(zoomStepCommitted(zoomAtPoint(committed, vpSize, pageSize, anchor, next)));
        }}
      >
        <CanvasStage viewport={effective} vpSize={vpSize} page={page} objects={objects} />
        <SvgOverlay viewport={effective} vpSize={vpSize} page={page} showProbe={showProbe} />
      </div>
    </div>
  );
}
