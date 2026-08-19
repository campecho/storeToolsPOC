import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  createEmptyDocument,
  type LayoutDocument,
  type LayoutObject,
  type ShapeObject,
} from "../model";
import {
  arrowDrawCommitted,
  bannerDrawCommitted,
  calloutDrawCommitted,
  ellipseDrawCommitted,
  flowchartDrawCommitted,
  lineDrawCommitted,
  objectFillCommitted,
  objectLockCommitted,
  objectMoveCommitted,
  objectNudgeCommitted,
  objectResizeCommitted,
  objectRotateCommitted,
  objectStrokePaintCommitted,
  objectStrokeWidthCommitted,
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
  type DrawCommit,
  type FlowchartSymbolCommit,
  type LineDashCommit,
  type PathClosedCommit,
  type StarInnerRadiusCommit,
  type StarPointsCommit,
  type FillCommit,
  type FrameBox,
  type LineEndpoints,
  type LockCommit,
  type ResizeCommit,
  type RotateCommit,
  type StrokePaintCommit,
  type StrokeWidthCommit,
  type TranslateCommit,
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
  const { rotations, boxes } = action.payload;
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
  obj.tailAnchor = p.tailAnchor;
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
