import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { createEmptyDocument, type LayoutDocument, type LayoutObject } from "../model";
import {
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
  rectDrawCommitted,
  roundedRectDrawCommitted,
  starPolygonDrawCommitted,
  type DrawCommit,
  type FillCommit,
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

function applyResize(state: LayoutDocument, action: PayloadAction<ResizeCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  for (const obj of page.objects) {
    if (obj.locked) continue;
    const box = action.payload.boxes[obj.id];
    if (!box) continue;
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
}

function applyRotate(state: LayoutDocument, action: PayloadAction<RotateCommit>): void {
  const page = state.pages[action.payload.pageIndex];
  if (!page) return;
  for (const obj of page.objects) {
    if (obj.locked || obj.type === "line") continue;
    const rotation = action.payload.rotations[obj.id];
    if (rotation === undefined) continue;
    obj.rotation = rotation;
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
      .addCase(roundedRectDrawCommitted, applyDraw)
      .addCase(starPolygonDrawCommitted, applyDraw)
      .addCase(calloutDrawCommitted, applyDraw)
      .addCase(bannerDrawCommitted, applyDraw)
      .addCase(flowchartDrawCommitted, applyDraw)
      .addCase(objectMoveCommitted, applyTranslate)
      .addCase(objectNudgeCommitted, applyTranslate)
      .addCase(objectResizeCommitted, applyResize)
      .addCase(objectRotateCommitted, applyRotate)
      .addCase(objectFillCommitted, applyFill)
      .addCase(objectStrokePaintCommitted, applyStrokePaint)
      .addCase(objectStrokeWidthCommitted, applyStrokeWidth)
      .addCase(objectLockCommitted, applyLock);
  },
});

export const {
  loadedCommitted: documentLoadedCommitted,
  stressFixtureLoaded,
  stressFixtureCleared,
} = documentSlice.actions;
