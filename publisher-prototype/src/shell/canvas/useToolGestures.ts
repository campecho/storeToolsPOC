import { useCallback, useEffect, useRef, useState } from "react";
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
  drawLineMachineFor,
  calloutTailMachine,
  cornerRadiusMachine,
  drawShapeMachine,
  finishPenDraft,
  marqueeMachine,
  moveMachine,
  penMachine,
  resizeAnchor,
  resizeMachine,
  rotateMachine,
  slopInInches,
  starInnerRadiusMachine,
  type GestureContext,
  type GestureMachine,
  type GestureModifiers,
  type GesturePoint,
  type GesturePreview,
  type ResizeHandle,
} from "../../core/gestures";
import { framePivot, hitTestPoint, selectionFrame } from "../../core/hittest";
import {
  enteredGroup,
  groupingUnits,
  selectionUnit,
  ungroupingGroupIds,
  type Group,
  type LayoutObject,
} from "../../core/model";
import { selectTool } from "../../core/registry/tools/selection";
import { resizeCursor, rotateCursor } from "./cursors";
import {
  arrowDrawCommitted,
  gestureCancelled,
  isDrawCommit,
  objectGroupCommitted,
  objectNudgeCommitted,
  objectUngroupCommitted,
  selectionCycleCommitted,
  selectionGroupEnteredCommitted,
  selectionReplaceCommitted,
  selectionToggleCommitted,
  type FrameBox,
  type LineEndpoints,
  type PenAnchor,
} from "../../core/store";
import { useAppDispatch } from "../hooks";
import { isTextEntryTarget } from "../isTextEntryTarget";
import { createGroupId, createObjectId } from "../objectId";
import { SHAPE_TOOL_CONFIGS } from "../shapeTools";
import {
  drawStyleFromOptions,
  lineExtrasFromOptions,
  optionBoolean,
  optionNumber,
  type ToolOptionValues,
} from "../toolOptions";

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

/** How a session hands its one action to the app. Every action this hook
    produces goes through here rather than to `dispatch` directly, so the
    draw-commit consequences (§4.1's tool switch) sit in exactly one place
    and no commit path can quietly skip them. */
type Commit = (action: UnknownAction) => void;

function machineSession<S extends { dragged: boolean }, C extends GestureContext>(
  machine: GestureMachine<S, C>,
  start: GesturePoint,
  ctx: C,
  commit: Commit,
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
      if (action !== null) commit(action);
    },
    cancel() {
      commit(machine.cancel().action);
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
  commit: Commit,
  actionForClick: () => UnknownAction | null,
): Session {
  let dragged = false;
  return {
    update(point) {
      dragged =
        dragged || Math.hypot(point.x - start.x, point.y - start.y) > slopInInches(zoom);
    },
    end() {
      if (dragged) return;
      const action = actionForClick();
      if (action !== null) commit(action);
    },
    cancel() {
      commit(gestureCancelled());
    },
    preview: () => null,
    dragged: () => dragged,
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
  /** The document's groups — clicks and marquees select whole groups
      through them (core/model/groups.ts). */
  groups: readonly Group[];
  selectedIds: readonly string[];
  /** The group the selection has descended into; null at the top level. */
  enteredGroupId: string | null;
  /** The pen draft (penSlice state) — the pen press machine's ctx and the
      Enter/double-click finish paths read it. */
  penAnchors: readonly PenAnchor[];
  toolOptions: ToolOptionValues;
  areaRef: { current: HTMLDivElement | null };
  /** The workspace's dragJustEndedRef: a completed/cancelled drag suppresses
      the trailing click exactly like a pan drag does. */
  suppressClickRef: { current: boolean };
  /** Fired once per committed draw, after the commit dispatches — the active
      tool lives in App, so the hook reports the draw rather than switching. */
  onObjectDrawn?: () => void;
};

export type ToolGestures = {
  preview: GesturePreview | null;
  /** True while any gesture session runs (wheel input is dropped, like pan). */
  active: boolean;
  /** The cursor of the handle a resize/rotate started from, held for the whole
      gesture; null otherwise. The preview replaces the chrome the moment a
      gesture runs (§6.3), taking the hovered handle — and its cursor — with
      it, so the workspace flies this one until the gesture ends. */
  handleCursor: string | null;
  onPointerDown(e: React.PointerEvent<HTMLDivElement>): void;
  onPointerMove(e: React.PointerEvent<HTMLDivElement>): void;
  /** pointerup / pointercancel / lostpointercapture — idempotent. */
  onPointerEnd(e: React.PointerEvent<HTMLDivElement>): void;
  /** select.double-click-group.enters-group under the select tool, and
      pen.double-click.commits-open-path under the pen (the pointer half;
      Enter is the keyboard half). No-op for every other tool. */
  onDoubleClick(e: React.MouseEvent<HTMLDivElement>): void;
  beginResize(handle: ResizeHandle, e: React.PointerEvent<SVGElement>): void;
  beginRotate(e: React.PointerEvent<SVGElement>): void;
  /** The adjust-handle clause the selected shape's kind owns — corner
      radius, star inner radius, or callout tail. No-op unless the selection
      is exactly one unlocked shape of an adjustable kind, which is also the
      only case the handle is drawn for. */
  beginShapeAdjust(e: React.PointerEvent<SVGElement>): void;
};

export function useToolGestures(args: ToolGestureArgs): ToolGestures {
  const dispatch = useAppDispatch();
  const sessionRef = useRef<Session | null>(null);
  const [preview, setPreview] = useState<GesturePreview | null>(null);
  const [active, setActive] = useState(false);
  const [handleCursor, setHandleCursor] = useState<string | null>(null);
  // Latest args for the natively-attached keyboard listener (frameRef pattern).
  const argsRef = useRef(args);
  argsRef.current = args;

  // The one door every gesture action leaves by. A committed draw hands the
  // page back to the select tool: the object just made is already selected
  // (selectionSlice's isDrawCommit matcher), and what you do to it next —
  // move it, resize it, style it from a panel — is select-tool work, so
  // staying on the draw tool would cost a dock trip after every shape.
  // ASSUMPTION: neither §4.1 nor §4.4 says whether a draw tool is sticky;
  // switch-after-draw is the Publisher convention, pending SME review.
  const commit = useCallback<Commit>(
    (action) => {
      dispatch(action);
      if (isDrawCommit(action)) argsRef.current.onObjectDrawn?.();
    },
    [dispatch],
  );

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
    setHandleCursor(null);
  };

  const selectedObjects = (): LayoutObject[] =>
    args.objects.filter((o) => args.selectedIds.includes(o.id));

  /** The objects a click on `id` acts on, and the group context it ends in:
      a grouped object resolves to its whole group until that group is
      entered (core/model/groups.ts). */
  const unitFor = (id: string) =>
    selectionUnit(args.objects, args.groups, id, args.enteredGroupId);

  /** Same members, in any order — used to leave a redundant re-selection
      undispatched. */
  const sameSelection = (ids: readonly string[], selectedIds: readonly string[]): boolean =>
    ids.length === selectedIds.length && ids.every((id) => selectedIds.includes(id));

  /** The select tool's clauses hit-test through the contract's own rules,
      not hardcoded values: 4px tolerance converts to inches at the current
      zoom (PLAN.md §5). */
  const selectHits = (point: GesturePoint, zoom: number) =>
    hitTestPoint(args.objects, point, {
      toleranceIn: pxToIn(selectTool.hitTest.tolerancePx, zoom),
      unfilledInterior: selectTool.hitTest.unfilledInterior,
      lockedObjects: selectTool.hitTest.lockedObjects,
    });

  const selectPointerDown = (
    point: GesturePoint,
    modifiers: GestureModifiers,
    pointerId: number,
  ): void => {
    const { pageIndex, viewport, objects, groups, selectedIds, enteredGroupId } = args;
    const zoom = viewport.zoom;
    const hits = selectHits(point, zoom);
    const top = hits[0];
    if (top === undefined) {
      // select.drag-empty.marquee-selects; its under-slop end IS
      // select.click-empty.clears — the machine dispatches either itself.
      begin(
        machineSession(
          marqueeMachine,
          point,
          { pageIndex, zoom, objects: [...objects], groups, enteredGroupId },
          commit,
        ),
        pointerId,
      );
      return;
    }
    if (modifiers.shift) {
      // select.shift-click.toggles-membership — modified downs never start
      // move. A group toggles whole, so the selection never holds part of one.
      begin(
        clickSession(point, zoom, commit, () =>
          selectionToggleCommitted({ ids: unitFor(top.id).ids }),
        ),
        pointerId,
      );
      return;
    }
    if (modifiers.alt) {
      // select.alt-click.selects-beneath: the next object BENEATH the current
      // selection in the hit stack, wrapping to the top; a selection that is
      // not in the stack starts over at the topmost hit. The stack is walked
      // by OBJECT and the landing object then resolves to its unit, so
      // cycling still reaches every object under the pointer when groups
      // cover several of them.
      begin(
        clickSession(point, zoom, commit, () => {
          const at = hits.findIndex((h) => selectedIds.includes(h.id));
          const next = at === -1 ? hits[0] : hits[(at + 1) % hits.length];
          return next === undefined ? null : selectionCycleCommitted(unitFor(next.id));
        }),
        pointerId,
      );
      return;
    }
    const unit = unitFor(top.id);
    if (!selectedIds.includes(top.id)) {
      // ASSUMPTION: select.click.selects-topmost commits EARLY, on
      // pointerdown — so a continuing drag is already "drag on selected
      // object" (select.drag.moves-selection) and moves the new selection.
      // The contract binds the clause to "click" without fixing the moment;
      // down-commit is the Publisher convention, pending SME review.
      commit(selectionReplaceCommitted(unit));
      begin(
        machineSession(moveMachine, point, { pageIndex, zoom, ids: unit.ids }, commit),
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
        commit,
        (endModifiers) => {
          // ASSUMPTION: an under-slop release (machine end returns null) on a
          // member of a MULTI-selection collapses the selection to the clicked
          // object's UNIT — the Publisher convention; collapsing to the bare
          // object would break a selected group apart on a plain click.
          // A selection already equal to that unit stays as-is with no
          // dispatch. Modifiers pressed mid-hold suppress the collapse.
          if (endModifiers.shift || endModifiers.alt) return null;
          if (sameSelection(unit.ids, selectedIds)) return null;
          return selectionReplaceCommitted(unit);
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
          commit,
        ),
        e.pointerId,
      );
      return;
    }
    if (activeTool === "pen") {
      begin(
        machineSession(
          penMachine,
          point,
          {
            pageIndex,
            zoom,
            anchors: args.penAnchors,
            style: drawStyleFromOptions(toolOptions, "pen"),
            idFactory: createObjectId,
          },
          commit,
        ),
        e.pointerId,
      );
      return;
    }
    const shapeConfig = SHAPE_TOOL_CONFIGS[activeTool];
    if (shapeConfig !== undefined) {
      begin(
        machineSession(
          drawShapeMachine(shapeConfig.creator),
          point,
          {
            pageIndex,
            zoom,
            style: drawStyleFromOptions(toolOptions, activeTool),
            idFactory: createObjectId,
            geometryForBox: (box: { x: number; y: number; w: number; h: number }) =>
              shapeConfig.geometryForBox(toolOptions, box),
          },
          commit,
        ),
        e.pointerId,
      );
      return;
    }
    if (activeTool === "line" || activeTool === "arrow") {
      begin(
        machineSession(
          activeTool === "line" ? drawLineMachine : drawLineMachineFor(arrowDrawCommitted),
          point,
          {
            pageIndex,
            zoom,
            style: drawStyleFromOptions(toolOptions, activeTool),
            idFactory: createObjectId,
            extras: lineExtrasFromOptions(toolOptions, activeTool),
          },
          commit,
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

  /** Every selected object's starting geometry, in the shape the transform
      machines carry and commit: frames as boxes, lines as endpoints. */
  const initialGeometry = (
    selection: readonly LayoutObject[],
  ): Record<string, FrameBox | LineEndpoints> => {
    const initial: Record<string, FrameBox | LineEndpoints> = {};
    for (const obj of selection) {
      initial[obj.id] =
        obj.type === "line"
          ? { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 }
          : { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    }
    return initial;
  };

  const beginResize = (handle: ResizeHandle, e: React.PointerEvent<SVGElement>): void => {
    if (e.button !== 0 || args.panning || sessionRef.current) return;
    const selection = selectedObjects();
    const frame = selectionFrame(selection);
    if (frame === null) return;
    const initial = initialGeometry(selection);
    e.stopPropagation();
    setHandleCursor(resizeCursor(handle, frame.rotation));
    begin(
      machineSession(
        resizeMachine,
        toDoc(e),
        {
          pageIndex: args.pageIndex,
          zoom: args.viewport.zoom,
          handle,
          anchor: resizeAnchor(handle, frame.box),
          bounds: frame.box,
          rotation: frame.rotation,
          initial,
        },
        commit,
      ),
      e.pointerId,
    );
  };

  const beginRotate = (e: React.PointerEvent<SVGElement>): void => {
    if (e.button !== 0 || args.panning || sessionRef.current) return;
    const selection = selectedObjects();
    const frame = selectionFrame(selection);
    if (frame === null) return;
    // Lines carry no rotation field — the rotate ctx excludes them from
    // `initialRotations` per the machine's contract. Their endpoints still
    // orbit the pivot through `initial`, so a line turns with its group and
    // a lone line turns about its own bounds.
    const initialRotations: Record<string, number> = {};
    for (const obj of selection) {
      if (obj.type !== "line") initialRotations[obj.id] = obj.rotation;
    }
    e.stopPropagation();
    setHandleCursor(rotateCursor(frame.rotation));
    begin(
      machineSession(
        rotateMachine,
        toDoc(e),
        {
          pageIndex: args.pageIndex,
          zoom: args.viewport.zoom,
          pivot: framePivot(frame.box),
          frameRotation: frame.rotation,
          initialRotations,
          initial: initialGeometry(selection),
        },
        commit,
      ),
      e.pointerId,
    );
  };

  const beginShapeAdjust = (e: React.PointerEvent<SVGElement>): void => {
    if (e.button !== 0 || args.panning || sessionRef.current) return;
    const selection = selectedObjects();
    const only = selection.length === 1 ? selection[0] : undefined;
    if (only === undefined || only.type !== "shape" || only.locked) return;
    const shared = {
      pageIndex: args.pageIndex,
      zoom: args.viewport.zoom,
      id: only.id,
      frame: { x: only.x, y: only.y, w: only.w, h: only.h },
      rotation: only.rotation,
    };
    // Each adjustable kind starts its own machine off the same handle; a kind
    // with nothing to adjust never drew one to press.
    const session =
      only.shape === "roundedRect"
        ? machineSession(
            cornerRadiusMachine,
            toDoc(e),
            { ...shared, initialRadius: only.cornerRadius ?? 0 },
            commit,
          )
        : only.shape === "starPolygon"
          ? machineSession(
              starInnerRadiusMachine,
              toDoc(e),
              {
                ...shared,
                initialRatio: only.innerRadiusRatio ?? 0.5,
                points: only.points ?? 5,
              },
              commit,
            )
          : only.shape === "callout"
            ? machineSession(calloutTailMachine, toDoc(e), shared, commit)
            : null;
    if (session === null) return;
    e.stopPropagation();
    // Adjust handles drag along the shape, so they wear the frame's own
    // horizontal cursor rather than a page-axis one.
    setHandleCursor(resizeCursor("e", only.rotation));
    begin(session, e.pointerId);
  };

  // Esc cancels the in-flight gesture (…esc.cancels-draw / -drag clauses) or
  // discards a pen draft between presses (pen.esc.discards-path); Enter
  // finishes the pen draft (pen.double-click.commits-open-path's keyboard
  // half); arrows nudge the selection (select.arrow.nudges); Ctrl/Cmd+G and
  // Ctrl/Cmd+Shift+G group and ungroup it. Key repeat is fine for nudging:
  // each keydown is its own nudge gesture, one history entry each.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        // select.ctrl-g.groups-selection / select.ctrl-shift-g.ungroups-selection.
        // preventDefault unconditionally once the select tool owns the chord —
        // the browser's find-again must not fire behind a command that simply
        // had nothing to combine. Plain G stays the flowchart tool's shortcut;
        // App's tool-shortcut handler ignores modified keys.
        const { activeTool, objects, groups, selectedIds, enteredGroupId, pageIndex } =
          argsRef.current;
        if (activeTool !== "select" || sessionRef.current !== null) return;
        if (isTextEntryTarget(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) {
          const groupIds = ungroupingGroupIds(objects, groups, selectedIds, enteredGroupId);
          if (groupIds.length > 0) commit(objectUngroupCommitted({ groupIds }));
          return;
        }
        const units = groupingUnits(objects, groups, selectedIds, enteredGroupId);
        if (units === null) return;
        commit(
          objectGroupCommitted({
            pageIndex,
            groupId: createGroupId(),
            // A group formed inside an entered group belongs to it.
            ...(enteredGroupId === null ? {} : { parentGroupId: enteredGroupId }),
            ...units,
          }),
        );
        return;
      }
      if (e.key === "Escape") {
        const session = sessionRef.current;
        if (session) {
          sessionRef.current = null;
          session.cancel();
          // Suppress the trailing click so a cancelled zoom-area click can't fire.
          argsRef.current.suppressClickRef.current = true;
          setActive(false);
          setPreview(null);
          setHandleCursor(null);
          return;
        }
        const { activeTool, penAnchors } = argsRef.current;
        if (activeTool === "pen" && penAnchors.length > 0) commit(gestureCancelled());
        return;
      }
      if (e.key === "Enter") {
        const { activeTool, penAnchors, pageIndex, toolOptions } = argsRef.current;
        if (activeTool !== "pen" || sessionRef.current !== null) return;
        if (penAnchors.length === 0 || isTextEntryTarget(e.target)) return;
        e.preventDefault();
        const action = finishPenDraft(
          penAnchors,
          pageIndex,
          optionBoolean(toolOptions, "pen", "autoClose", false),
          drawStyleFromOptions(toolOptions, "pen"),
          createObjectId,
        );
        if (action !== null) commit(action);
        return;
      }
      const delta = ARROW_DELTAS[e.key];
      if (delta === undefined) return;
      const { activeTool, selectedIds, pageIndex, toolOptions } = argsRef.current;
      if (activeTool !== "select" || sessionRef.current !== null) return;
      if (selectedIds.length === 0 || isTextEntryTarget(e.target)) return;
      e.preventDefault();
      const nudge = optionNumber(toolOptions, "select", "nudgeIncrement", 0.1);
      commit(
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
  }, [commit]);

  // Switching away from the pen mid-draft discards it (there is no way to
  // resume a draft under another tool, and stale drafts would ghost-render).
  const prevToolRef = useRef(args.activeTool);
  useEffect(() => {
    const prev = prevToolRef.current;
    prevToolRef.current = args.activeTool;
    if (prev === "pen" && args.activeTool !== "pen" && argsRef.current.penAnchors.length > 0) {
      commit(gestureCancelled());
    }
  }, [args.activeTool, commit]);

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const { activeTool, penAnchors, pageIndex, toolOptions } = argsRef.current;
    if (activeTool === "select") {
      // select.double-click-group.enters-group: descend one level into the
      // group under the pointer and select what sits at that level. The
      // double-click's own clicks already selected the group (or the level
      // above), so this is purely the descent.
      if (args.panning || sessionRef.current) return;
      const top = selectHits(toDoc(e), args.viewport.zoom)[0];
      if (top === undefined) return;
      const entered = enteredGroup(args.objects, args.groups, top.id, args.enteredGroupId);
      if (entered !== null) commit(selectionGroupEnteredCommitted(entered));
      return;
    }
    if (activeTool !== "pen" || penAnchors.length === 0) return;
    // The double-click's own second click just added a duplicate anchor at
    // the same point — the finish builds from the draft without it, and the
    // single pen/drawCommitted (or discard) clears the whole draft.
    const action = finishPenDraft(
      penAnchors.slice(0, -1),
      pageIndex,
      optionBoolean(toolOptions, "pen", "autoClose", false),
      drawStyleFromOptions(toolOptions, "pen"),
      createObjectId,
    );
    if (action !== null) commit(action);
  };

  return {
    preview,
    active,
    handleCursor,
    beginShapeAdjust,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    onDoubleClick,
    beginResize,
    beginRotate,
  };
}
