import { useEffect, useRef, useState } from "react";
import {
  pageOriginPx,
  wheelZoom,
  zoomAtPoint,
  zoomInStep,
  zoomOutStep,
  type Size,
  type Viewport,
} from "../../core/geometry/viewport";
import { toolRegistry } from "../../core/registry";
import { effectivePageSetup } from "../../core/render/pageSetup";
import { panCommitted, selectDocument, zoomStepCommitted, zoomWheelCommitted } from "../../core/store";
import { useAppDispatch, useAppSelector } from "../hooks";
import { isTextEntryTarget } from "../isTextEntryTarget";
import type { ToolOptionValues } from "../toolOptions";
import { CanvasStage } from "./CanvasStage";
import { HorizontalRuler, VerticalRuler } from "./Rulers";
import { SvgOverlay } from "./SvgOverlay";
import { useToolGestures } from "./useToolGestures";

type PanDrag = { startX: number; startY: number; dx: number; dy: number };

/**
 * The canvas region: rulers + Konva stage + SVG overlay off one shared
 * viewport (PLAN.md §6.2), with the §6.3 gesture rule enforced by shape —
 * in-flight pan lives in local state, tool-gesture state lives in the
 * useToolGestures machinery, every surface renders from the effective
 * (committed ⊕ in-flight) viewport, and exactly one action commits on
 * pointer-up.
 */
export function CanvasWorkspace({
  activeTool,
  pageIndex,
  showProbe,
  toolOptions,
  onVpSizeChange,
}: {
  /** Registry tool id; wired tools (wiredTools.ts) drive the canvas. */
  activeTool: string;
  /** Which document page renders — App-local state until the Pages panel. */
  pageIndex: number;
  showProbe: boolean;
  /** Live option values (App state) the wired tools' gesture ctx consumes. */
  toolOptions: ToolOptionValues;
  onVpSizeChange: (size: Size) => void;
}) {
  const dispatch = useAppDispatch();
  const committed = useAppSelector((s) => s.viewport);
  const doc = useAppSelector(selectDocument);
  const selectedIds = useAppSelector((s) => s.selection.ids);
  const penAnchors = useAppSelector((s) => s.pen.anchors);
  const setup = effectivePageSetup(doc, pageIndex);
  const objects = doc.pages[pageIndex]?.objects ?? [];
  const selectedObjects = objects.filter((o) => selectedIds.includes(o.id));

  const areaRef = useRef<HTMLDivElement>(null);
  const [vpSize, setVpSize] = useState<Size>({ w: 0, h: 0 });
  const [panDrag, setPanDrag] = useState<PanDrag | null>(null);
  const panDragRef = useRef<PanDrag | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const dragJustEndedRef = useRef(false);

  const pageSize: Size = setup.size;
  const effective: Viewport = panDrag
    ? { zoom: committed.zoom, pan: { x: committed.pan.x + panDrag.dx, y: committed.pan.y + panDrag.dy } }
    : committed;

  const panning = activeTool === "pan" || spaceHeld;

  const gestures = useToolGestures({
    activeTool,
    panning,
    pageIndex,
    viewport: effective,
    vpSize,
    pageSize,
    objects,
    selectedIds,
    penAnchors,
    toolOptions,
    areaRef,
    suppressClickRef: dragJustEndedRef,
  });

  // Latest values for the natively-attached wheel listener. A running tool
  // gesture drops wheel input exactly like an in-flight pan drag: the
  // gesture in progress wins.
  const frameRef = useRef({ committed, vpSize, pageSize, dragging: false });
  frameRef.current = { committed, vpSize, pageSize, dragging: panDrag !== null || gestures.active };

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
      const { committed: vp, vpSize: size, pageSize: pg, dragging } = frameRef.current;
      if (size.w <= 0 || size.h <= 0) return;
      // While a pan drag is in flight the store lags the rendered viewport
      // by the drag delta, so any wheel dispatch would anchor to the wrong
      // frame; the gesture in progress wins and wheel input is dropped.
      if (dragging) return;
      // Normalize non-pixel wheel deltas (Firefox reports lines): ~16px per
      // line, a viewport height per page.
      const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? size.h : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        // Delta-proportional: rate follows wheel travel, so smooth-scroll
        // devices no longer compound a full step per micro-event.
        dispatch(zoomWheelCommitted(zoomAtPoint(vp, size, pg, anchor, wheelZoom(vp.zoom, dy))));
        return;
      }
      // pan.wheel.scrolls: vertical by default, horizontal with Shift.
      acc.x += e.shiftKey && dx === 0 ? dy : dx;
      acc.y += e.shiftKey ? 0 : dy;
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

  // pan.space-drag.temporary-pan: Space pans from within any tool. Losing
  // window focus while Space is down would eat the keyup, so blur resets.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !isTextEntryTarget(e.target)) setSpaceHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Cursor comes from the active tool's contract, under the dynamic pan /
  // Space / zoom overrides that always win while they apply. A running
  // resize/rotate outranks the contract too: its handle is gone from the
  // overlay for the duration, so the area carries that handle's cursor.
  const contractCursor = toolRegistry.find((t) => t.id === activeTool)?.cursor ?? "default";
  const cursor = panDrag
    ? "grabbing"
    : panning
      ? "grab"
      : (gestures.handleCursor ?? (activeTool === "zoom" ? "zoom-in" : contractCursor));
  const origin = pageOriginPx(effective, vpSize, pageSize);

  // Ends the drag from pointerup and from the interrupt paths (pointercancel,
  // lost capture, buttons released off-window) alike: the viewport stays
  // where the preview left it, committed by the gesture's single action.
  // Idempotent through the ref — the browser fires lostpointercapture right
  // after pointerup, and the gesture must not commit twice.
  const endPanDrag = () => {
    const drag = panDragRef.current;
    if (!drag) return;
    panDragRef.current = null;
    dispatch(
      panCommitted({ pan: { x: committed.pan.x + drag.dx, y: committed.pan.y + drag.dy } }),
    );
    dragJustEndedRef.current = drag.dx !== 0 || drag.dy !== 0;
    setPanDrag(null);
  };

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
          if (panning && e.button === 0) {
            e.currentTarget.setPointerCapture(e.pointerId);
            const drag: PanDrag = { startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 };
            panDragRef.current = drag;
            setPanDrag(drag);
            return;
          }
          gestures.onPointerDown(e);
        }}
        onPointerMove={(e) => {
          const drag = panDragRef.current;
          if (drag) {
            if (e.buttons === 0) {
              // The release happened where we couldn't see it — end the
              // gesture instead of chasing a button that's no longer down.
              endPanDrag();
              return;
            }
            const next: PanDrag = { ...drag, dx: e.clientX - drag.startX, dy: e.clientY - drag.startY };
            panDragRef.current = next;
            setPanDrag(next);
            return;
          }
          gestures.onPointerMove(e);
        }}
        onPointerUp={(e) => {
          // pan.drag.moves-viewport: the one committed action for the gesture.
          // Implicit capture release follows; both enders are idempotent.
          endPanDrag();
          gestures.onPointerEnd(e);
        }}
        onPointerCancel={(e) => {
          endPanDrag();
          gestures.onPointerEnd(e);
        }}
        onLostPointerCapture={(e) => {
          endPanDrag();
          gestures.onPointerEnd(e);
        }}
        onDoubleClick={gestures.onDoubleClick}
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
        <CanvasStage
          viewport={effective}
          vpSize={vpSize}
          setup={setup}
          objects={objects}
          swatches={doc.swatches}
        />
        <SvgOverlay
          viewport={effective}
          vpSize={vpSize}
          setup={setup}
          showProbe={showProbe}
          preview={gestures.preview}
          selectedObjects={selectedObjects}
          penDraft={activeTool === "pen" ? penAnchors : []}
          showChrome={activeTool === "select" && gestures.preview === null}
          onResizeStart={gestures.beginResize}
          onCornerRadiusStart={gestures.beginCornerRadius}
          onRotateStart={gestures.beginRotate}
        />
      </div>
    </div>
  );
}
