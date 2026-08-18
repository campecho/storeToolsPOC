import { useEffect, useRef, useState } from "react";
import type { UnknownAction } from "@reduxjs/toolkit";
import {
  pxToIn,
  screenToDoc,
  type Size,
  type Viewport,
} from "../../core/geometry/viewport";
import {
  drawBoundsMachine,
  drawLineMachine,
  drawPathMachine,
  marqueeMachine,
  moveMachine,
  resizeMachine,
  rotateMachine,
  slopInInches,
  type GestureContext,
  type GestureMachine,
  type GestureModifiers,
  type GesturePoint,
  type GesturePreview,
  type ResizeHandle,
} from "../../core/gestures";
import { hitTestPoint, selectionAabb, type Rect } from "../../core/hittest";
import type { LayoutObject } from "../../core/model";
import { selectTool } from "../../core/registry/tools/selection";
import {
  gestureCancelled,
  objectNudgeCommitted,
  selectionCycleCommitted,
  selectionReplaceCommitted,
  selectionToggleCommitted,
  type AppDispatch,
  type FrameBox,
  type LineEndpoints,
} from "../../core/store";
import { useAppDispatch } from "../hooks";
import { isTextEntryTarget } from "../isTextEntryTarget";
import { createObjectId } from "../objectId";
import { PATH_TOOL_CONFIGS } from "../pathTools";
import { drawStyleFromOptions, optionNumber, type ToolOptionValues } from "../toolOptions";

/**
 * Tool gesture routing (PLAN.md §6.3 hard rule): the active machine's state
 * lives in a ref — NEVER in Redux — the preview renders from it via React
 * state, and exactly one action dispatches on end/cancel. One gesture runs
 * at a time; the workspace's four interrupt paths (pointerup, pointercancel,
 * lostpointercapture, buttons===0 mid-move) end it idempotently, mirroring
 * the established pan-drag pattern.
 */

/** A running gesture: the machine closed over its evolving state, plus the
    hooks the select tool's click clauses need around a null end. */
type Session = {
  update(point: GesturePoint, modifiers: GestureModifiers): void;
  /** Dispatches the gesture's commit (or the null-end fallback), if any. */
  end(modifiers: GestureModifiers): void;
  /** Dispatches gesture/cancelled — the aborted gesture's only record. */
  cancel(): void;
  preview(): GesturePreview | null;
  dragged(): boolean;
};

function machineSession<S extends { dragged: boolean }, C extends GestureContext>(
  machine: GestureMachine<S, C>,
  start: GesturePoint,
  ctx: C,
  dispatch: AppDispatch,
  onNullEnd?: (modifiers: GestureModifiers) => UnknownAction | null,
): Session {
  let state = machine.begin(start, ctx);
  return {
    update(point, modifiers) {
      state = machine.update(state, point, modifiers);
    },
    end(modifiers) {
      const result = machine.end(state, modifiers);
      const action = result.action ?? onNullEnd?.(modifiers) ?? null;
      if (action !== null) dispatch(action);
    },
    cancel() {
      dispatch(machine.cancel().action);
    },
    preview: () => machine.preview(state),
    dragged: () => state.dragged,
  };
}

/** Machine-less session for the select tool's modified downs (Shift/Alt):
    they never start move — only track slop and commit a click on a
    drag-free release. No preview. */
function clickSession(
  start: GesturePoint,
  zoom: number,
  dispatch: AppDispatch,
  commit: () => UnknownAction | null,
): Session {
  let dragged = false;
  return {
    update(point) {
      dragged =
        dragged || Math.hypot(point.x - start.x, point.y - start.y) > slopInInches(zoom);
    },
    end() {
      if (dragged) return;
      const action = commit();
      if (action !== null) dispatch(action);
    },
    cancel() {
      dispatch(gestureCancelled());
    },
    preview: () => null,
    dragged: () => dragged,
  };
}

/** The scaling origin the resize machine expects: the handle opposite the
    dragged one on the initial selection AABB — corner for corner handles,
    edge midpoint for edge handles. */
function resizeAnchor(handle: ResizeHandle, bounds: Rect): GesturePoint {
  return {
    x: handle.includes("w")
      ? bounds.x + bounds.w
      : handle.includes("e")
        ? bounds.x
        : bounds.x + bounds.w / 2,
    y: handle.includes("n")
      ? bounds.y + bounds.h
      : handle.includes("s")
        ? bounds.y
        : bounds.y + bounds.h / 2,
  };
}

const ARROW_DELTAS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export type ToolGestureArgs = {
  activeTool: string;
  /** Pan tool active or Space held — tool gestures never start while panning. */
  panning: boolean;
  pageIndex: number;
  viewport: Viewport;
  vpSize: Size;
  pageSize: Size;
  /** The rendered page's objects in z-order. */
  objects: readonly LayoutObject[];
  selectedIds: readonly string[];
  toolOptions: ToolOptionValues;
  areaRef: { current: HTMLDivElement | null };
  /** The workspace's dragJustEndedRef: a completed/cancelled drag suppresses
      the trailing click exactly like a pan drag does. */
  suppressClickRef: { current: boolean };
};

export type ToolGestures = {
  preview: GesturePreview | null;
  /** True while any gesture session runs (wheel input is dropped, like pan). */
  active: boolean;
  onPointerDown(e: React.PointerEvent<HTMLDivElement>): void;
  onPointerMove(e: React.PointerEvent<HTMLDivElement>): void;
  /** pointerup / pointercancel / lostpointercapture — idempotent. */
  onPointerEnd(e: React.PointerEvent<HTMLDivElement>): void;
  beginResize(handle: ResizeHandle, e: React.PointerEvent<SVGElement>): void;
  beginRotate(e: React.PointerEvent<SVGElement>): void;
};

export function useToolGestures(args: ToolGestureArgs): ToolGestures {
  const dispatch = useAppDispatch();
  const sessionRef = useRef<Session | null>(null);
  const [preview, setPreview] = useState<GesturePreview | null>(null);
  const [active, setActive] = useState(false);
  // Latest args for the natively-attached keyboard listener (frameRef pattern).
  const argsRef = useRef(args);
  argsRef.current = args;

  const toDoc = (e: { clientX: number; clientY: number }): GesturePoint => {
    const el = args.areaRef.current;
    const rect = el ? el.getBoundingClientRect() : { left: 0, top: 0 };
    return screenToDoc(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      args.viewport,
      args.vpSize,
      args.pageSize,
    );
  };

  const begin = (session: Session, pointerId: number): void => {
    sessionRef.current = session;
    // Capture on the canvas area for every gesture — handle downs included —
    // so the workspace's shared move/up/interrupt handlers see the stream.
    args.areaRef.current?.setPointerCapture(pointerId);
    setActive(true);
    setPreview(session.preview());
  };

  const endSession = (modifiers: GestureModifiers): void => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    session.end(modifiers);
    if (session.dragged()) args.suppressClickRef.current = true;
    setActive(false);
    setPreview(null);
  };

  const selectedObjects = (): LayoutObject[] =>
    args.objects.filter((o) => args.selectedIds.includes(o.id));

  const selectPointerDown = (
    point: GesturePoint,
    modifiers: GestureModifiers,
    pointerId: number,
  ): void => {
    const { pageIndex, viewport, objects, selectedIds } = args;
    const zoom = viewport.zoom;
    // Hit rules come off the select contract, not hardcoded values: 4px
    // tolerance converts to inches at the current zoom (PLAN.md §5).
    const hits = hitTestPoint(objects, point, {
      toleranceIn: pxToIn(selectTool.hitTest.tolerancePx, zoom),
      unfilledInterior: selectTool.hitTest.unfilledInterior,
      lockedObjects: selectTool.hitTest.lockedObjects,
    });
    const top = hits[0];
    if (top === undefined) {
      // select.drag-empty.marquee-selects; its under-slop end IS
      // select.click-empty.clears — the machine dispatches either itself.
      begin(
        machineSession(marqueeMachine, point, { pageIndex, zoom, objects: [...objects] }, dispatch),
        pointerId,
      );
      return;
    }
    if (modifiers.shift) {
      // select.shift-click.toggles-membership — modified downs never start move.
      begin(
        clickSession(point, zoom, dispatch, () => selectionToggleCommitted({ id: top.id })),
        pointerId,
      );
      return;
    }
    if (modifiers.alt) {
      // select.alt-click.selects-beneath: the next object BENEATH the current
      // single selection in the hit stack, wrapping to the top; a selection
      // that is not in the stack starts over at the topmost hit.
      begin(
        clickSession(point, zoom, dispatch, () => {
          const selectedId = selectedIds.length === 1 ? selectedIds[0] : undefined;
          const at = selectedId === undefined ? -1 : hits.findIndex((h) => h.id === selectedId);
          const next = at === -1 ? hits[0] : hits[(at + 1) % hits.length];
          return next === undefined ? null : selectionCycleCommitted({ id: next.id });
        }),
        pointerId,
      );
      return;
    }
    if (!selectedIds.includes(top.id)) {
      // ASSUMPTION: select.click.selects-topmost commits EARLY, on
      // pointerdown — so a continuing drag is already "drag on selected
      // object" (select.drag.moves-selection) and moves the new selection.
      // The contract binds the clause to "click" without fixing the moment;
      // down-commit is the Publisher convention, pending SME review.
      dispatch(selectionReplaceCommitted({ ids: [top.id] }));
      begin(
        machineSession(moveMachine, point, { pageIndex, zoom, ids: [top.id] }, dispatch),
        pointerId,
      );
      return;
    }
    // Down on an already-selected object: move the whole selection.
    begin(
      machineSession(
        moveMachine,
        point,
        { pageIndex, zoom, ids: [...selectedIds] },
        dispatch,
        (endModifiers) => {
          // ASSUMPTION: an under-slop release (machine end returns null) on a
          // member of a MULTI-selection collapses the selection to the clicked
          // object — the Publisher convention; a single selection stays as-is
          // with no dispatch. Modifiers pressed mid-hold suppress the collapse.
          if (endModifiers.shift || endModifiers.alt || selectedIds.length <= 1) return null;
          return selectionReplaceCommitted({ ids: [top.id] });
        },
      ),
      pointerId,
    );
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || args.panning || sessionRef.current) return;
    const { activeTool, pageIndex, viewport, toolOptions } = args;
    const zoom = viewport.zoom;
    const point = toDoc(e);
    const modifiers: GestureModifiers = { shift: e.shiftKey, alt: e.altKey };
    if (activeTool === "rect" || activeTool === "ellipse") {
      begin(
        machineSession(
          drawBoundsMachine(activeTool),
          point,
          {
            pageIndex,
            zoom,
            style: drawStyleFromOptions(toolOptions, activeTool),
            idFactory: createObjectId,
          },
          dispatch,
        ),
        e.pointerId,
      );
      return;
    }
    const pathConfig = PATH_TOOL_CONFIGS[activeTool];
    if (pathConfig !== undefined) {
      begin(
        machineSession(
          drawPathMachine(pathConfig.creator),
          point,
          {
            pageIndex,
            zoom,
            style: drawStyleFromOptions(toolOptions, activeTool),
            idFactory: createObjectId,
            pathForBox: (box) => pathConfig.pathForBox(toolOptions, box),
          },
          dispatch,
        ),
        e.pointerId,
      );
      return;
    }
    if (activeTool === "line") {
      begin(
        machineSession(
          drawLineMachine,
          point,
          {
            pageIndex,
            zoom,
            style: drawStyleFromOptions(toolOptions, activeTool),
            idFactory: createObjectId,
          },
          dispatch,
        ),
        e.pointerId,
      );
      return;
    }
    if (activeTool === "select") selectPointerDown(point, modifiers, e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const session = sessionRef.current;
    if (!session) return;
    const modifiers: GestureModifiers = { shift: e.shiftKey, alt: e.altKey };
    if (e.buttons === 0) {
      // The release happened where we couldn't see it — end the gesture
      // instead of chasing a button that's no longer down (pan pattern).
      endSession(modifiers);
      return;
    }
    session.update(toDoc(e), modifiers);
    setPreview(session.preview());
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>): void => {
    endSession({ shift: e.shiftKey, alt: e.altKey });
  };

  const beginResize = (handle: ResizeHandle, e: React.PointerEvent<SVGElement>): void => {
    if (e.button !== 0 || args.panning || sessionRef.current) return;
    const selection = selectedObjects();
    const bounds = selectionAabb(selection);
    if (bounds === null) return;
    const initial: Record<string, FrameBox | LineEndpoints> = {};
    for (const obj of selection) {
      initial[obj.id] =
        obj.type === "line"
          ? { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 }
          : { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    }
    e.stopPropagation();
    begin(
      machineSession(
        resizeMachine,
        toDoc(e),
        {
          pageIndex: args.pageIndex,
          zoom: args.viewport.zoom,
          handle,
          anchor: resizeAnchor(handle, bounds),
          bounds,
          initial,
        },
        dispatch,
      ),
      e.pointerId,
    );
  };

  const beginRotate = (e: React.PointerEvent<SVGElement>): void => {
    if (e.button !== 0 || args.panning || sessionRef.current) return;
    const selection = selectedObjects();
    const bounds = selectionAabb(selection);
    if (bounds === null) return;
    // Lines carry no rotation field — the rotate ctx excludes them per the
    // machine's contract; an all-line selection starts no rotate at all.
    const initialRotations: Record<string, number> = {};
    for (const obj of selection) {
      if (obj.type !== "line") initialRotations[obj.id] = obj.rotation;
    }
    if (Object.keys(initialRotations).length === 0) return;
    e.stopPropagation();
    begin(
      machineSession(
        rotateMachine,
        toDoc(e),
        {
          pageIndex: args.pageIndex,
          zoom: args.viewport.zoom,
          pivot: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 },
          initialRotations,
        },
        dispatch,
      ),
      e.pointerId,
    );
  };

  // Esc cancels the in-flight gesture (…esc.cancels-draw / -drag clauses);
  // arrows nudge the selection (select.arrow.nudges). Key repeat is fine for
  // nudging: each keydown is its own nudge gesture, one history entry each.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        const session = sessionRef.current;
        if (!session) return;
        sessionRef.current = null;
        session.cancel();
        // Suppress the trailing click so a cancelled zoom-area click can't fire.
        argsRef.current.suppressClickRef.current = true;
        setActive(false);
        setPreview(null);
        return;
      }
      const delta = ARROW_DELTAS[e.key];
      if (delta === undefined) return;
      const { activeTool, selectedIds, pageIndex, toolOptions } = argsRef.current;
      if (activeTool !== "select" || sessionRef.current !== null) return;
      if (selectedIds.length === 0 || isTextEntryTarget(e.target)) return;
      e.preventDefault();
      const nudge = optionNumber(toolOptions, "select", "nudgeIncrement", 0.1);
      dispatch(
        objectNudgeCommitted({
          pageIndex,
          ids: [...selectedIds],
          dx: delta[0] * nudge,
          dy: delta[1] * nudge,
        }),
      );
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);

  return { preview, active, onPointerDown, onPointerMove, onPointerEnd, beginResize, beginRotate };
}
