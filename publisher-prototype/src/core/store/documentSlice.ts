import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  createEmptyDocument,
  groupAncestry,
  isInGroup,
  type LayoutDocument,
  type LayoutObject,
  type LayoutPage,
  type ShapeObject,
} from "../model";
import {
  arrowDrawCommitted,
  bannerDrawCommitted,
  calloutDrawCommitted,
  ellipseDrawCommitted,
  flowchartDrawCommitted,
  lineDrawCommitted,
  objectDeleteCommitted,
  objectDuplicateCommitted,
  objectFillCommitted,
  objectGroupCommitted,
  objectLockCommitted,
  objectMoveCommitted,
  objectNudgeCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  objectStrokePaintCommitted,
  objectStrokeWidthCommitted,
  objectUngroupCommitted,
  penDrawCommitted,
  rectDrawCommitted,
  calloutTailCommitted,
  flowchartSymbolCommitted,
  objectArrowHeadsCommitted,
  objectLineDashCommitted,
  objectPathClosedCommitted,
  roundedRectCornerRadiusCommitted,
  roundedRectDrawCommitted,
  starPolygonDrawCommitted,
  starPolygonInnerRadiusCommitted,
  starPolygonPointsCommitted,
  type ArrowHeadsCommit,
  type CalloutTailCommit,
  type CornerRadiusCommit,
  type DeleteCommit,
  type DrawCommit,
  type DuplicateCommit,
  type FlowchartSymbolCommit,
  type LineDashCommit,
  type PathClosedCommit,
  type StarInnerRadiusCommit,
  type StarPointsCommit,
  type FillCommit,
  type FrameBox,
  type GroupCommit,
  type LineEndpoints,
  type LockCommit,
  type ResizeCommit,
  type RotateCommit,
  type StrokePaintCommit,
  type StrokeWidthCommit,
  type TranslateCommit,
  type UngroupCommit,
} from "./documentActions";

/**
 * Document slice (PLAN.md §6.3): state IS the schema-v3 LayoutDocument —
 * no store-shaped wrapper, so the JSON round-trip (core/model/parse.ts) and
 * the reducers speak the same shape.
 *
 * Own reducers are the non-undoable doors: JSON import / fixture load and
 * the §6.2 debug stress fixture. Both reset history (core/store/history.ts)
 * rather than entering it. Tool commits arrive via extraReducers from the
 * cross-tool creators in documentActions.ts.
 *
 * Locked objects are skipped by move/resize/rotate/nudge defensively; the
 * registry's hitTest contracts (lockedObjects: "skips") mean upstream
 * hit-testing should already exclude them, and unknown ids are ignored the
 * same way — a stale commit degrades to a partial or empty application, not
 * an error.
 */

function applyDraw(state: LayoutDocument, action: PayloadAction<DrawCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  page.objects.push(action.payload.object);
}

function applyTranslate(state: LayoutDocument, action: PayloadAction<TranslateCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  const ids = new Set(action.payload.ids);
  const { dx, dy } = action.payload;
  for (const obj of page.objects) {
    if (!ids.has(obj.id) || obj.locked) continue;
    if (obj.type === "line") {
      obj.x1 += dx;
      obj.y1 += dy;
      obj.x2 += dx;
      obj.y2 += dy;
    } else {
      obj.x += dx;
      obj.y += dy;
    }
  }
}

/** Absolute geometry onto one object — frames take boxes, lines take
    endpoints, and a mismatched entry is ignored. Shared by every commit that
    states final geometry (resize, and rotation's orbit). */
function applyGeometry(obj: LayoutObject, box: FrameBox | LineEndpoints): void {
  if (obj.type === "line") {
    if ("x1" in box) {
      obj.x1 = box.x1;
      obj.y1 = box.y1;
      obj.x2 = box.x2;
      obj.y2 = box.y2;
    }
  } else if ("w" in box) {
    obj.x = box.x;
    obj.y = box.y;
    obj.w = box.w;
    obj.h = box.h;
  }
}

function applyResize(state: LayoutDocument, action: PayloadAction<ResizeCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  for (const obj of page.objects) {
    if (obj.locked) continue;
    const box = action.payload.boxes[obj.id];
    if (box) applyGeometry(obj, box);
  }
}

function applyRotate(state: LayoutDocument, action: PayloadAction<RotateCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  const { rotations, boxes, groupRotations } = action.payload;
  for (const [groupId, rotation] of Object.entries(groupRotations ?? {})) {
    const group = state.groups.find((g) => g.id === groupId);
    if (group === undefined) continue;
    // Square stores as absence, per the additive rule.
    if (rotation === 0) delete group.rotation;
    else group.rotation = rotation;
  }
  for (const obj of page.objects) {
    if (obj.locked) continue;
    // The two halves are independent: a line has no rotation to set but its
    // endpoints still orbit, and a lone frame turns in place with no box.
    const rotation = rotations[obj.id];
    if (rotation !== undefined && obj.type !== "line") obj.rotation = rotation;
    const box = boxes?.[obj.id];
    if (box) applyGeometry(obj, box);
  }
}

function applyFill(state: LayoutDocument, action: PayloadAction<FillCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  const ids = new Set(action.payload.ids);
  for (const obj of page.objects) {
    if (!ids.has(obj.id) || obj.locked || obj.type === "line") continue;
    obj.fill = action.payload.fill;
  }
}

/** The draw tools' contract default — the width a stroke-less frame gains
    when a stroke paint is applied to it. */
const DEFAULT_STROKE_WIDTH_PT = 1;

function applyStrokePaint(state: LayoutDocument, action: PayloadAction<StrokePaintCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  const ids = new Set(action.payload.ids);
  const { paint } = action.payload;
  for (const obj of page.objects) {
    if (!ids.has(obj.id) || obj.locked) continue;
    if (paint === null) {
      if (obj.type !== "line") obj.stroke = null;
    } else if (obj.stroke !== null) {
      obj.stroke.paint = paint;
    } else {
      obj.stroke = { paint, width: DEFAULT_STROKE_WIDTH_PT };
    }
  }
}

function applyStrokeWidth(state: LayoutDocument, action: PayloadAction<StrokeWidthCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  const ids = new Set(action.payload.ids);
  for (const obj of page.objects) {
    if (!ids.has(obj.id) || obj.locked || obj.stroke === null) continue;
    obj.stroke.width = action.payload.width;
  }
}

/** Corner radius applies only where there is a corner to round: a rounded
    rect. The value stores as given — the geometric bound is applied where the
    shape is drawn and hit-tested, so a frame grown back keeps its radius. */
function applyCornerRadius(
  state: LayoutDocument,
  action: PayloadAction<CornerRadiusCommit>,
): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  const ids = new Set(action.payload.ids);
  for (const obj of page.objects) {
    if (!ids.has(obj.id) || obj.locked) continue;
    if (obj.type !== "shape" || obj.shape !== "roundedRect") continue;
    obj.cornerRadius = Math.max(action.payload.radius, 0);
  }
}

/** Each parametric shape edit reaches only the kind that owns the parameter
    — every other kind has nothing to set — and skips locked objects. */
function shapeParamApplier<P extends { pageIndex: number; ids: string[] }>(
  kind: ShapeObject["shape"],
  set: (obj: ShapeObject, payload: P) => void,
) {
  return (state: LayoutDocument, action: PayloadAction<P>): void => {
    const page = state.pages[action.payload.pageIndex];
    if (!page) return;
    const ids = new Set(action.payload.ids);
    for (const obj of page.objects) {
      if (!ids.has(obj.id) || obj.locked) continue;
      if (obj.type !== "shape" || obj.shape !== kind) continue;
      set(obj, action.payload);
    }
  };
}

const applyStarPoints = shapeParamApplier<StarPointsCommit>("starPolygon", (obj, p) => {
  obj.points = Math.max(3, Math.round(p.points));
});

const applyStarInnerRadius = shapeParamApplier<StarInnerRadiusCommit>("starPolygon", (obj, p) => {
  obj.innerRadiusRatio = Math.min(Math.max(p.innerRadiusRatio, 0), 1);
});

const applyCalloutTail = shapeParamApplier<CalloutTailCommit>("callout", (obj, p) => {
  obj.tailTip = p.tailTip;
});

const applyFlowchartSymbol = shapeParamApplier<FlowchartSymbolCommit>("flowchart", (obj, p) => {
  obj.symbol = p.symbol;
});

/** Dash reaches lines and arrows — the objects a dash pattern describes.
    "solid" is the absent default, per the schema's additive rule. */
function applyLineDash(state: LayoutDocument, action: PayloadAction<LineDashCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  const ids = new Set(action.payload.ids);
  for (const obj of page.objects) {
    if (!ids.has(obj.id) || obj.locked || obj.type !== "line") continue;
    if (action.payload.dash === "solid") delete obj.dash;
    else obj.dash = action.payload.dash;
  }
}

/** Line-end decorations. An omitted field leaves that end as it stands;
    "none" heads and the "m" size store as absence (the additive rule). */
function applyArrowHeads(state: LayoutDocument, action: PayloadAction<ArrowHeadsCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  const { ids: idList, headStart, headEnd, headSize } = action.payload;
  const ids = new Set(idList);
  for (const obj of page.objects) {
    if (!ids.has(obj.id) || obj.locked || obj.type !== "line") continue;
    if (headStart !== undefined) {
      if (headStart === "none") delete obj.headStart;
      else obj.headStart = headStart;
    }
    if (headEnd !== undefined) {
      if (headEnd === "none") delete obj.headEnd;
      else obj.headEnd = headEnd;
    }
    if (headSize !== undefined) {
      if (headSize === "m") delete obj.headSize;
      else obj.headSize = headSize;
    }
  }
}

/** Close or open a path shape: the placed counterpart of the pen's autoClose
    option. Closing appends the ring-closing Z, opening drops it; a path that
    is already in the requested state is left untouched. */
function applyPathClosed(state: LayoutDocument, action: PayloadAction<PathClosedCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  const ids = new Set(action.payload.ids);
  for (const obj of page.objects) {
    if (!ids.has(obj.id) || obj.locked) continue;
    if (obj.type !== "shape" || obj.shape !== "path" || obj.d === undefined) continue;
    const closed = obj.d[obj.d.length - 1]?.c === "Z";
    if (action.payload.closed === closed) continue;
    // A path shape's `d` must stay non-empty (the schema refine), so opening
    // a bare "M … Z" that would empty out is refused rather than invalidated.
    if (action.payload.closed) obj.d.push({ c: "Z" });
    else if (obj.d.length > 1) obj.d.pop();
  }
}

function applyLock(state: LayoutDocument, action: PayloadAction<LockCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  const ids = new Set(action.payload.ids);
  for (const obj of page.objects) {
    if (ids.has(obj.id)) obj.locked = action.payload.locked;
  }
}

/**
 * Members sit contiguously at the topmost member's z position: the block ends
 * exactly where the frontmost member stood, and both the members and the
 * objects left behind keep their own relative order. Without this a
 * non-member drawn between two members would render inside the group forever,
 * so the group would transform as a unit but never read as one.
 */
function restackTogether(page: LayoutPage, memberIds: ReadonlySet<string>): void {
  const isMember = (obj: LayoutObject) => memberIds.has(obj.id);
  const top = page.objects.reduce((at, obj, i) => (isMember(obj) ? i : at), -1);
  if (top === -1) return;
  const members = page.objects.filter(isMember);
  const rest = page.objects.filter((obj) => !isMember(obj));
  // Where the block lands: after every non-member that was below the topmost
  // member, which is what keeps the group at that member's depth.
  const below = page.objects.slice(0, top + 1).filter((obj) => !isMember(obj)).length;
  page.objects = [...rest.slice(0, below), ...members, ...rest.slice(below)];
}

/**
 * Groups no object sits inside any more are dropped. One pass covers nesting:
 * an object's ancestry names every group above it, so a parent stays only
 * while something deep inside it does — and a group nothing can select or
 * enter is just weight for the round-trip to carry.
 */
function pruneEmptyGroups(state: LayoutDocument): void {
  const inhabited = new Set<string>();
  for (const page of [...state.pages, ...state.masters]) {
    for (const obj of page.objects) {
      for (const id of groupAncestry(state.groups, obj.groupId)) inhabited.add(id);
    }
  }
  state.groups = state.groups.filter((g) => inhabited.has(g.id));
}

function applyDelete(state: LayoutDocument, action: PayloadAction<DeleteCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  const ids = new Set(action.payload.ids);
  page.objects = page.objects.filter((obj) => !ids.has(obj.id) || obj.locked);
  pruneEmptyGroups(state);
}

function applyDuplicate(state: LayoutDocument, action: PayloadAction<DuplicateCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  page.objects.push(...action.payload.objects);
  state.groups.push(...action.payload.groups);
}

function applyGroup(state: LayoutDocument, action: PayloadAction<GroupCommit>): void {
  const { pageIndex, groupId, parentGroupId, ids, groupIds } = action.payload;
  const page = state.pages[pageIndex];
  if (!page || state.groups.some((g) => g.id === groupId)) return;
  state.groups.push(parentGroupId === undefined ? { id: groupId } : { id: groupId, parentGroupId });
  const joining = new Set(ids);
  for (const obj of page.objects) {
    if (joining.has(obj.id)) obj.groupId = groupId;
  }
  const children = new Set(groupIds);
  for (const group of state.groups) {
    if (children.has(group.id)) group.parentGroupId = groupId;
  }
  // Membership for the restack is STRUCTURAL — a locked member is inside the
  // group even though it could never have been selected into it.
  restackTogether(
    page,
    new Set(page.objects.filter((o) => isInGroup(state.groups, o, groupId)).map((o) => o.id)),
  );
}

function applyUngroup(state: LayoutDocument, action: PayloadAction<UngroupCommit>): void {
  for (const groupId of action.payload.groupIds) {
    const group = state.groups.find((g) => g.id === groupId);
    if (group === undefined) continue;
    const { parentGroupId } = group;
    // One level only: whatever the group held re-joins its parent, or the
    // page when it had none. Stacking stays as grouping left it.
    //
    // Every page AND every master: `doc.groups` is document-root state, and a
    // master-page object carrying the removed id would be left pointing at
    // nothing. Grouping stays page-scoped — a selection is one page's — but
    // removal has to reach wherever the id got to.
    for (const page of [...state.pages, ...state.masters]) {
      for (const obj of page.objects) {
        if (obj.groupId !== groupId) continue;
        if (parentGroupId === undefined) delete obj.groupId;
        else obj.groupId = parentGroupId;
      }
    }
    for (const child of state.groups) {
      if (child.parentGroupId !== groupId) continue;
      if (parentGroupId === undefined) delete child.parentGroupId;
      else child.parentGroupId = parentGroupId;
    }
    state.groups = state.groups.filter((g) => g.id !== groupId);
  }
}

export const documentSlice = createSlice({
  name: "document",
  initialState: createEmptyDocument(),
  reducers: {
    /** JSON import / fixture load door: the payload has already passed
        through parseDocument (migrate-on-read), so it replaces wholesale. */
    loadedCommitted(_state, action: PayloadAction<LayoutDocument>) {
      return action.payload;
    },
    /** Debug bar: load the deterministic §6.2 spike-gate fixture. The
        fixture is a page-0 debug tool — it swaps the first page's objects
        and leaves document setup untouched. */
    stressFixtureLoaded(state, action: PayloadAction<LayoutObject[]>) {
      const page = state.pages[0];
      if (page) page.objects = action.payload;
    },
    /** Debug bar: back to an empty first page. */
    stressFixtureCleared(state) {
      const page = state.pages[0];
      if (page) page.objects = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(rectDrawCommitted, applyDraw)
      .addCase(ellipseDrawCommitted, applyDraw)
      .addCase(lineDrawCommitted, applyDraw)
      .addCase(arrowDrawCommitted, applyDraw)
      .addCase(roundedRectDrawCommitted, applyDraw)
      .addCase(starPolygonDrawCommitted, applyDraw)
      .addCase(calloutDrawCommitted, applyDraw)
      .addCase(bannerDrawCommitted, applyDraw)
      .addCase(flowchartDrawCommitted, applyDraw)
      .addCase(penDrawCommitted, applyDraw)
      .addCase(objectMoveCommitted, applyTranslate)
      .addCase(objectNudgeCommitted, applyTranslate)
      .addCase(objectResizeCommitted, applyResize)
      .addCase(objectRotateCommitted, applyRotate)
      .addCase(objectFillCommitted, applyFill)
      .addCase(objectStrokePaintCommitted, applyStrokePaint)
      .addCase(objectStrokeWidthCommitted, applyStrokeWidth)
      .addCase(objectLockCommitted, applyLock)
      .addCase(objectDeleteCommitted, applyDelete)
      .addCase(objectDuplicateCommitted, applyDuplicate)
      .addCase(objectGroupCommitted, applyGroup)
      .addCase(objectUngroupCommitted, applyUngroup)
      .addCase(roundedRectCornerRadiusCommitted, applyCornerRadius)
      .addCase(starPolygonPointsCommitted, applyStarPoints)
      .addCase(starPolygonInnerRadiusCommitted, applyStarInnerRadius)
      .addCase(calloutTailCommitted, applyCalloutTail)
      .addCase(flowchartSymbolCommitted, applyFlowchartSymbol)
      .addCase(objectLineDashCommitted, applyLineDash)
      .addCase(objectArrowHeadsCommitted, applyArrowHeads)
      .addCase(objectPathClosedCommitted, applyPathClosed);
  },
});

export const {
  loadedCommitted: documentLoadedCommitted,
  stressFixtureLoaded,
  stressFixtureCleared,
} = documentSlice.actions;
