import { createAction, type UnknownAction } from "@reduxjs/toolkit";
import type {
  ArrowHead,
  ArrowHeadSize,
  FlowchartSymbol,
  Group,
  LayoutObject,
  LineDash,
  NormalizedPoint,
  Paint,
} from "../model";

/**
 * Tool commit actions on the document (PLAN.md §6.3). These are cross-tool
 * vocabulary — the registry's gesture clauses name them, several tools share
 * them — so they live here as createAction creators rather than inside the
 * document slice, whose extraReducers handle them. Action types ARE the
 * registry's gesture-clause action strings (viewportSlice discipline): the
 * contract, the action, and the test share one string.
 *
 * Payloads are complete and geometry is canonical inches: the caller (the
 * gesture pipeline) constructs finished objects — ids included — and final
 * boxes/deltas, so reducers stay deterministic with no id generation and no
 * geometry math beyond application.
 */

/** rect/ellipse/line draw commits: the finished object, appended to the
    page's objects (z-order is array order — appended = topmost). */
export type DrawCommit = {
  pageIndex: number;
  object: LayoutObject;
};

/** move/nudge commits: translate the identified objects by (dx, dy) inches.
    Lines move by both endpoints. */
export type TranslateCommit = {
  pageIndex: number;
  ids: string[];
  dx: number;
  dy: number;
};

export type FrameBox = { x: number; y: number; w: number; h: number };
export type LineEndpoints = { x1: number; y1: number; x2: number; y2: number };

/** resize commits: absolute final geometry per object — frame objects get
    boxes, lines get endpoints; the reducer applies whichever matches the
    object and ignores a mismatched entry. */
export type ResizeCommit = {
  pageIndex: number;
  boxes: Record<string, FrameBox | LineEndpoints>;
};

/**
 * rotate commits: absolute rotations in degrees per object id, plus the
 * absolute geometry the rotation ORBITS each object onto — same shape a
 * resize commits. A selection turns as a rigid body about one pivot, so its
 * members' positions move as well as their angles; `boxes` is what carries
 * that. It is omitted where nothing orbits (the Transform panel's angle
 * field turns one object about its own centre).
 *
 * Lines carry no rotation field and take no entry in `rotations`; their
 * endpoints orbit through `boxes` like any other member's geometry.
 */
export type RotateCommit = {
  pageIndex: number;
  rotations: Record<string, number>;
  boxes?: Record<string, FrameBox | LineEndpoints>;
  /** Absolute angles per GROUP id. A group stores the angle its frame is
      drawn at, so turning one advances that too — otherwise the frame would
      spring back square the moment the gesture ended. */
  groupRotations?: Record<string, number>;
};

/** fill commits: replace the identified objects' fill wholesale — a Paint or
    null (hollow). Lines carry no fill and are skipped by the reducer. */
export type FillCommit = {
  pageIndex: number;
  ids: string[];
  fill: Paint | null;
};

/** stroke-paint commits: set the identified objects' stroke color, keeping
    each object's own width — or remove the stroke entirely (null). A frame
    with no stroke gains one at the draw tools' default 1pt width; a line's
    stroke is required by schema, so the reducer ignores null for lines
    rather than producing an invisible, unparseable object. */
export type StrokePaintCommit = {
  pageIndex: number;
  ids: string[];
  paint: Paint | null;
};

/** stroke-width commits: set the width (points) of every identified object
    that HAS a stroke; a stroke-less frame is left alone — there is nothing
    to thicken, and inventing a paint here would hide a real edit. */
export type StrokeWidthCommit = {
  pageIndex: number;
  ids: string[];
  width: number;
};

/** corner-radius commits: set the identified rounded rectangles' radius in
    inches. Every other shape kind is left alone — it has no corner to round
    — and the value stores unclamped, per the ShapeObjectSchema note. */
export type CornerRadiusCommit = {
  pageIndex: number;
  ids: string[];
  radius: number;
};

/** star/polygon commits: the two parameters that shape it. Split because
    the registry gives the inner radius its own adjust-handle clause and the
    vertex count none — one is a gesture type, the other a panel commit. */
export type StarPointsCommit = { pageIndex: number; ids: string[]; points: number };
export type StarInnerRadiusCommit = {
  pageIndex: number;
  ids: string[];
  innerRadiusRatio: number;
};

/** callout tail commits: where the pointer's TIP goes, in the frame's unit
    box — the tail's length and angle both follow from it. */
export type CalloutTailCommit = {
  pageIndex: number;
  ids: string[];
  tailTip: NormalizedPoint;
};

/** banner commits: the two ribbon adjustments, each its own commit so each
    handle is its own gesture and its own history entry. */
export type BannerPanelInsetCommit = { pageIndex: number; ids: string[]; panelInset: number };
export type BannerPanelHeightCommit = { pageIndex: number; ids: string[]; panelHeight: number };

export type FlowchartSymbolCommit = {
  pageIndex: number;
  ids: string[];
  symbol: FlowchartSymbol;
};

/** line/arrow outline style: the dash pattern, and the end decorations. An
    omitted head field is left as it stands; "none"/"m" store as absence per
    the schema's additive rule. */
export type LineDashCommit = { pageIndex: number; ids: string[]; dash: LineDash };
export type ArrowHeadsCommit = {
  pageIndex: number;
  ids: string[];
  headStart?: ArrowHead;
  headEnd?: ArrowHead;
  headSize?: ArrowHeadSize;
};

/** path close/open: the placed counterpart of the pen's autoClose option —
    appends or drops the ring-closing Z on a path shape. */
export type PathClosedCommit = { pageIndex: number; ids: string[]; closed: boolean };

/**
 * delete commits: remove the identified objects from the page. Locked objects
 * are skipped like everywhere else — a lock is exactly the protection that
 * should stop this. Any group left holding nothing is dropped with them, so
 * deleting a whole group takes the group itself out rather than leaving an
 * empty one to round-trip.
 */
export type DeleteCommit = { pageIndex: number; ids: string[] };

/**
 * group commits (§5.1): the new group's id — minted by the caller, like every
 * other id in this file — plus the two halves it combines. `ids` are objects
 * joining it directly; `groupIds` are existing groups becoming its CHILDREN,
 * which is how grouping a group nests rather than flattens it. Absent
 * `parentGroupId` means the page's top level; present, it is the group
 * context the new group is created inside.
 *
 * Grouping also RESTACKS: the members move to sit contiguously at the
 * topmost member's z position, so nothing can render between two members of
 * one group.
 */
export type GroupCommit = {
  pageIndex: number;
  groupId: string;
  parentGroupId?: string;
  ids: string[];
  groupIds: string[];
};

/**
 * ungroup commits (§5.1): remove exactly one nesting level per named group —
 * its objects and child groups re-join its parent, or the page when it has
 * none. No pageIndex, unlike every other commit here: `doc.groups` is
 * document-root state, so a removed group must not leave a dangling `groupId`
 * behind on some other page.
 */
export type UngroupCommit = { groupIds: string[] };

/**
 * duplicate commits (Alt-drag): the finished COPIES, ids and final geometry
 * included, appended to the page in the order given — the same
 * complete-payload rule the draw commits follow. `groups` are the fresh
 * groups those copies join, mirroring the originals' nesting, so a copy of a
 * group is itself a group rather than a scattering of loose objects.
 */
export type DuplicateCommit = {
  pageIndex: number;
  objects: LayoutObject[];
  groups: Group[];
};

/** lock commits: set the identified objects' locked flag. The one translate-
    family action that must NOT skip locked objects — unlocking is its point. */
export type LockCommit = {
  pageIndex: number;
  ids: string[];
  locked: boolean;
};

export const rectDrawCommitted = createAction<DrawCommit>("rect/drawCommitted");
export const ellipseDrawCommitted = createAction<DrawCommit>("ellipse/drawCommitted");
export const lineDrawCommitted = createAction<DrawCommit>("line/drawCommitted");
export const arrowDrawCommitted = createAction<DrawCommit>("arrow/drawCommitted");
export const roundedRectDrawCommitted = createAction<DrawCommit>("roundedRect/drawCommitted");
export const starPolygonDrawCommitted = createAction<DrawCommit>("starPolygon/drawCommitted");
export const calloutDrawCommitted = createAction<DrawCommit>("callout/drawCommitted");
export const bannerDrawCommitted = createAction<DrawCommit>("banner/drawCommitted");
export const flowchartDrawCommitted = createAction<DrawCommit>("flowchart/drawCommitted");
export const penDrawCommitted = createAction<DrawCommit>("pen/drawCommitted");
export const objectMoveCommitted = createAction<TranslateCommit>("object/moveCommitted");
export const objectNudgeCommitted = createAction<TranslateCommit>("object/nudgeCommitted");
export const objectResizeCommitted = createAction<ResizeCommit>("object/resizeCommitted");
export const objectRotateCommitted = createAction<RotateCommit>("object/rotateCommitted");
export const objectFillCommitted = createAction<FillCommit>("object/fillCommitted");
export const objectStrokePaintCommitted = createAction<StrokePaintCommit>(
  "object/strokePaintCommitted",
);
export const objectStrokeWidthCommitted = createAction<StrokeWidthCommit>(
  "object/strokeWidthCommitted",
);
export const objectLockCommitted = createAction<LockCommit>("object/lockCommitted");
export const objectDeleteCommitted = createAction<DeleteCommit>("object/deleteCommitted");
export const objectDuplicateCommitted = createAction<DuplicateCommit>("object/duplicateCommitted");
export const objectGroupCommitted = createAction<GroupCommit>("object/groupCommitted");
export const objectUngroupCommitted = createAction<UngroupCommit>("object/ungroupCommitted");
export const roundedRectCornerRadiusCommitted = createAction<CornerRadiusCommit>(
  "roundedRect/cornerRadiusCommitted",
);
export const starPolygonPointsCommitted = createAction<StarPointsCommit>(
  "starPolygon/pointsCommitted",
);
export const starPolygonInnerRadiusCommitted = createAction<StarInnerRadiusCommit>(
  "starPolygon/innerRadiusCommitted",
);
export const calloutTailCommitted = createAction<CalloutTailCommit>("callout/tailCommitted");
export const bannerPanelInsetCommitted = createAction<BannerPanelInsetCommit>(
  "banner/panelInsetCommitted",
);
export const bannerPanelHeightCommitted = createAction<BannerPanelHeightCommit>(
  "banner/panelHeightCommitted",
);
export const flowchartSymbolCommitted = createAction<FlowchartSymbolCommit>(
  "flowchart/symbolCommitted",
);
export const objectLineDashCommitted = createAction<LineDashCommit>("object/lineDashCommitted");
export const objectArrowHeadsCommitted = createAction<ArrowHeadsCommit>(
  "object/arrowHeadsCommitted",
);
export const objectPathClosedCommitted = createAction<PathClosedCommit>(
  "object/pathClosedCommitted",
);

/**
 * Every action that puts a NEW object on the page. Draw tools all commit the
 * same DrawCommit payload, so this is the one list the selection slice and
 * the history set both read rather than each keeping their own.
 */
export const DRAW_COMMIT_ACTIONS = [
  rectDrawCommitted,
  ellipseDrawCommitted,
  lineDrawCommitted,
  arrowDrawCommitted,
  roundedRectDrawCommitted,
  starPolygonDrawCommitted,
  calloutDrawCommitted,
  bannerDrawCommitted,
  flowchartDrawCommitted,
  penDrawCommitted,
] as const;

const DRAW_COMMIT_TYPES: ReadonlySet<string> = new Set(
  DRAW_COMMIT_ACTIONS.map((creator) => creator.type),
);

/** Whether an action just drew an object — the pen's per-anchor commits are
    deliberately NOT draws; only the finish that produces the shape is. */
export function isDrawCommit(action: UnknownAction): action is UnknownAction & {
  payload: DrawCommit;
} {
  return DRAW_COMMIT_TYPES.has(action.type);
}

/** The gesture pipeline's DevTools record for an aborted gesture (Esc during
    drag, discarded pen path). No DOCUMENT reducer handles it — an aborted
    gesture never changes the document — but the pen draft (app state,
    penSlice) clears on it: pen.esc.discards-path binds to this action, and a
    non-empty draft IS state to discard. */
export const gestureCancelled = createAction("gesture/cancelled");
