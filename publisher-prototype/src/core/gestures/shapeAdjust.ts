import {
  clampBannerHeight,
  clampBannerInset,
  clampCalloutTip,
  clampCornerRadius,
} from "../geometry/shapePaths";
import { framePivot, rotatePoint } from "../hittest";
import type { NormalizedPoint } from "../model";
import {
  bannerPanelHeightCommitted,
  bannerPanelInsetCommitted,
  calloutTailCommitted,
  roundedRectCornerRadiusCommitted,
  starPolygonInnerRadiusCommitted,
  type FrameBox,
} from "../store/documentActions";
import { beginDrag, cancelResult, updateDrag, type DragState } from "./drag";
import type { GestureContext, GestureMachine, GesturePoint } from "./types";

/**
 * Adjust-handle machines — the registry's per-shape adjust clauses
 * (src/core/registry/tools/shapes.ts):
 *   rounded-rect.drag-adjust-handle.sets-corner-radius
 *   star-polygon.drag-adjust-handle.sets-inner-radius
 *   callout.drag-tail-handle.repositions-tail
 *
 * Each drags one parameter of one placed shape, previews it live, and commits
 * once on release. The pointer rotates into the shape's own frame space
 * first, so every handle tracks the rotated shape rather than the page.
 *
 * Continuous parameters apply TRAVEL rather than absolute position, so the
 * value never jumps to meet the pointer however the handle happens to be
 * drawn. The callout's tail is an enum of four corners, so it takes the
 * pointer's quadrant outright — there is no travel to accumulate.
 */

export type ShapeAdjustContext = GestureContext & {
  /** The shape being adjusted — one object; adjust handles show for a lone
      shape of the matching kind only. */
  id: string;
  /** Its frame, unrotated, and the rotation the handle rides. */
  frame: FrameBox;
  rotation: number;
};

export type CornerRadiusContext = ShapeAdjustContext & {
  /** The stored radius at press, in inches. */
  initialRadius: number;
};

export type StarInnerRadiusContext = ShapeAdjustContext & {
  /** The stored ratio at press, and the vertex count that fixes which arm
      the handle rides. */
  initialRatio: number;
  points: number;
};

export type CalloutTailContext = ShapeAdjustContext;

export type ShapeAdjustState<C extends ShapeAdjustContext> = DragState<C>;

/** The pointer in the shape's own frame space, where the top edge runs
    along +x and the frame box is axis-aligned. */
function toFrameSpace(ctx: ShapeAdjustContext, point: GesturePoint): GesturePoint {
  if (ctx.rotation === 0) return point;
  return rotatePoint(point, framePivot(ctx.frame), -ctx.rotation);
}

/** Frame space → the unit box the shape builders speak, so a parameter
    expressed as a fraction of the shape means the same at any frame size. */
function toUnitBox(ctx: ShapeAdjustContext, point: GesturePoint): GesturePoint {
  const local = toFrameSpace(ctx, point);
  const { x, y, w, h } = ctx.frame;
  return { x: w > 0 ? (local.x - x) / w : 0.5, y: h > 0 ? (local.y - y) / h : 0.5 };
}

// ── rounded rect: the radius the top edge's handle travels out ──────────────

function radiusOf(state: ShapeAdjustState<CornerRadiusContext>): number {
  const { ctx } = state;
  const travel = toFrameSpace(ctx, state.current).x - toFrameSpace(ctx, state.start).x;
  return clampCornerRadius(ctx.initialRadius + travel, ctx.frame.w, ctx.frame.h);
}

export const cornerRadiusMachine: GestureMachine<
  ShapeAdjustState<CornerRadiusContext>,
  CornerRadiusContext
> = {
  begin: (point, ctx) => beginDrag(point, ctx),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  end(state) {
    if (!state.dragged) return { action: null };
    return {
      action: roundedRectCornerRadiusCommitted({
        pageIndex: state.ctx.pageIndex,
        ids: [state.ctx.id],
        radius: radiusOf(state),
      }),
    };
  },
  cancel: cancelResult,
  preview: (state) => ({ kind: "shape-param", params: { cornerRadius: radiusOf(state) } }),
};

// ── star: how deep the points cut, along the first inner arm ────────────────

/** starPath's clamp, so the handle can never set a ratio the builder would
    silently refuse. */
const MIN_RATIO = 0.05;
const MAX_RATIO = 0.95;

/** The direction of the arm the inner-radius handle rides: starPath's first
    INNER vertex, one half-step clockwise from the top point. */
export function starInnerArmDirection(points: number): GesturePoint {
  const n = Math.max(3, Math.floor(points));
  const a = ((-90 + 180 / n) * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** The inner vertex's position in the unit box, at a given ratio. */
export function starInnerArmPoint(points: number, ratio: number): GesturePoint {
  const u = starInnerArmDirection(points);
  return { x: 0.5 + 0.5 * ratio * u.x, y: 0.5 + 0.5 * ratio * u.y };
}

/** How far along the arm a point sits, as a fraction of the outer radius. */
function armProjection(ctx: StarInnerRadiusContext, point: GesturePoint): number {
  const u = starInnerArmDirection(ctx.points);
  const p = toUnitBox(ctx, point);
  return ((p.x - 0.5) * u.x + (p.y - 0.5) * u.y) / 0.5;
}

function ratioOf(state: ShapeAdjustState<StarInnerRadiusContext>): number {
  const { ctx } = state;
  const travel = armProjection(ctx, state.current) - armProjection(ctx, state.start);
  return Math.min(Math.max(ctx.initialRatio + travel, MIN_RATIO), MAX_RATIO);
}

export const starInnerRadiusMachine: GestureMachine<
  ShapeAdjustState<StarInnerRadiusContext>,
  StarInnerRadiusContext
> = {
  begin: (point, ctx) => beginDrag(point, ctx),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  end(state) {
    if (!state.dragged) return { action: null };
    return {
      action: starPolygonInnerRadiusCommitted({
        pageIndex: state.ctx.pageIndex,
        ids: [state.ctx.id],
        innerRadiusRatio: ratioOf(state),
      }),
    };
  },
  cancel: cancelResult,
  preview: (state) => ({ kind: "shape-param", params: { innerRadiusRatio: ratioOf(state) } }),
};

// ── callout: where the tail's tip points ───────────────────────────────────

/** The tip the handle is placing: the pointer, in the shape's unit box,
    bounded so the tail cannot be flung off the page. Both the tail's LENGTH
    and its ANGLE fall out of this one point — there is no separate control
    for either, which is what makes the handle behave like PowerPoint's. */
function tipOf(state: ShapeAdjustState<CalloutTailContext>): NormalizedPoint {
  return clampCalloutTip(toUnitBox(state.ctx, state.current));
}

export const calloutTailMachine: GestureMachine<
  ShapeAdjustState<CalloutTailContext>,
  CalloutTailContext
> = {
  begin: (point, ctx) => beginDrag(point, ctx),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  end(state) {
    if (!state.dragged) return { action: null };
    return {
      action: calloutTailCommitted({
        pageIndex: state.ctx.pageIndex,
        ids: [state.ctx.id],
        tailTip: tipOf(state),
      }),
    };
  },
  cancel: cancelResult,
  preview: (state) => ({ kind: "shape-param", params: { tailTip: tipOf(state) } }),
};

// ── banner: the ribbon's two adjustments ───────────────────────────────────

export type BannerAdjustContext = ShapeAdjustContext;

/**
 * The banner is the one kind with TWO handles, so it gets two machines rather
 * than one carrying a mode: each is its own gesture, its own commit and its
 * own history entry, exactly as the star's two parameters are.
 *
 * Both read an absolute position in the shape's unit box rather than travel,
 * because both handles sit ON the value they set: the inset handle takes its
 * x from the panel's left edge, the height handle its y from the panel's
 * bottom edge.
 */
export const bannerPanelInsetMachine: GestureMachine<
  ShapeAdjustState<BannerAdjustContext>,
  BannerAdjustContext
> = {
  begin: (point, ctx) => beginDrag(point, ctx),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  end(state) {
    if (!state.dragged) return { action: null };
    return {
      action: bannerPanelInsetCommitted({
        pageIndex: state.ctx.pageIndex,
        ids: [state.ctx.id],
        panelInset: bannerInsetOf(state),
      }),
    };
  },
  cancel: cancelResult,
  preview: (state) => ({ kind: "shape-param", params: { panelInset: bannerInsetOf(state) } }),
};

function bannerInsetOf(state: ShapeAdjustState<BannerAdjustContext>): number {
  return clampBannerInset(toUnitBox(state.ctx, state.current).x);
}

function bannerHeightOf(state: ShapeAdjustState<BannerAdjustContext>): number {
  return clampBannerHeight(toUnitBox(state.ctx, state.current).y);
}

export const bannerPanelHeightMachine: GestureMachine<
  ShapeAdjustState<BannerAdjustContext>,
  BannerAdjustContext
> = {
  begin: (point, ctx) => beginDrag(point, ctx),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  end(state) {
    if (!state.dragged) return { action: null };
    return {
      action: bannerPanelHeightCommitted({
        pageIndex: state.ctx.pageIndex,
        ids: [state.ctx.id],
        panelHeight: bannerHeightOf(state),
      }),
    };
  },
  cancel: cancelResult,
  preview: (state) => ({ kind: "shape-param", params: { panelHeight: bannerHeightOf(state) } }),
};
