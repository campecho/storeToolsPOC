"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { surfaceObjects, useLayoutStore } from "@/store";
import type { BBox, HandleDir } from "@/lib/layout/objects";
import type { LayoutDocument, LayoutObject, LineObject } from "@/schema";
import {
  DPI,
  clampZoom,
  effectivePageSize,
  fitZoom,
  inToPx,
  pxToIn,
  rulerTicks,
} from "@/lib/layout/geometry";
import { formatLen, type Unit } from "@/lib/layout/units";
import {
  DRAW_THRESHOLD_IN,
  angleFromCenter,
  bboxOf,
  createFrame,
  createLine,
  createTextFrame,
  resizeBBox,
  resizeRotatedBBox,
  rotatedBBox,
  snapAngle,
  translated,
} from "@/lib/layout/objects";
import { ASSET_DND_TYPE, importAssetFile } from "@/lib/assets/import";
import {
  SNAP_THRESHOLD_PX,
  snapBBox,
  snapPoint,
  snapTargets,
  type SnapLine,
  type SnapTargets,
} from "@/lib/layout/snap";
import { openPlacedPictureInPhotoEditor } from "@/lib/photo/return-trip";
import { PageSurface } from "./PageSurface";
import { ObjectNode } from "./ObjectNode";
import { SelectionOverlay } from "./SelectionOverlay";
import { TextEditOverlay } from "./TextEditOverlay";

/**
 * Rulers + pasteboard + the true-scale publication page (wire regions 5–6,
 * plan §3.5, editing per L4). The page renders at `inches × 96 × zoom`, fit
 * on mount and when page geometry changes; rulers track zoom/pan from the
 * page origin. Tools: Zoom clicks (Alt reverses), Move pans, Ctrl/Cmd+scroll
 * zooms; Rect/Ellipse/Line/Picture drag-to-draw; Select clicks, drag-moves,
 * and resizes via the selection handles. Drags write transient document
 * updates and commit one history snapshot at pointer-up (§3.3).
 *
 * Multi-page & masters (L6): the tools operate on the editing surface — the
 * master being edited (banner + Done) or the active page, whose applied
 * master renders beneath its objects as non-selectable furniture.
 *
 * Multi-select & snapping (L7): Shift-click toggles membership, an empty-board
 * drag rubber-bands a marquee, and a selected member drags the group. Move/
 * resize/draw/endpoint gestures snap to margins, page centers, column guides
 * (while the Guides toggle is on), and other objects' edges/centers — the
 * engaged targets render as brand-red smart guides and clear on release.
 *
 * Pictures (L9): a dragless click on an empty picture frame opens the device
 * file picker and fills it; an image dragged from the Assets panel highlights
 * the picture frame under the cursor and binds on drop (empty or filled).
 */

const RULER_BREADTH = 18;
const DRAW_TOOLS = new Set(["rect", "ellipse", "line", "pic", "text"]);

type Gesture =
  | { kind: "pan"; fromX: number; fromY: number; panX: number; panY: number }
  | {
      kind: "draw";
      startX: number;
      startY: number;
      targets: SnapTargets;
      thresholdIn: number;
    }
  | {
      kind: "marquee";
      pointerId: number;
      captured?: boolean;
      startX: number;
      startY: number;
      curX: number;
      curY: number;
    }
  | {
      kind: "move";
      pointerId: number;
      captured?: boolean;
      startX: number;
      startY: number;
      /** The object under the pointer — a dragless click collapses a group to it. */
      pressedId: string;
      /** The surface's full object array at gesture start — moves rebuild from it. */
      startSurface: LayoutObject[];
      movingIds: Set<string>;
      targets: SnapTargets;
      thresholdIn: number;
      before: LayoutDocument;
    }
  | {
      kind: "resize";
      id: string;
      pointerId: number;
      captured?: boolean;
      dir: HandleDir;
      startX: number;
      startY: number;
      startBBox: BBox;
      /** Frame rotation at grab — nonzero switches to local-axis resize (L10). */
      rotation: number;
      targets: SnapTargets;
      thresholdIn: number;
      before: LayoutDocument;
    }
  | {
      kind: "rotate";
      id: string;
      pointerId: number;
      captured?: boolean;
      /** Grab point (page inches) — only the capture threshold reads it. */
      startX: number;
      startY: number;
      /** Frame center, page inches — the pivot the angle is read against. */
      cx: number;
      cy: number;
      startRotation: number;
      /** Pointer angle at grab, so we rotate by the delta, not the absolute. */
      grabAngle: number;
      before: LayoutDocument;
    }
  | {
      kind: "endpoint";
      id: string;
      pointerId: number;
      captured?: boolean;
      which: "p1" | "p2";
      startX: number;
      startY: number;
      startObj: LineObject;
      targets: SnapTargets;
      thresholdIn: number;
      before: LayoutDocument;
    };

function Ruler({
  axis,
  originPx,
  lengthPx,
  zoom,
  unit,
}: {
  axis: "x" | "y";
  originPx: number;
  lengthPx: number;
  zoom: number;
  unit: Unit;
}) {
  if (lengthPx <= 0) return null;
  const ticks = rulerTicks(originPx, lengthPx, zoom, unit);
  const tickStart = { major: 6, mid: 10, minor: 13 };

  return (
    <svg
      width={axis === "x" ? lengthPx : RULER_BREADTH}
      height={axis === "x" ? RULER_BREADTH : lengthPx}
      className="pointer-events-none block"
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
  const router = useRouter();
  const doc = useLayoutStore((s) => s.doc);
  const activePageId = useLayoutStore((s) => s.activePageId);
  const masterEditingId = useLayoutStore((s) => s.masterEditingId);
  const zoom = useLayoutStore((s) => s.zoom);
  const pan = useLayoutStore((s) => s.pan);
  const tool = useLayoutStore((s) => s.tool);
  const guidesVisible = useLayoutStore((s) => s.guidesVisible);
  const spread = useLayoutStore((s) => s.spread);
  const fitRequestId = useLayoutStore((s) => s.fitRequestId);
  const selectedIds = useLayoutStore((s) => s.selectedIds);
  const selectedGuide = useLayoutStore((s) => s.selectedGuide);
  const editingTextId = useLayoutStore((s) => s.editingTextId);
  const unit = useLayoutStore((s) => s.unit);

  const boardRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [panning, setPanning] = useState(false);
  const [draft, setDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );
  const [marquee, setMarquee] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  // L9: the picture frame highlighted under a dragged asset, and a transient
  // note when a picked file wasn't an image.
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [pickNote, setPickNote] = useState<string | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const fittedFor = useRef<number | null>(null);
  // L9 fill-on-click: the frame awaiting the file the device picker returns.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFrame = useRef<string | null>(null);
  // L11 ruler guides: the active drag (create from a ruler, or move a placed
  // guide) and its live axis position. Guide drags run on window listeners with
  // no pointer capture. Capturing a mouse pointer whose down-target sits in the
  // page subtree and then re-rendering that subtree makes Chromium fire
  // `pointercancel` and abort the drag after one move (object drags escape this
  // only because their down-target is a leaf that never mutates). Window
  // pointermove/up bubble regardless of what's under the cursor, so no capture
  // is needed and there's nothing for the browser to cancel.
  const [guideDrag, setGuideDrag] = useState<
    | { mode: "create"; axis: "v" | "h" }
    | { mode: "move"; axis: "v" | "h"; index: number; grabX: number; grabY: number }
    | null
  >(null);
  // Set only once a move crosses the drag threshold — a plain click on a guide
  // selects it without nudging, so `at` stays the stored position until then.
  const [guideLive, setGuideLive] = useState<{ at: number; del: boolean } | null>(null);
  // origin/zoom snapshot the window drag reads without re-subscribing per render
  const geomRef = useRef({ originX: 0, originY: 0, zoom: 1 });

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
    // fit the active page's effective size (plan L12); masters follow the doc size
    const idx = s.doc.pages.findIndex((p) => p.id === s.activePageId);
    const pg = s.doc.pages[idx];
    const size = s.masterEditingId ? s.doc.size : effectivePageSize(s.doc, pg);
    let fitW = size.w;
    let fitH = size.h;
    // in spread view, reserve room for the partner on either side of the
    // centered active page (symmetric worst case) so both stay in frame (L12)
    if (s.spread && !s.masterEditingId && idx > 0) {
      const n = idx + 1; // 1-based page number
      const partner = s.doc.pages[n % 2 === 0 ? idx + 1 : idx - 1];
      if (partner) {
        const psize = effectivePageSize(s.doc, partner);
        fitW = size.w + 2 * psize.w;
        fitH = Math.max(size.h, psize.h);
      }
    }
    s.setZoom(fitZoom(fitW, fitH, s.doc.bleed, vp.w, vp.h));
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
  const editingMaster = masterEditingId
    ? doc.masters.find((m) => m.id === masterEditingId)
    : undefined;
  /** What the tools edit: the master's objects in master mode, else the page's (L6). */
  const surface = editingMaster ? editingMaster.objects : page.objects;
  /** Master furniture rendered beneath a page — non-selectable from the page. */
  const appliedMaster =
    !editingMaster && page.masterId
      ? doc.masters.find((m) => m.id === page.masterId)
      : undefined;
  const selected =
    selectedIds.length === 1 ? surface.find((o) => o.id === selectedIds[0]) : undefined;

  // the active surface's effective size (plan L12): the page's override, else
  // the doc size; a master being edited always draws at the document size
  const pageSize = editingMaster ? doc.size : effectivePageSize(doc, page);
  const pageW = inToPx(pageSize.w, zoom);
  const pageH = inToPx(pageSize.h, zoom);
  const originX = vp.w / 2 + pan.x - pageW / 2;
  const originY = vp.h / 2 + pan.y - pageH / 2;
  geomRef.current = { originX, originY, zoom };

  // Two-page spread partner (plan L12) — Publisher pairing: page 1 stands
  // alone, then (2|3), (4|5), … The active page stays centered and its partner
  // renders alongside; a click activates the partner, editing never leaves the
  // active page. Masters have no spread.
  const pageIndex = doc.pages.findIndex((p) => p.id === activePageId);
  const spreadPartner = (() => {
    if (!spread || editingMaster || pageIndex < 0) return null;
    const n = pageIndex + 1; // 1-based page number
    if (n === 1) return null; // the first page has no partner
    const partner = doc.pages[n % 2 === 0 ? pageIndex + 1 : pageIndex - 1];
    if (!partner) return null; // an even last page has no right-hand partner
    return { page: partner, side: n % 2 === 0 ? ("right" as const) : ("left" as const) };
  })();

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

  /** Snap targets + threshold for a gesture starting now (zoom is stable mid-drag). */
  const gestureSnap = (exclude?: Set<string>) => {
    const s = useLayoutStore.getState();
    const pg = s.doc.pages.find((p) => p.id === s.activePageId);
    const size = s.masterEditingId ? s.doc.size : effectivePageSize(s.doc, pg);
    return {
      targets: snapTargets(s.doc, surfaceObjects(s), {
        exclude,
        columnGuidesOn: s.guidesVisible && s.doc.columns >= 2,
        guidesOn: s.guidesVisible, // objects snap to ruler-dragged guides (L11)
        size, // margins/centers/columns follow the page's effective size (L12)
      }),
      thresholdIn: SNAP_THRESHOLD_PX / (DPI * s.zoom),
    };
  };

  /** Topmost picture frame on the editing surface containing a page-space point (L9). */
  const pictureAt = (pt: { x: number; y: number }) => {
    const objs = surfaceObjects(useLayoutStore.getState());
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.type !== "picture") continue;
      // rotated frames hit-test by their visual footprint (AABB), like snapping (L10)
      const b = rotatedBBox(o);
      if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) return o.id;
    }
    return null;
  };

  /* ── Ruler guides (plan L11) ── */

  /** A client point → the guide's page-inch position along its axis. */
  const clientToPageAxis = useCallback((axis: "v" | "h", clientX: number, clientY: number) => {
    const rect = boardRef.current!.getBoundingClientRect();
    const { originX: ox, originY: oy, zoom: z } = geomRef.current;
    return axis === "v" ? pxToIn(clientX - rect.left - ox, z) : pxToIn(clientY - rect.top - oy, z);
  }, []);

  /** Dragged back over the originating ruler → create cancels / move deletes. */
  const overRuler = useCallback((axis: "v" | "h", clientX: number, clientY: number) => {
    const rect = boardRef.current!.getBoundingClientRect();
    return axis === "v" ? clientX < rect.left : clientY < rect.top;
  }, []);

  // A guide drag tracks the pointer on `window` with no pointer capture — see
  // the `guideDrag` note: the page subtree can re-render freely and the browser
  // never cancels the stream. Listeners attach imperatively at pointer-down (not
  // via an effect), so a fast pointermove right after the press is never missed.
  const guideCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => guideCleanup.current?.(), []); // detach if unmounted mid-drag

  const beginGuideDrag = (
    drag:
      | { mode: "create"; axis: "v" | "h" }
      | { mode: "move"; axis: "v" | "h"; index: number; grabX: number; grabY: number },
  ) => {
    setGuideDrag(drag);
    let moved = false;
    const onMove = (e: PointerEvent) => {
      if (!moved && drag.mode === "move") {
        // a plain click selects the guide; only a real drag (past 3px, in screen
        // pixels) moves it, so the guide never jumps to the click point
        if (Math.hypot(e.clientX - drag.grabX, e.clientY - drag.grabY) < 3) return;
      }
      moved = true;
      setGuideLive({
        at: clientToPageAxis(drag.axis, e.clientX, e.clientY),
        del: overRuler(drag.axis, e.clientX, e.clientY),
      });
    };
    const detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      guideCleanup.current = null;
    };
    const onUp = (e: PointerEvent) => {
      detach();
      // pointercancel carries no useful position (clientX 0) — abort cleanly
      // rather than misread it as a drop over the ruler and wrongly delete.
      if (e.type !== "pointercancel") {
        const s = useLayoutStore.getState();
        const at = clientToPageAxis(drag.axis, e.clientX, e.clientY);
        const del = overRuler(drag.axis, e.clientX, e.clientY);
        if (drag.mode === "create") {
          if (moved && !del) s.addGuide(drag.axis, at); // dropped on the ruler → discard
        } else if (moved) {
          // a real drag repositioned (or, over the ruler, deletes) the guide
          if (del) s.removeGuide(drag.axis, drag.index);
          else s.setGuide(drag.axis, drag.index, at);
        }
      }
      // a plain click (no move) or a cancel leaves the guide where it is
      setGuideDrag(null);
      setGuideLive(null);
    };
    guideCleanup.current?.(); // end any prior drag cleanly
    guideCleanup.current = detach;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  /**
   * Pull a fresh guide out of a ruler (top ruler → horizontal, left → vertical).
   * A window drag takes over from here (no pointer capture); the ruler press
   * just seeds the gesture and the initial draft position.
   */
  const startGuideCreate = (axis: "v" | "h") => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    beginGuideDrag({ mode: "create", axis });
    setGuideLive({ at: clientToPageAxis(axis, e.clientX, e.clientY), del: false });
  };

  /**
   * A placed guide near a page-space point, within a screen-px tolerance.
   * Hit-tested from the board's pointerdown (not the guide element) so an object
   * on top of a guide — whose own pointerdown stops propagation — wins the grab.
   */
  const guideAt = (p: { x: number; y: number }): { axis: "v" | "h"; index: number } | null => {
    const s = useLayoutStore.getState();
    if (!s.guidesVisible) return null;
    const tol = 5 / (DPI * zoom); // ~5px grab radius, in inches
    const cands: { axis: "v" | "h"; index: number; d: number }[] = [];
    s.doc.guides.v.forEach((gx, index) => {
      const d = Math.abs(gx - p.x);
      if (d <= tol) cands.push({ axis: "v", index, d });
    });
    s.doc.guides.h.forEach((gy, index) => {
      const d = Math.abs(gy - p.y);
      if (d <= tol) cands.push({ axis: "h", index, d });
    });
    if (!cands.length) return null;
    const best = cands.reduce((a, b) => (b.d < a.d ? b : a));
    return { axis: best.axis, index: best.index };
  };

  /** Open the device picker to fill an empty picture frame (L9 fill-on-click). */
  const openPicker = (frameId: string) => {
    pendingFrame.current = frameId;
    fileInputRef.current?.click();
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // re-picking the same file should re-fire
    const frameId = pendingFrame.current;
    pendingFrame.current = null;
    if (!file || !frameId) return;
    void importAssetFile(file).then((res) => {
      if (!res.ok) {
        setPickNote("That file isn't an image — pick a JPG, PNG, or similar.");
        return;
      }
      const s = useLayoutStore.getState();
      s.addAsset(res.asset); // joins the library (not an undo step)…
      s.bindAsset(frameId, res.asset.id); // …and binds to the frame (one undo step)
    });
  };

  // Asset drag from the panel: highlight the frame under the cursor, bind on drop.
  const onBoardDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(ASSET_DND_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropTargetId(pictureAt(toPageIn(e)));
  };

  const onBoardDrop = (e: React.DragEvent) => {
    setDropTargetId(null);
    const assetId = e.dataTransfer.getData(ASSET_DND_TYPE);
    if (!assetId) return;
    e.preventDefault();
    const frameId = pictureAt(toPageIn(e));
    if (frameId) useLayoutStore.getState().bindAsset(frameId, assetId);
  };

  /**
   * Select-tool pointer-down on an object. Shift toggles it in the selection
   * (plan L7); a plain press on a selected member keeps the group and drags
   * it together, otherwise the object becomes the selection and moves alone.
   * Capture is deferred to the first pointermove — capturing here would
   * retarget the click (and a double-click) to the board, killing dblclick.
   */
  const startMove = (obj: LayoutObject) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = useLayoutStore.getState();
    if (e.shiftKey) {
      s.toggleSelected(obj.id);
      return;
    }
    const moving = s.selectedIds.includes(obj.id) ? s.selectedIds : [obj.id];
    if (!s.selectedIds.includes(obj.id)) s.setSelection([obj.id]);
    if (s.editingTextId) s.setEditingText(null); // grabbing an object ends a text session
    const p = toPageIn(e);
    const movingIds = new Set(moving);
    gesture.current = {
      kind: "move",
      pointerId: e.pointerId,
      startX: p.x,
      startY: p.y,
      pressedId: obj.id,
      startSurface: surfaceObjects(s),
      movingIds,
      ...gestureSnap(movingIds),
      before: s.doc,
    };
  };

  /** Double-click: a text frame opens the contentEditable overlay (L5); a bound
      picture frame round-trips into the Photo Editor (PE8, F2). Other frames no-op. */
  const onObjectDoubleClick = (obj: LayoutObject) => () => {
    const s = useLayoutStore.getState();
    if (obj.type === "text") {
      s.setSelection([obj.id]);
      s.setEditingText(obj.id);
      return;
    }
    if (obj.type === "picture" && obj.assetId) {
      s.setSelection([obj.id]);
      void openPlacedPictureInPhotoEditor(obj, s.doc.name, router).then((res) => {
        if (!res.ok) setPickNote(res.message);
      });
    }
  };

  const startResize = (obj: LayoutObject) => (dir: HandleDir, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = toPageIn(e);
    gesture.current = {
      kind: "resize",
      id: obj.id,
      pointerId: e.pointerId,
      dir,
      startX: p.x,
      startY: p.y,
      startBBox: bboxOf(obj),
      rotation: obj.type === "line" ? 0 : obj.rotation,
      ...gestureSnap(new Set([obj.id])),
      before: useLayoutStore.getState().doc,
    };
  };

  /** Rotate-handle pointer-down (L10): read the angle by the delta from the grab. */
  const startRotate = (obj: LayoutObject) => (e: React.PointerEvent) => {
    if (e.button !== 0 || obj.type === "line") return;
    e.stopPropagation();
    const b = bboxOf(obj);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const p = toPageIn(e);
    gesture.current = {
      kind: "rotate",
      id: obj.id,
      pointerId: e.pointerId,
      startX: p.x,
      startY: p.y,
      cx,
      cy,
      startRotation: obj.rotation,
      grabAngle: angleFromCenter(cx, cy, p.x, p.y),
      before: useLayoutStore.getState().doc,
    };
  };

  const startEndpoint = (obj: LineObject) => (which: "p1" | "p2", e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = toPageIn(e);
    gesture.current = {
      kind: "endpoint",
      id: obj.id,
      pointerId: e.pointerId,
      which,
      startX: p.x,
      startY: p.y,
      startObj: obj,
      ...gestureSnap(new Set([obj.id])),
      before: useLayoutStore.getState().doc,
    };
  };

  const onBoardPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (pickNote) setPickNote(null); // dismiss the last skip note on the next action
    const s = useLayoutStore.getState();
    if (tool === "move") {
      if (s.selectedGuide) s.selectGuide(null);
      capture(e);
      gesture.current = { kind: "pan", fromX: e.clientX, fromY: e.clientY, panX: pan.x, panY: pan.y };
      setPanning(true);
    } else if (DRAW_TOOLS.has(tool)) {
      if (s.selectedGuide) s.selectGuide(null); // starting a draw clears the guide
      capture(e);
      const p = toPageIn(e);
      const snap = gestureSnap();
      // the draw origin snaps too, so a frame can start exactly on a guide
      const sp = snapPoint(p.x, p.y, snap.targets, snap.thresholdIn);
      gesture.current = { kind: "draw", startX: sp.x, startY: sp.y, ...snap };
      setDraft({ x1: sp.x, y1: sp.y, x2: sp.x, y2: sp.y });
      setSnapLines(sp.lines);
    } else if (tool === "select") {
      const p = toPageIn(e);
      // grab a nearby ruler guide (plan L11). Only reached when no object caught
      // the pointerdown (objects stop propagation), so objects win the grab. The
      // press selects the guide (turns it red); a window drag past the threshold
      // then repositions it, while a plain click just leaves it selected — no
      // capture, and native drag is suppressed, so re-rendering can't cancel it.
      const hit = guideAt(p);
      if (hit) {
        s.selectGuide(hit);
        beginGuideDrag({
          mode: "move",
          axis: hit.axis,
          index: hit.index,
          grabX: e.clientX,
          grabY: e.clientY,
        });
        return;
      }
      // reached the pasteboard itself — nothing was hit; clear any guide/object
      // selection and rubber-band a marquee from here (plan L7)
      if (s.selectedGuide) s.selectGuide(null);
      if (s.editingTextId) s.setEditingText(null);
      if (selectedIds.length) s.setSelection([]);
      gesture.current = {
        kind: "marquee",
        pointerId: e.pointerId,
        startX: p.x,
        startY: p.y,
        curX: p.x,
        curY: p.y,
      };
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
    if (g.kind !== "draw" && !g.captured) {
      // Ignore sub-3px jitter so clean clicks (and double-clicks) stay clicks;
      // past that the drag is real — capture now (deferred, because capturing
      // at pointer-down would retarget the click to the board).
      if (Math.hypot(dx, dy) * DPI * zoom < 3) return;
      boardRef.current?.setPointerCapture(g.pointerId);
      g.captured = true;
    }
    if (g.kind === "draw") {
      const sp = snapPoint(p.x, p.y, g.targets, g.thresholdIn);
      setDraft({ x1: g.startX, y1: g.startY, x2: sp.x, y2: sp.y });
      setSnapLines(sp.lines);
    } else if (g.kind === "marquee") {
      g.curX = p.x;
      g.curY = p.y;
      setMarquee({ x1: g.startX, y1: g.startY, x2: p.x, y2: p.y });
    } else if (g.kind === "move") {
      // the moving group snaps as one union box — by each object's rotated
      // footprint (axis-aligned bounds), the honest simplification of L10
      const moving = g.startSurface.filter((o) => g.movingIds.has(o.id));
      if (!moving.length) return; // nothing to move — don't feed empty min/max a NaN box
      const boxes = moving.map(rotatedBBox);
      const minX = Math.min(...boxes.map((b) => b.x));
      const minY = Math.min(...boxes.map((b) => b.y));
      const maxX = Math.max(...boxes.map((b) => b.x + b.w));
      const maxY = Math.max(...boxes.map((b) => b.y + b.h));
      const snap = snapBBox(
        { x: minX + dx, y: minY + dy, w: maxX - minX, h: maxY - minY },
        g.targets,
        g.thresholdIn,
      );
      const fdx = dx + snap.dx;
      const fdy = dy + snap.dy;
      s.setSurfaceObjects(
        g.startSurface.map((o) => (g.movingIds.has(o.id) ? translated(o, fdx, fdy) : o)),
        true,
      );
      setSnapLines(snap.lines);
    } else if (g.kind === "rotate") {
      // rotation reads by the delta from the grab; Shift snaps to 15°
      const raw = g.startRotation + (angleFromCenter(g.cx, g.cy, p.x, p.y) - g.grabAngle);
      s.transformObject(g.id, { rotation: e.shiftKey ? snapAngle(raw) : raw }, true);
    } else if (g.kind === "resize") {
      if (g.rotation) {
        // rotated: resize in the object's local axes, no edge snapping (the
        // dragged edge isn't axis-aligned, so axis snap targets don't apply)
        const b = resizeRotatedBBox(g.startBBox, g.dir, dx, dy, g.rotation, e.shiftKey);
        s.transformObject(g.id, { x: b.x, y: b.y, w: b.w, h: b.h }, true);
      } else {
        // only the dragged edges snap — an east handle snaps x, never y
        const movingX = g.dir.includes("e")
          ? g.startBBox.x + g.startBBox.w + dx
          : g.dir.includes("w")
            ? g.startBBox.x + dx
            : null;
        const movingY = g.dir.includes("s")
          ? g.startBBox.y + g.startBBox.h + dy
          : g.dir.includes("n")
            ? g.startBBox.y + dy
            : null;
        const sp = snapPoint(movingX ?? 0, movingY ?? 0, g.targets, g.thresholdIn, {
          x: movingX !== null,
          y: movingY !== null,
        });
        const sdx = movingX !== null ? dx + (sp.x - movingX) : dx;
        const sdy = movingY !== null ? dy + (sp.y - movingY) : dy;
        const b = resizeBBox(g.startBBox, g.dir, sdx, sdy, e.shiftKey);
        s.transformObject(g.id, { x: b.x, y: b.y, w: b.w, h: b.h }, true);
        setSnapLines(sp.lines);
      }
    } else {
      const ex = g.which === "p1" ? g.startObj.x1 : g.startObj.x2;
      const ey = g.which === "p1" ? g.startObj.y1 : g.startObj.y2;
      const sp = snapPoint(ex + dx, ey + dy, g.targets, g.thresholdIn);
      s.transformObject(
        g.id,
        g.which === "p1" ? { x1: sp.x, y1: sp.y } : { x2: sp.x, y2: sp.y },
        true,
      );
      setSnapLines(sp.lines);
    }
  };

  const onBoardPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setPanning(false);
    setSnapLines([]);
    if (!g) return;
    const s = useLayoutStore.getState();
    if (g.kind === "draw") {
      setDraft(null);
      // the draft carries the snapped corner — finalize from it, not the raw pointer
      const raw = toPageIn(e);
      const sp = snapPoint(raw.x, raw.y, g.targets, g.thresholdIn);
      const dx = sp.x - g.startX;
      const dy = sp.y - g.startY;
      if (tool === "line") {
        if (Math.hypot(dx, dy) < DRAW_THRESHOLD_IN) return;
        s.addObject(createLine(g.startX, g.startY, sp.x, sp.y));
      } else {
        const w = Math.abs(dx);
        const h = Math.abs(dy);
        if (w < DRAW_THRESHOLD_IN && h < DRAW_THRESHOLD_IN) return;
        const x = Math.min(g.startX, sp.x);
        const y = Math.min(g.startY, sp.y);
        if (tool === "text") {
          // Publisher behavior: a fresh text box opens ready to type
          const frame = createTextFrame(x, y, w, h);
          s.addObject(frame);
          s.setEditingText(frame.id);
        } else {
          const type = tool === "pic" ? "picture" : (tool as "rect" | "ellipse");
          s.addObject(createFrame(type, x, y, w, h));
        }
      }
    } else if (g.kind === "marquee") {
      setMarquee(null);
      if (!g.captured) return; // a plain click — the pointer-down already deselected
      const rx = Math.min(g.startX, g.curX);
      const ry = Math.min(g.startY, g.curY);
      const rw = Math.abs(g.curX - g.startX);
      const rh = Math.abs(g.curY - g.startY);
      const hit = surfaceObjects(s)
        .filter((o) => {
          // marquee tests each object's visual footprint (AABB when rotated, L10)
          const b = rotatedBBox(o);
          return b.x < rx + rw && b.x + b.w > rx && b.y < ry + rh && b.y + b.h > ry;
        })
        .map((o) => o.id);
      s.setSelection(hit);
    } else if (g.kind !== "pan") {
      if (g.kind === "move" && !g.captured) {
        if (g.movingIds.size > 1) {
          // a dragless press on a group member collapses the selection to it
          s.setSelection([g.pressedId]);
        } else {
          // a dragless click on an empty picture frame opens the file picker (L9)
          const pressed = surfaceObjects(s).find((o) => o.id === g.pressedId);
          if (pressed && pressed.type === "picture" && !pressed.assetId) {
            openPicker(g.pressedId);
          }
        }
      }
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
    // Suppress native HTML drag across the whole canvas column — including the
    // rulers, where a guide-create drag starts. Without it the browser can begin
    // a native drag and fire pointercancel mid-gesture (plan L11); guide drags
    // run on window listeners with no pointer capture, which would otherwise
    // block it. Asset drops still work — those drags originate in the panel.
    <div className="flex min-w-0 flex-1 flex-col" onDragStart={(e) => e.preventDefault()}>
      {/* top ruler row: corner box + horizontal ruler (drag down for a guide) */}
      <div className="flex h-[18px] shrink-0">
        <div className="w-[18px] shrink-0 border-b border-r border-[#e0e0e0] bg-[#ededed]" />
        <div
          data-testid="ruler-x"
          onPointerDown={startGuideCreate("h")}
          className="flex-1 cursor-ns-resize overflow-hidden border-b border-[#e0e0e0] bg-[#ededed]"
        >
          <Ruler axis="x" originPx={originX} lengthPx={vp.w} zoom={zoom} unit={unit} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left ruler (drag right for a guide) */}
        <div
          data-testid="ruler-y"
          onPointerDown={startGuideCreate("v")}
          className="w-[18px] shrink-0 cursor-ew-resize overflow-hidden border-r border-[#e0e0e0] bg-[#ededed]"
        >
          <Ruler axis="y" originPx={originY} lengthPx={vp.h} zoom={zoom} unit={unit} />
        </div>

        {/* pasteboard */}
        <div
          ref={boardRef}
          data-testid="pasteboard"
          className={`relative flex-1 select-none overflow-hidden bg-pasteboard ${cursor}`}
          onPointerDown={onBoardPointerDown}
          onPointerMove={onBoardPointerMove}
          onPointerUp={onBoardPointerUp}
          // native drag is suppressed on the whole canvas column (see the wrapper)
          onDragOver={onBoardDragOver}
          onDrop={onBoardDrop}
          onDragLeave={() => setDropTargetId(null)}
          onClick={(e) => {
            if (tool !== "zoom") return;
            const s = useLayoutStore.getState();
            if (e.altKey) s.zoomOut();
            else s.zoomIn();
          }}
        >
          {/* device file picker for L9 fill-on-click — triggered from a frame click */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="canvas-file-input"
            onChange={onPickFile}
          />
          {/* master-editing mode banner (plan L6). The wire's name/size/zoom
              caption that sat here came out in L8 — the title bar and status
              bar already carry all three. */}
          {editingMaster && (
            <div
              data-testid="master-banner"
              className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-[10px] whitespace-nowrap rounded-full border border-brand bg-brand-tint py-[3px] pl-3 pr-[3px] text-[11px] text-brand"
            >
              <span>
                Editing master {editingMaster.label} — changes apply to every page that uses it
              </span>
              <button
                type="button"
                data-testid="master-done"
                onClick={() => useLayoutStore.getState().setMasterEditing(null)}
                className="cursor-pointer rounded-full border border-brand bg-white px-[9px] py-px text-[10px] font-semibold hover:bg-[#fff5f5]"
              >
                Done
              </button>
            </div>
          )}

          {/* two-page spread partner (plan L12) — a static, click-to-activate
              page beside the active one, positioned in board space so it tracks
              pan/zoom with the active page. Rendered before the active page so
              the page you're editing sits on top at the spine. */}
          {spreadPartner &&
            (() => {
              const pSize = effectivePageSize(doc, spreadPartner.page);
              const partnerW = inToPx(pSize.w, zoom);
              const left =
                spreadPartner.side === "left" ? originX - partnerW : originX + pageW;
              const pMaster = spreadPartner.page.masterId
                ? doc.masters.find((m) => m.id === spreadPartner.page.masterId)
                : undefined;
              return (
                <div
                  data-testid="spread-partner"
                  className="absolute cursor-pointer"
                  style={{ left, top: originY }}
                  title="Click to edit this page"
                  // don't start a canvas gesture on the partner — just activate it
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() =>
                    useLayoutStore.getState().setActivePage(spreadPartner.page.id)
                  }
                >
                  <PageSurface doc={doc} size={pSize} zoom={zoom} guidesVisible={false} withTestId={false}>
                    {pMaster?.objects.map((o) => (
                      <ObjectNode key={o.id} obj={o} zoom={zoom} interactive={false} withTestId={false} />
                    ))}
                    {spreadPartner.page.objects.map((o) => (
                      <ObjectNode key={o.id} obj={o} zoom={zoom} interactive={false} withTestId={false} />
                    ))}
                  </PageSurface>
                  {/* faint veil marks it as the inactive page you can click into */}
                  <div className="pointer-events-none absolute inset-0 bg-[rgba(120,120,120,.06)]" />
                </div>
              );
            })()}

          {/* publication page — centered, offset by the pan */}
          <div
            className="absolute left-1/2 top-1/2"
            style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))` }}
          >
            <PageSurface doc={doc} size={pageSize} zoom={zoom} guidesVisible={guidesVisible}>
              {/* master furniture first — beneath page objects, never selectable here */}
              {appliedMaster?.objects.map((o) => (
                <ObjectNode key={o.id} obj={o} zoom={zoom} interactive={false} />
              ))}
              {surface.map((o) => (
                <ObjectNode
                  key={o.id}
                  obj={o}
                  zoom={zoom}
                  interactive={tool === "select"}
                  editing={o.id === editingTextId}
                  onPointerDown={startMove(o)}
                  onDoubleClick={onObjectDoubleClick(o)}
                />
              ))}
              {/* ruler guides render as a full-workspace layer over the
                  pasteboard (below), not clipped to the page. */}
              {draft && <DraftPreview draft={draft} line={tool === "line"} zoom={zoom} />}
              {selected && tool === "select" && (
                <SelectionOverlay
                  obj={selected}
                  zoom={zoom}
                  onHandleDown={startResize(selected)}
                  onRotateDown={startRotate(selected)}
                  onEndpointDown={
                    selected.type === "line" ? startEndpoint(selected) : () => undefined
                  }
                />
              )}
              {/* multi-selection: an outline per member (rotating with it) —
                  resize/rotate handles stay single-selection only */}
              {tool === "select" &&
                selectedIds.length > 1 &&
                surface
                  .filter((o) => selectedIds.includes(o.id))
                  .map((o) => {
                    const b = bboxOf(o);
                    const rot = o.type !== "line" && o.rotation ? o.rotation : 0;
                    return (
                      <div
                        key={`msel-${o.id}`}
                        data-testid="multi-select-frame"
                        className="pointer-events-none absolute border border-brand"
                        style={{
                          left: inToPx(b.x, zoom) - 1,
                          top: inToPx(b.y, zoom) - 1,
                          width: inToPx(b.w, zoom) + 2,
                          height: inToPx(b.h, zoom) + 2,
                          transform: rot ? `rotate(${rot}deg)` : undefined,
                        }}
                      />
                    );
                  })}
              {/* drop-target highlight — the picture frame under a dragged asset (L9) */}
              {dropTargetId &&
                (() => {
                  const f = surface.find((o) => o.id === dropTargetId);
                  if (!f || f.type !== "picture") return null;
                  const b = bboxOf(f);
                  return (
                    <div
                      data-testid="drop-target"
                      className="pointer-events-none absolute z-20 border-2 border-brand bg-[rgba(204,0,0,.08)]"
                      style={{
                        left: inToPx(b.x, zoom),
                        top: inToPx(b.y, zoom),
                        width: inToPx(b.w, zoom),
                        height: inToPx(b.h, zoom),
                      }}
                    />
                  );
                })()}
              {/* marquee rubber band, in page coordinates */}
              {marquee && (
                <div
                  data-testid="marquee"
                  className="pointer-events-none absolute border border-dashed border-brand bg-[rgba(204,0,0,.04)]"
                  style={{
                    left: inToPx(Math.min(marquee.x1, marquee.x2), zoom),
                    top: inToPx(Math.min(marquee.y1, marquee.y2), zoom),
                    width: inToPx(Math.abs(marquee.x2 - marquee.x1), zoom),
                    height: inToPx(Math.abs(marquee.y2 - marquee.y1), zoom),
                  }}
                />
              )}
              {/* smart guides — the snap targets currently engaged (plan L7) */}
              {snapLines.map((l, i) =>
                l.axis === "v" ? (
                  <div
                    key={`sg-${i}`}
                    data-testid="smart-guide"
                    className="pointer-events-none absolute z-20 w-px bg-brand"
                    style={{ left: inToPx(l.at, zoom), top: -12, bottom: -12 }}
                  />
                ) : (
                  <div
                    key={`sg-${i}`}
                    data-testid="smart-guide"
                    className="pointer-events-none absolute z-20 h-px bg-brand"
                    style={{ top: inToPx(l.at, zoom), left: -12, right: -12 }}
                  />
                ),
              )}
              {(() => {
                const editing = editingTextId
                  ? surface.find((o) => o.id === editingTextId)
                  : undefined;
                return editing && editing.type === "text" && editing.text ? (
                  <TextEditOverlay key={editing.id} obj={editing} zoom={zoom} />
                ) : null;
              })()}
            </PageSurface>
          </div>

          {/* ruler guides — a full-workspace layer over the whole pasteboard
              (plan L11), not clipped to the page. Positioned in board space
              (origin + page offset) so they track pan/zoom with the page.
              Visual only: grabbing is a board-level hit-test so objects win the
              click; a selected guide turns red (Delete or a drag to the ruler
              removes it), and the moving one follows the pointer. */}
          {guidesVisible && (
            <div className="pointer-events-none absolute inset-0">
              {doc.guides.v.map((x, i) => {
                const moving =
                  guideDrag?.mode === "move" && guideDrag.axis === "v" && guideDrag.index === i;
                if (moving && guideLive?.del) return null; // over the ruler → will delete
                const at = moving && guideLive ? guideLive.at : x;
                const sel = selectedGuide?.axis === "v" && selectedGuide.index === i;
                return (
                  <div
                    key={`gv-${i}`}
                    data-testid="guide-v"
                    data-selected={sel ? "true" : undefined}
                    className={`absolute inset-y-0 w-px ${sel ? "bg-brand" : "bg-guide"}`}
                    style={{ left: originX + inToPx(at, zoom) }}
                  />
                );
              })}
              {doc.guides.h.map((y, i) => {
                const moving =
                  guideDrag?.mode === "move" && guideDrag.axis === "h" && guideDrag.index === i;
                if (moving && guideLive?.del) return null;
                const at = moving && guideLive ? guideLive.at : y;
                const sel = selectedGuide?.axis === "h" && selectedGuide.index === i;
                return (
                  <div
                    key={`gh-${i}`}
                    data-testid="guide-h"
                    data-selected={sel ? "true" : undefined}
                    className={`absolute inset-x-0 h-px ${sel ? "bg-brand" : "bg-guide"}`}
                    style={{ top: originY + inToPx(at, zoom) }}
                  />
                );
              })}
              {/* provisional line while dragging a fresh guide out of a ruler */}
              {guideDrag?.mode === "create" &&
                guideLive &&
                !guideLive.del &&
                (guideDrag.axis === "v" ? (
                  <div
                    data-testid="guide-draft"
                    className="absolute inset-y-0 w-px bg-guide"
                    style={{ left: originX + inToPx(guideLive.at, zoom) }}
                  />
                ) : (
                  <div
                    data-testid="guide-draft"
                    className="absolute inset-x-0 h-px bg-guide"
                    style={{ top: originY + inToPx(guideLive.at, zoom) }}
                  />
                ))}
            </div>
          )}

          {/* L9: transient note when a picked file wasn't an image */}
          {pickNote && (
            <div
              data-testid="pick-note"
              className="pointer-events-none absolute bottom-[14px] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-brand bg-white px-3 py-1 text-[11px] text-brand shadow-[0_1px_4px_rgba(0,0,0,.12)]"
            >
              {pickNote}
            </div>
          )}

          {/* guide legend */}
          <div className="pointer-events-none absolute bottom-[14px] right-4 z-10 flex flex-col gap-[6px] rounded-[7px] border border-[#e2e2e2] bg-white px-[11px] py-2">
            <div className="flex items-center gap-[7px]">
              <div className="w-4 border-t-[1.5px] border-dashed border-brand" />
              <span className="text-[10px] text-[#888]">Bleed {formatLen(doc.bleed, unit)} {unit}</span>
            </div>
            <div className="flex items-center gap-[7px]">
              <div className="w-4 border-t border-dashed border-guide" />
              <span className="text-[10px] text-[#888]">Margin {formatLen(doc.margin, unit)} {unit}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
