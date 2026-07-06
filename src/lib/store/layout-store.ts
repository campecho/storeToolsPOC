import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  LayoutDocumentSchema,
  type Asset,
  type LayoutDocument,
  type LayoutObject,
  type MasterPage,
  type Orientation,
  type Paragraph,
  type Stroke,
} from "@/schema";
import { V1LayoutDocumentSchema, migrateLegacyDocument } from "@/lib/schema/layout-v1";
import { applyToAllRuns, type TextPatch } from "@/lib/layout/text";
import { clearAssetBlobs, deleteAssetBlob, replaceAssetBlobs } from "@/lib/assets/blob-store";
import { createPlacedPicture, placedPictureRect } from "@/lib/assets/placement";
import {
  clampPageDim,
  clampZoom,
  zoomInStep,
  zoomOutStep,
} from "@/lib/layout/geometry";
import { getPreset } from "@/lib/layout/presets";
import { isUnit, type Unit } from "@/lib/layout/units";
import {
  DUPLICATE_OFFSET_IN,
  MIN_OBJECT_IN,
  normalizeAngle,
  translated,
} from "@/lib/layout/objects";
import {
  alignObjects,
  distributeObjects,
  unionBBox,
  type AlignKind,
  type AlignRelativeTo,
  type DistributeAxis,
} from "@/lib/layout/align";
import type { ImportReport } from "@/lib/import/report";

/**
 * Layout-editor state (plan §3.3). Prototype UI-state names are kept verbatim
 * — `ribbon` / `tool` / `insp` / `pages` — so the handoff's .dc.html source
 * stays a usable reference.
 *
 * Slices: document (persisted under `stp-layout-v1`, beside the tracker's
 * `stp-feedback-v1`), experience level (persisted), viewport zoom/pan/guides
 * (session), selection (session), and bounded per-gesture undo history
 * (session, cap 50 — snapshots push on completed gestures and input commits,
 * never per pointer-move).
 *
 * Editing surface (plan L6): object actions target the master being edited
 * when `masterEditingId` is set, else the active page — one code path for
 * both, so every L4/L5 gesture works inside a master unchanged.
 */

export type RibbonTab = "home" | "insert" | "layout" | "text" | "arrange";
export type EditorTool =
  | "select"
  | "text"
  | "rect"
  | "ellipse"
  | "line"
  | "pic"
  | "table"
  | "zoom"
  | "move";
export type InspectorTab = "props" | "text" | "align" | "page";
export type PagesPaneView = "pages" | "masters";
/** Page-tab "Apply to" target for size edits (plan L12). */
export type PageSizeScope = "document" | "page";
/** Side-panel tabs (plan L8) — vertical Pages / Assets / Layers strip; the
    "import" tab (P4) is the fidelity-report reader, shown only after an import. */
export type PanelTab = "pages" | "assets" | "layers" | "import";
/** Two levels since plan v1.3 — persisted legacy "pro" coerces to "standard". */
export type ExperienceLevel = "simple" | "standard";

/** Status-bar readout per tool — the handoff asks the label to track the active tool. */
export const TOOL_LABELS: Record<EditorTool, string> = {
  select: "Select tool",
  text: "Text tool",
  rect: "Rectangle tool",
  ellipse: "Ellipse tool",
  line: "Line tool",
  pic: "Picture tool",
  table: "Table tool",
  zoom: "Zoom tool",
  move: "Move tool",
};

/** Geometry-only edit to one object — frame x/y/w/h(/rotation) or line endpoints. */
export type TransformPatch = {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Frames only — degrees, normalized into [0, 360) on apply (plan L10). */
  rotation?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
};

export type ObjectPropsPatch = { fill?: string | null; stroke?: Stroke | null };

/** Flattened text edit (plan L5) — applies to the WHOLE frame: since schema
    v2 the runs are the source of truth, so a patch maps over every run. */
export type TextPropsPatch = TextPatch;

// ASSUMPTION: 50 undo steps matches desktop-publishing norms — confirm with
// associates once real documents exist.
const HISTORY_CAP = 50;

/** Spread into a set() patch: push a snapshot, clear the redo stack. */
function pushed(s: Pick<LayoutEditorState, "past">, snapshot: LayoutDocument) {
  return { past: [...s.past, snapshot].slice(-HISTORY_CAP), future: [] as LayoutDocument[] };
}

type EditSurface = { doc: LayoutDocument; activePageId: string; masterEditingId: string | null };

/** Objects on the editing surface — the master being edited, else the active page (L6). */
export function surfaceObjects(s: EditSurface): LayoutObject[] {
  if (s.masterEditingId) {
    return s.doc.masters.find((m) => m.id === s.masterEditingId)?.objects ?? [];
  }
  return s.doc.pages.find((p) => p.id === s.activePageId)?.objects ?? [];
}

function mapSurfaceObjects(
  s: EditSurface,
  fn: (objects: LayoutObject[]) => LayoutObject[],
): LayoutDocument {
  const { doc } = s;
  if (s.masterEditingId) {
    return {
      ...doc,
      masters: doc.masters.map((m) =>
        m.id === s.masterEditingId ? { ...m, objects: fn(m.objects) } : m,
      ),
    };
  }
  return {
    ...doc,
    pages: doc.pages.map((p) =>
      p.id === s.activePageId ? { ...p, objects: fn(p.objects) } : p,
    ),
  };
}

/** Selection filtered to objects that still exist (after undo/redo). */
function pruneSelection(ids: string[], target: EditSurface): string[] {
  const alive = new Set(surfaceObjects(target).map((o) => o.id));
  return ids.filter((id) => alive.has(id));
}

/**
 * Undo/redo can restore a document without the page or master the session
 * points at (e.g. undoing an Add page). A vanished page falls back to the
 * same list position; a vanished master ends master editing.
 */
function resolveSurface(
  s: Pick<LayoutEditorState, "doc" | "activePageId" | "masterEditingId">,
  next: LayoutDocument,
): Pick<LayoutEditorState, "activePageId" | "masterEditingId"> {
  let activePageId = s.activePageId;
  if (!next.pages.some((p) => p.id === activePageId)) {
    const wasAt = s.doc.pages.findIndex((p) => p.id === s.activePageId);
    activePageId = next.pages[Math.min(Math.max(wasAt, 0), next.pages.length - 1)].id;
  }
  const masterEditingId =
    s.masterEditingId && next.masters.some((m) => m.id === s.masterEditingId)
      ? s.masterEditingId
      : null;
  return { activePageId, masterEditingId };
}

function applyTransform(o: LayoutObject, patch: TransformPatch): LayoutObject {
  if (o.type === "line") {
    return {
      ...o,
      x1: patch.x1 ?? o.x1,
      y1: patch.y1 ?? o.y1,
      x2: patch.x2 ?? o.x2,
      y2: patch.y2 ?? o.y2,
    };
  }
  return {
    ...o,
    x: patch.x ?? o.x,
    y: patch.y ?? o.y,
    w: Math.max(MIN_OBJECT_IN, patch.w ?? o.w),
    h: Math.max(MIN_OBJECT_IN, patch.h ?? o.h),
    rotation: patch.rotation !== undefined ? normalizeAngle(patch.rotation) : o.rotation,
  };
}

function applyTextProps(o: LayoutObject, patch: TextPropsPatch): LayoutObject {
  if (o.type !== "text" || !o.text) return o;
  return { ...o, text: applyToAllRuns(o.text, patch) };
}

function applyProps(o: LayoutObject, patch: ObjectPropsPatch): LayoutObject {
  if (o.type === "line") {
    // a line always keeps a stroke (schema) — fill and stroke-none don't apply
    return patch.stroke ? { ...o, stroke: patch.stroke } : o;
  }
  return {
    ...o,
    ...(patch.fill !== undefined ? { fill: patch.fill } : {}),
    ...(patch.stroke !== undefined ? { stroke: patch.stroke } : {}),
  };
}

/** The pristine document — Letter, wire defaults, master A applied (§3.4). */
export function createDefaultDocument(): LayoutDocument {
  return {
    version: 2,
    name: "Untitled publication",
    product: null,
    size: { w: 8.5, h: 11 },
    orientation: "portrait",
    bleed: 0.125,
    margin: 0.5,
    columns: 1,
    pages: [{ id: "page-1", masterId: "master-a", objects: [] }],
    masters: [
      { id: "master-a", label: "A", objects: [] },
      { id: "master-b", label: "B", objects: [] },
    ],
    assets: {},
    guides: { v: [], h: [] },
  };
}

export interface LayoutEditorState {
  // UI toggles (prototype names)
  ribbon: RibbonTab;
  tool: EditorTool;
  insp: InspectorTab;
  pages: PagesPaneView;

  // side panel (session, plan L8)
  panelTab: PanelTab;
  panelOpen: boolean;

  // document (persisted) + session pointers
  doc: LayoutDocument;
  activePageId: string;
  masterEditingId: string | null;

  // selection (session)
  selectedIds: string[];
  /** The selected ruler guide (plan L11) — mutually exclusive with object
      selection so Delete is unambiguous; null when none is selected. */
  selectedGuide: { axis: "v" | "h"; index: number } | null;
  /** Text frame with the contentEditable overlay open (plan L5). */
  editingTextId: string | null;
  /** Bumped when lazily-loaded webfonts finish (§10.5) — text frames
      re-measure overflow against the real metrics. Session-only. */
  fontsTick: number;
  /** Align tab's "Relative to" choice (plan L7) — session UI, not persisted. */
  alignRel: AlignRelativeTo;

  // history (session): bounded per-gesture snapshots of the document slice
  past: LayoutDocument[];
  future: LayoutDocument[];

  // clipboard (session, plan L13): copied objects survive page/master
  // navigation and are never persisted; pasteCount cascades repeated pastes
  // and resets on the next copy/cut.
  clipboard: LayoutObject[];
  pasteCount: number;

  // experience (persisted; switching arrives in L14 — two levels since v1.3)
  level: ExperienceLevel;
  // display unit (persisted, L11) — presentation only, geometry stays inches
  unit: Unit;

  // viewport (session)
  /** CanvasViewport replaces this with the computed fit on mount (§3.5). */
  zoom: number;
  pan: { x: number; y: number };
  guidesVisible: boolean;
  /** Two-page spread view (plan L12) — session-only, Publisher pairing. */
  spread: boolean;
  /** Where the Page tab's size edits land (plan L12) — session UI, not the file. */
  pageSizeScope: PageSizeScope;
  /** Bumped by page-geometry mutations — CanvasViewport re-fits when it moves. */
  fitRequestId: number;
  /** One-shot deep-link cue (`/layout?custom=1`): focus the Page tab's width field. */
  focusPageSize: boolean;

  /** Last `.pub` import's fidelity report (session, plan §10.4) — the P4
      report panel reads it; P1 keeps it for the status-bar summary. */
  importReport: ImportReport | null;

  setRibbon: (ribbon: RibbonTab) => void;
  setTool: (tool: EditorTool) => void;
  setInsp: (insp: InspectorTab) => void;
  setPages: (pages: PagesPaneView) => void;
  /** Open the side panel to a tab; clicking the open tab collapses it (L8). */
  togglePanelTab: (tab: PanelTab) => void;

  // page setup
  setName: (name: string) => void;
  /** Applies preset dimensions, keeping the document's current orientation. */
  applyPreset: (presetId: string) => void;
  /** Clamps to the size bounds and derives orientation from the shape. */
  setPageSize: (w: number, h: number) => void;
  /** Changing orientation swaps the effective dimensions. */
  setOrientation: (orientation: Orientation) => void;
  setBleed: (bleed: number) => void;
  setMargin: (margin: number) => void;
  setColumns: (columns: number) => void;
  setUnit: (unit: Unit) => void;
  /** Which target the Page tab's size controls edit (plan L12). */
  setPageSizeScope: (scope: PageSizeScope) => void;
  /** Pin the active page to its own size (plan L12) — clamps, one undo step, re-fits. */
  setActivePageSize: (w: number, h: number) => void;
  /** Drop the active page's override so it follows the document size again (L12). */
  clearActivePageSize: () => void;

  // ruler guides (plan L11) — document data, undoable, persisted
  /** Drop a new guide at a page-inch position; one undo step. */
  addGuide: (axis: "v" | "h", at: number) => void;
  /** Reposition guide `index`; `transient` skips history (live drag). */
  setGuide: (axis: "v" | "h", index: number, at: number, transient?: boolean) => void;
  /** Remove guide `index` (dragged back onto the ruler). */
  removeGuide: (axis: "v" | "h", index: number) => void;

  // pages & masters (plan L6)
  /** Inserts a blank page after the active one, inheriting its master. */
  addPage: () => void;
  /** Guarded — a publication keeps at least one page. */
  removePage: (id: string) => void;
  /** Session navigation, not an undo step; ends master editing. */
  setActivePage: (id: string) => void;
  applyMaster: (pageId: string, masterId: string | null) => void;
  /** Blank master with the next free letter, opened for editing (Publisher behavior). */
  addMaster: () => void;
  /** Session-only: the canvas edits this master instead of the active page. */
  setMasterEditing: (id: string | null) => void;

  // viewport
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setPan: (pan: { x: number; y: number }) => void;
  toggleGuides: () => void;
  /** Two-page spread view on/off (plan L12) — session-only. */
  setSpread: (spread: boolean) => void;
  setFocusPageSize: (v: boolean) => void;

  // selection & objects (the editing surface — active page or edited master)
  setSelection: (ids: string[]) => void;
  /** Select a ruler guide (or clear with null); clears object selection so the
      two never coexist (plan L11). */
  selectGuide: (sel: { axis: "v" | "h"; index: number } | null) => void;
  /** Shift-click: add/remove one object, keeping the rest (plan L7). */
  toggleSelected: (id: string) => void;
  /** Replace the surface's object array wholesale — group drags write this
      transiently from the gesture's start array; commitGesture closes them. */
  setSurfaceObjects: (objects: LayoutObject[], transient?: boolean) => void;
  setAlignRel: (v: AlignRelativeTo) => void;
  /** Align the selection to the page box or the selection union (plan L7). */
  alignSelection: (kind: AlignKind) => void;
  /** Equal-gap distribution — needs three or more objects. */
  distributeSelection: (axis: DistributeAxis) => void;
  setEditingText: (id: string | null) => void;
  bumpFontsTick: () => void;
  /** Typing is transient — the edit session commits one snapshot at close.
      The overlay parses its DOM to paragraphs (schema v2) and writes them whole. */
  setTextParagraphs: (id: string, paragraphs: Paragraph[]) => void;
  /** Styling clicks are discrete input commits — each pushes history. */
  setTextProps: (id: string, patch: TextPropsPatch) => void;
  /** Appends, selects, and returns the tool to Select (Publisher behavior). */
  addObject: (obj: LayoutObject) => void;
  /** Geometry edit; `transient` skips history (live drags — commitGesture ends them). */
  transformObject: (id: string, patch: TransformPatch, transient?: boolean) => void;
  setObjectProps: (id: string, patch: ObjectPropsPatch) => void;
  deleteSelection: () => void;
  /** Copies land 0.25 in right+down and become the selection. */
  duplicateSelection: () => void;
  /** Copy the selection to the session clipboard (plan L13) — not an undo step. */
  copySelection: () => void;
  /** Cut = copy the selection, then delete it, in one undo step (plan L13). */
  cutSelection: () => void;
  /** Paste the clipboard onto the current surface — fresh ids, cascading offset,
      selects the pasted objects; one undo step (plan L13). */
  pasteClipboard: () => void;
  /** Step selection up/down the z-order, or jump it to the very front/back (Arrange, L10). */
  reorder: (dir: "forward" | "backward" | "front" | "back") => void;
  /** Move one object to an absolute z-index on the surface (Layers drag, L8). */
  reorderObject: (id: string, to: number) => void;
  /** Rotate every selected frame 90° left/right, or reset to 0 (Arrange, L10). */
  rotateSelection: (kind: "left" | "right" | "reset") => void;
  nudgeSelection: (dx: number, dy: number) => void;

  // asset library (plan L8) — document data, deliberately not an undo step;
  // undo/redo carry the current library forward (see undo/redo)
  addAsset: (asset: Asset) => void;
  /** Drops metadata + bytes; placed frames keep the id and show the missing state. */
  removeAsset: (id: string) => void;
  /** Image assets only: bind to the selected picture frame, else place centered. */
  placeAsset: (id: string) => void;
  /** Bind an existing library asset to a specific picture frame (L9 fill/drag-in);
      one undo step, guarded — undo reverts the binding, the asset stays in the library. */
  bindAsset: (frameId: string, assetId: string) => void;

  // history
  /** Push the pre-gesture snapshot, once, if the gesture changed the doc. */
  commitGesture: (before: LayoutDocument) => void;
  undo: () => void;
  redo: () => void;

  /** Start over: pristine document, guides on, view re-fit. */
  resetDoc: () => void;

  /** Open a converted `.pub` (plan §10.7 seam #2 — the ONLY way import
      results enter the editor). Replaces the working document wholesale,
      exactly like resetDoc, and stashes the fidelity report. The doc must
      already be schema-validated (client.ts does). */
  openImportedDocument: (
    doc: LayoutDocument,
    report: ImportReport,
    blobs?: Record<string, Blob>,
  ) => void;
  /** Record the imported text frames that overflow their boxes (P4 overset
      check, §10.4). Writes `importReport.overset`; a non-empty result opens
      the import report panel so the associate sees what to review. No-op when
      there's no active import report. */
  setImportOverset: (objectIds: string[]) => void;
}

// SSR/tests have no localStorage — persistence becomes a silent no-op there.
const noopStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

export const useLayoutStore = create<LayoutEditorState>()(
  persist(
    (set) => ({
      // Prototype defaults: Home ribbon, Select tool, Page inspector tab, Pages view.
      ribbon: "home",
      tool: "select",
      insp: "page",
      pages: "pages",
      panelTab: "pages",
      panelOpen: true,

      doc: createDefaultDocument(),
      activePageId: "page-1",
      masterEditingId: null,
      level: "standard",
      unit: "in",

      selectedIds: [],
      selectedGuide: null,
      editingTextId: null,
      fontsTick: 0,
      alignRel: "page",
      past: [],
      future: [],
      clipboard: [],
      pasteCount: 0,

      zoom: 1,
      pan: { x: 0, y: 0 },
      guidesVisible: true,
      spread: false,
      pageSizeScope: "document",
      fitRequestId: 0,
      focusPageSize: false,
      importReport: null,

      setRibbon: (ribbon) => set({ ribbon }),
      // Switching tools ends a text-editing session (the overlay commits on unmount)
      setTool: (tool) => set({ tool, editingTextId: null }),
      setInsp: (insp) => set({ insp }),
      setPages: (pages) => set({ pages }),

      togglePanelTab: (tab) =>
        set((s) =>
          s.panelOpen && s.panelTab === tab
            ? { panelOpen: false }
            : { panelOpen: true, panelTab: tab },
        ),

      // Name typing is per-keystroke — kept out of the undo history so it
      // doesn't flood the gesture-grained stack.
      setName: (name) => set((s) => ({ doc: { ...s.doc, name } })),

      applyPreset: (presetId) => {
        const preset = getPreset(presetId);
        if (!preset) return;
        set((s) => {
          const landscape = s.doc.orientation === "landscape";
          const size = landscape ? { w: preset.h, h: preset.w } : { w: preset.w, h: preset.h };
          if (size.w === s.doc.size.w && size.h === s.doc.size.h) return s;
          return {
            ...pushed(s, s.doc),
            doc: { ...s.doc, size },
            fitRequestId: s.fitRequestId + 1,
          };
        });
      },

      setPageSize: (w, h) =>
        set((s) => {
          const cw = clampPageDim(w);
          const ch = clampPageDim(h);
          if (cw === s.doc.size.w && ch === s.doc.size.h) return s;
          const orientation: Orientation =
            cw === ch ? s.doc.orientation : cw > ch ? "landscape" : "portrait";
          return {
            ...pushed(s, s.doc),
            doc: { ...s.doc, size: { w: cw, h: ch }, orientation },
            fitRequestId: s.fitRequestId + 1,
          };
        }),

      setOrientation: (orientation) =>
        set((s) => {
          if (s.doc.orientation === orientation) return s;
          return {
            ...pushed(s, s.doc),
            doc: {
              ...s.doc,
              orientation,
              size: { w: s.doc.size.h, h: s.doc.size.w },
            },
            fitRequestId: s.fitRequestId + 1,
          };
        }),

      setBleed: (bleed) =>
        set((s) => {
          const next = Math.min(0.5, Math.max(0, bleed));
          if (next === s.doc.bleed) return s;
          return { ...pushed(s, s.doc), doc: { ...s.doc, bleed: next } };
        }),

      setMargin: (margin) =>
        set((s) => {
          const max = Math.min(s.doc.size.w, s.doc.size.h) / 2;
          const next = Math.min(max, Math.max(0, margin));
          if (next === s.doc.margin) return s;
          return { ...pushed(s, s.doc), doc: { ...s.doc, margin: next } };
        }),

      setColumns: (columns) =>
        set((s) => {
          const next = Math.min(6, Math.max(1, Math.round(columns)));
          if (next === s.doc.columns) return s;
          return { ...pushed(s, s.doc), doc: { ...s.doc, columns: next } };
        }),

      setUnit: (unit) => set({ unit }),

      setPageSizeScope: (scope) => set({ pageSizeScope: scope }),

      // Per-page size override (plan L12) — targets the active page (never a
      // master; masters always follow the document size). Same undo + re-fit
      // contract as the document-level setPageSize.
      setActivePageSize: (w, h) =>
        set((s) => {
          const cw = clampPageDim(w);
          const ch = clampPageDim(h);
          const page = s.doc.pages.find((p) => p.id === s.activePageId);
          if (!page) return s;
          if (page.sizeOverride && page.sizeOverride.w === cw && page.sizeOverride.h === ch) {
            return s;
          }
          return {
            ...pushed(s, s.doc),
            doc: {
              ...s.doc,
              pages: s.doc.pages.map((p) =>
                p.id === s.activePageId ? { ...p, sizeOverride: { w: cw, h: ch } } : p,
              ),
            },
            fitRequestId: s.fitRequestId + 1,
          };
        }),

      clearActivePageSize: () =>
        set((s) => {
          const page = s.doc.pages.find((p) => p.id === s.activePageId);
          if (!page || !page.sizeOverride) return s;
          return {
            ...pushed(s, s.doc),
            doc: {
              ...s.doc,
              pages: s.doc.pages.map((p) => {
                if (p.id !== s.activePageId) return p;
                // strip the optional key entirely so the page matches a pristine one
                const { sizeOverride: _drop, ...rest } = p;
                void _drop;
                return rest;
              }),
            },
            fitRequestId: s.fitRequestId + 1,
          };
        }),

      addGuide: (axis, at) =>
        set((s) => ({
          ...pushed(s, s.doc),
          doc: { ...s.doc, guides: { ...s.doc.guides, [axis]: [...s.doc.guides[axis], at] } },
        })),

      setGuide: (axis, index, at, transient = false) =>
        set((s) => {
          const arr = s.doc.guides[axis];
          if (index < 0 || index >= arr.length || arr[index] === at) return s;
          const nextArr = arr.map((v, i) => (i === index ? at : v));
          const doc = { ...s.doc, guides: { ...s.doc.guides, [axis]: nextArr } };
          return transient ? { doc } : { ...pushed(s, s.doc), doc };
        }),

      removeGuide: (axis, index) =>
        set((s) => {
          const arr = s.doc.guides[axis];
          if (index < 0 || index >= arr.length) return s;
          // clear the selection — the surviving guides' indices shift under it
          return {
            ...pushed(s, s.doc),
            doc: { ...s.doc, guides: { ...s.doc.guides, [axis]: arr.filter((_, i) => i !== index) } },
            selectedGuide: null,
          };
        }),

      addPage: () =>
        set((s) => {
          const at = Math.max(
            s.doc.pages.findIndex((p) => p.id === s.activePageId),
            0,
          );
          const page = {
            id: crypto.randomUUID(),
            masterId: s.doc.pages[at]?.masterId ?? null,
            objects: [],
          };
          return {
            ...pushed(s, s.doc),
            doc: {
              ...s.doc,
              pages: [...s.doc.pages.slice(0, at + 1), page, ...s.doc.pages.slice(at + 1)],
            },
            activePageId: page.id,
            masterEditingId: null,
            selectedIds: [],
            editingTextId: null,
          };
        }),

      removePage: (id) =>
        set((s) => {
          if (s.doc.pages.length <= 1) return s;
          const at = s.doc.pages.findIndex((p) => p.id === id);
          if (at < 0) return s;
          const pages = s.doc.pages.filter((p) => p.id !== id);
          const removingActive = s.activePageId === id;
          return {
            ...pushed(s, s.doc),
            doc: { ...s.doc, pages },
            // the neighbor that slid into the removed page's slot takes over
            activePageId: removingActive
              ? pages[Math.min(at, pages.length - 1)].id
              : s.activePageId,
            ...(removingActive ? { selectedIds: [], editingTextId: null } : {}),
          };
        }),

      setActivePage: (id) =>
        set((s) => {
          if (!s.doc.pages.some((p) => p.id === id)) return s;
          if (id === s.activePageId && !s.masterEditingId) return s;
          return { activePageId: id, masterEditingId: null, selectedIds: [], editingTextId: null };
        }),

      applyMaster: (pageId, masterId) =>
        set((s) => {
          const page = s.doc.pages.find((p) => p.id === pageId);
          if (!page || page.masterId === masterId) return s;
          if (masterId !== null && !s.doc.masters.some((m) => m.id === masterId)) return s;
          return {
            ...pushed(s, s.doc),
            doc: {
              ...s.doc,
              pages: s.doc.pages.map((p) => (p.id === pageId ? { ...p, masterId } : p)),
            },
          };
        }),

      addMaster: () =>
        set((s) => {
          const used = new Set(s.doc.masters.map((m) => m.label));
          let label = `M${s.doc.masters.length + 1}`;
          for (let i = 0; i < 26; i++) {
            const letter = String.fromCharCode(65 + i);
            if (!used.has(letter)) {
              label = letter;
              break;
            }
          }
          const master: MasterPage = { id: crypto.randomUUID(), label, objects: [] };
          return {
            ...pushed(s, s.doc),
            doc: { ...s.doc, masters: [...s.doc.masters, master] },
            masterEditingId: master.id,
            selectedIds: [],
            editingTextId: null,
          };
        }),

      setMasterEditing: (id) =>
        set((s) => {
          if (id === s.masterEditingId) return s;
          if (id !== null && !s.doc.masters.some((m) => m.id === id)) return s;
          return { masterEditingId: id, selectedIds: [], editingTextId: null };
        }),

      setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
      zoomIn: () => set((s) => ({ zoom: zoomInStep(s.zoom) })),
      zoomOut: () => set((s) => ({ zoom: zoomOutStep(s.zoom) })),
      setPan: (pan) => set({ pan }),
      toggleGuides: () => set((s) => ({ guidesVisible: !s.guidesVisible })),
      // toggling the view re-fits so the spread (or the lone page) lands framed
      setSpread: (spread) =>
        set((s) => (s.spread === spread ? s : { spread, fitRequestId: s.fitRequestId + 1 })),
      setFocusPageSize: (v) => set({ focusPageSize: v }),

      setSelection: (ids) => set({ selectedIds: ids, selectedGuide: null }),

      selectGuide: (sel) =>
        set(sel ? { selectedGuide: sel, selectedIds: [], editingTextId: null } : { selectedGuide: null }),

      toggleSelected: (id) =>
        set((s) => ({
          selectedIds: s.selectedIds.includes(id)
            ? s.selectedIds.filter((i) => i !== id)
            : [...s.selectedIds, id],
          selectedGuide: null,
          // adjusting the selection ends a text session, like any other grab
          editingTextId: null,
        })),

      setSurfaceObjects: (objects, transient = false) =>
        set((s) => {
          const doc = mapSurfaceObjects(s, () => objects);
          return transient ? { doc } : { ...pushed(s, s.doc), doc };
        }),

      setAlignRel: (v) => set({ alignRel: v }),

      alignSelection: (kind) =>
        set((s) => {
          const objs = surfaceObjects(s);
          const selSet = new Set(s.selectedIds);
          const sel = objs.filter((o) => selSet.has(o.id));
          if (sel.length < (s.alignRel === "selection" ? 2 : 1)) return s;
          const ref =
            s.alignRel === "page"
              ? { x: 0, y: 0, w: s.doc.size.w, h: s.doc.size.h }
              : unionBBox(sel)!;
          const moved = new Map(alignObjects(sel, kind, ref).map((o) => [o.id, o]));
          const next = objs.map((o) => moved.get(o.id) ?? o);
          if (JSON.stringify(next) === JSON.stringify(objs)) return s;
          return { ...pushed(s, s.doc), doc: mapSurfaceObjects(s, () => next) };
        }),

      distributeSelection: (axis) =>
        set((s) => {
          const objs = surfaceObjects(s);
          const selSet = new Set(s.selectedIds);
          const sel = objs.filter((o) => selSet.has(o.id));
          if (sel.length < 3) return s;
          const ref =
            s.alignRel === "page"
              ? { x: 0, y: 0, w: s.doc.size.w, h: s.doc.size.h }
              : unionBBox(sel)!;
          const moved = new Map(distributeObjects(sel, axis, ref).map((o) => [o.id, o]));
          const next = objs.map((o) => moved.get(o.id) ?? o);
          if (JSON.stringify(next) === JSON.stringify(objs)) return s;
          return { ...pushed(s, s.doc), doc: mapSurfaceObjects(s, () => next) };
        }),

      setEditingText: (id) => set({ editingTextId: id }),

      bumpFontsTick: () => set((s) => ({ fontsTick: s.fontsTick + 1 })),

      setTextParagraphs: (id, paragraphs) =>
        set((s) => ({
          doc: mapSurfaceObjects(s, (objs) =>
            objs.map((o) =>
              o.id === id && o.type === "text" && o.text
                ? { ...o, text: { ...o.text, paragraphs } }
                : o,
            ),
          ),
        })),

      setTextProps: (id, patch) =>
        set((s) => {
          const target = surfaceObjects(s).find((o) => o.id === id);
          if (!target || target.type !== "text" || !target.text) return s;
          const next = applyTextProps(target, patch);
          if (JSON.stringify(next) === JSON.stringify(target)) return s;
          return {
            ...pushed(s, s.doc),
            doc: mapSurfaceObjects(s, (objs) => objs.map((o) => (o.id === id ? next : o))),
          };
        }),

      addObject: (obj) =>
        set((s) => ({
          ...pushed(s, s.doc),
          doc: mapSurfaceObjects(s, (objs) => [...objs, obj]),
          selectedIds: [obj.id],
          // Publisher behavior: a completed draw returns to Select
          tool: "select",
        })),

      transformObject: (id, patch, transient = false) =>
        set((s) => {
          const doc = mapSurfaceObjects(s, (objs) =>
            objs.map((o) => (o.id === id ? applyTransform(o, patch) : o)),
          );
          return transient ? { doc } : { ...pushed(s, s.doc), doc };
        }),

      setObjectProps: (id, patch) =>
        set((s) => ({
          ...pushed(s, s.doc),
          doc: mapSurfaceObjects(s, (objs) =>
            objs.map((o) => (o.id === id ? applyProps(o, patch) : o)),
          ),
        })),

      deleteSelection: () =>
        set((s) => {
          if (!s.selectedIds.length) return s;
          const drop = new Set(s.selectedIds);
          return {
            ...pushed(s, s.doc),
            doc: mapSurfaceObjects(s, (objs) => objs.filter((o) => !drop.has(o.id))),
            selectedIds: [],
            editingTextId:
              s.editingTextId && drop.has(s.editingTextId) ? null : s.editingTextId,
          };
        }),

      duplicateSelection: () =>
        set((s) => {
          if (!s.selectedIds.length) return s;
          const sel = new Set(s.selectedIds);
          const copies = surfaceObjects(s)
            .filter((o) => sel.has(o.id))
            .map((o) => ({
              ...translated(o, DUPLICATE_OFFSET_IN, DUPLICATE_OFFSET_IN),
              id: crypto.randomUUID(),
            }));
          if (!copies.length) return s;
          return {
            ...pushed(s, s.doc),
            doc: mapSurfaceObjects(s, (objs) => [...objs, ...copies]),
            selectedIds: copies.map((c) => c.id),
          };
        }),

      copySelection: () =>
        set((s) => {
          if (!s.selectedIds.length) return s;
          const sel = new Set(s.selectedIds);
          const picked = surfaceObjects(s).filter((o) => sel.has(o.id));
          if (!picked.length) return s;
          // copy doesn't touch the document — no history push; reset the cascade
          return { clipboard: picked, pasteCount: 0 };
        }),

      cutSelection: () =>
        set((s) => {
          if (!s.selectedIds.length) return s;
          const sel = new Set(s.selectedIds);
          const picked = surfaceObjects(s).filter((o) => sel.has(o.id));
          if (!picked.length) return s;
          // copy + delete land in one undo step
          return {
            ...pushed(s, s.doc),
            clipboard: picked,
            pasteCount: 0,
            doc: mapSurfaceObjects(s, (objs) => objs.filter((o) => !sel.has(o.id))),
            selectedIds: [],
            editingTextId:
              s.editingTextId && sel.has(s.editingTextId) ? null : s.editingTextId,
          };
        }),

      pasteClipboard: () =>
        set((s) => {
          if (!s.clipboard.length) return s;
          // cascade: each paste steps one duplicate-offset further than the last
          const k = s.pasteCount + 1;
          const off = DUPLICATE_OFFSET_IN * k;
          const copies = s.clipboard.map((o) => ({
            ...translated(o, off, off),
            id: crypto.randomUUID(), // fresh ids; a picture keeps its assetId via the spread
          }));
          return {
            ...pushed(s, s.doc),
            // lands on the current editing surface — master or active page (L6)
            doc: mapSurfaceObjects(s, (objs) => [...objs, ...copies]),
            selectedIds: copies.map((c) => c.id),
            pasteCount: k,
          };
        }),

      reorderObject: (id, to) =>
        set((s) => {
          const objs = surfaceObjects(s);
          const from = objs.findIndex((o) => o.id === id);
          if (from < 0) return s;
          const target = Math.max(0, Math.min(objs.length - 1, Math.round(to)));
          if (target === from) return s;
          const next = [...objs];
          const [moved] = next.splice(from, 1);
          next.splice(target, 0, moved);
          return { ...pushed(s, s.doc), doc: mapSurfaceObjects(s, () => next) };
        }),

      addAsset: (asset) =>
        set((s) => ({
          doc: { ...s.doc, assets: { ...s.doc.assets, [asset.id]: asset } },
        })),

      removeAsset: (id) =>
        set((s) => {
          if (!s.doc.assets[id]) return s;
          const assets = { ...s.doc.assets };
          delete assets[id];
          void deleteAssetBlob(id); // bytes go with the metadata
          return { doc: { ...s.doc, assets } };
        }),

      placeAsset: (id) =>
        set((s) => {
          const asset = s.doc.assets[id];
          // PDFs are library-only until the print pipeline can rasterize (L8)
          if (!asset || asset.kind !== "image") return s;
          // a single selected picture frame takes the image instead of a new frame
          const sel =
            s.selectedIds.length === 1
              ? surfaceObjects(s).find((o) => o.id === s.selectedIds[0])
              : undefined;
          if (sel && sel.type === "picture") {
            if (sel.assetId === id) return s;
            return {
              ...pushed(s, s.doc),
              doc: mapSurfaceObjects(s, (objs) =>
                objs.map((o) => (o.id === sel.id ? { ...o, assetId: id } : o)),
              ),
            };
          }
          const obj = createPlacedPicture(
            asset,
            placedPictureRect(asset.width, asset.height, s.doc),
          );
          return {
            ...pushed(s, s.doc),
            doc: mapSurfaceObjects(s, (objs) => [...objs, obj]),
            selectedIds: [obj.id],
            tool: "select",
          };
        }),

      bindAsset: (frameId, assetId) =>
        set((s) => {
          const frame = surfaceObjects(s).find((o) => o.id === frameId);
          if (!frame || frame.type !== "picture") return s;
          if (!s.doc.assets[assetId] || frame.assetId === assetId) return s;
          return {
            ...pushed(s, s.doc),
            doc: mapSurfaceObjects(s, (objs) =>
              objs.map((o) => (o.id === frameId ? { ...o, assetId } : o)),
            ),
            selectedIds: [frameId],
          };
        }),

      reorder: (dir) =>
        set((s) => {
          if (!s.selectedIds.length) return s;
          const current = surfaceObjects(s);
          const sel = new Set(s.selectedIds);
          let next: LayoutObject[];
          if (dir === "front" || dir === "back") {
            // z-order is array order — lift the selection out and re-slot it,
            // keeping the selected items' relative order
            const picked = current.filter((o) => sel.has(o.id));
            const rest = current.filter((o) => !sel.has(o.id));
            next = dir === "front" ? [...rest, ...picked] : [...picked, ...rest];
          } else {
            next = [...current];
            if (dir === "forward") {
              // swap selected items toward the top
              for (let i = next.length - 2; i >= 0; i--) {
                if (sel.has(next[i].id) && !sel.has(next[i + 1].id)) {
                  [next[i], next[i + 1]] = [next[i + 1], next[i]];
                }
              }
            } else {
              for (let i = 1; i < next.length; i++) {
                if (sel.has(next[i].id) && !sel.has(next[i - 1].id)) {
                  [next[i], next[i - 1]] = [next[i - 1], next[i]];
                }
              }
            }
          }
          if (next.every((o, i) => o === current[i])) return s; // already at the edge
          return {
            ...pushed(s, s.doc),
            doc: mapSurfaceObjects(s, () => next),
          };
        }),

      rotateSelection: (kind) =>
        set((s) => {
          if (!s.selectedIds.length) return s;
          const sel = new Set(s.selectedIds);
          const delta = kind === "left" ? -90 : kind === "right" ? 90 : 0;
          let changed = false;
          const doc = mapSurfaceObjects(s, (objs) =>
            objs.map((o) => {
              if (!sel.has(o.id) || o.type === "line") return o; // lines have no rotation
              const next = kind === "reset" ? 0 : normalizeAngle(o.rotation + delta);
              if (next === o.rotation) return o;
              changed = true;
              return { ...o, rotation: next };
            }),
          );
          if (!changed) return s;
          return { ...pushed(s, s.doc), doc };
        }),

      nudgeSelection: (dx, dy) =>
        set((s) => {
          if (!s.selectedIds.length) return s;
          const sel = new Set(s.selectedIds);
          return {
            ...pushed(s, s.doc),
            doc: mapSurfaceObjects(s, (objs) =>
              objs.map((o) => (sel.has(o.id) ? translated(o, dx, dy) : o)),
            ),
          };
        }),

      commitGesture: (before) =>
        set((s) =>
          s.doc === before
            ? s
            : { past: [...s.past, before].slice(-HISTORY_CAP), future: [] },
        ),

      undo: () =>
        set((s) => {
          const prev = s.past[s.past.length - 1];
          if (!prev) return s;
          const surface = resolveSurface(s, prev);
          const target = { doc: prev, ...surface };
          return {
            past: s.past.slice(0, -1),
            future: [s.doc, ...s.future].slice(0, HISTORY_CAP),
            // the asset library is not an undo step — the current one carries forward
            doc: { ...prev, assets: s.doc.assets },
            ...surface,
            selectedIds: pruneSelection(s.selectedIds, target),
            editingTextId:
              s.editingTextId && pruneSelection([s.editingTextId], target).length
                ? s.editingTextId
                : null,
          };
        }),

      redo: () =>
        set((s) => {
          const next = s.future[0];
          if (!next) return s;
          const surface = resolveSurface(s, next);
          const target = { doc: next, ...surface };
          return {
            past: [...s.past, s.doc].slice(-HISTORY_CAP),
            future: s.future.slice(1),
            doc: { ...next, assets: s.doc.assets },
            ...surface,
            selectedIds: pruneSelection(s.selectedIds, target),
            editingTextId:
              s.editingTextId && pruneSelection([s.editingTextId], target).length
                ? s.editingTextId
                : null,
          };
        }),

      resetDoc: () =>
        set((s) => {
          void clearAssetBlobs(); // the library resets with the document
          return {
            doc: createDefaultDocument(),
            activePageId: "page-1",
            masterEditingId: null,
            guidesVisible: true,
            spread: false,
            pageSizeScope: "document",
            pan: { x: 0, y: 0 },
            selectedIds: [],
            editingTextId: null,
            past: [],
            future: [],
            clipboard: [],
            pasteCount: 0,
            fitRequestId: s.fitRequestId + 1,
            importReport: null,
          };
        }),

      openImportedDocument: (doc, report, blobs) =>
        set((s) => {
          // Seed the extracted image bytes (P3) as the library resets with the
          // document; a P1-era import carries none, so an absent set just clears.
          void replaceAssetBlobs(blobs ?? {});
          // Open the import report panel (P4) when there's anything to review —
          // font remaps, degradations/flags, or notes; a clean import leaves
          // the panel as it was. Overset arrives async (setImportOverset) and
          // opens the panel later if it finds anything.
          const worthReviewing =
            report.fonts.length > 0 ||
            report.notes.length > 0 ||
            report.fidelity.degraded + report.fidelity.flagged > 0;
          return {
            doc,
            activePageId: doc.pages[0]?.id ?? "page-1",
            masterEditingId: null,
            guidesVisible: true,
            spread: false,
            pageSizeScope: "document",
            pan: { x: 0, y: 0 },
            selectedIds: [],
            selectedGuide: null,
            editingTextId: null,
            past: [],
            future: [],
            clipboard: [],
            pasteCount: 0,
            fitRequestId: s.fitRequestId + 1,
            importReport: report,
            ...(worthReviewing ? { panelTab: "import" as const, panelOpen: true } : {}),
          };
        }),

      setImportOverset: (objectIds) =>
        set((s) => {
          if (!s.importReport) return s;
          return {
            importReport: { ...s.importReport, overset: objectIds },
            ...(objectIds.length ? { panelTab: "import" as const, panelOpen: true } : {}),
          };
        }),
    }),
    {
      // CONTRACT: the storage key + LayoutDocumentSchema are the saved-file
      // format — a real backend persists the same shape per publication.
      // Key kept from v1 — changing it would orphan existing documents; the
      // merge below migrates their SHAPE (v1→v2, plan §9), which is the part
      // that versions. The zustand-level version stays 1 for the same reason.
      name: "stp-layout-v1",
      // PROD-TODO: a failed write (quota, private mode) only logs —
      // production needs a visible "not saved" state.
      version: 1,
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? noopStorage : window.localStorage,
      ),
      // SSR and the first client render use the pristine document; the
      // StoreHydrator rehydrates after mount so server and client markup match.
      skipHydration: true,
      // Only the file + experience level + display unit persist (§3.3, L11) —
      // selection, history, and viewport stay session-scoped.
      partialize: (s) => ({ doc: s.doc, level: s.level, unit: s.unit }),
      // Validate what came out of storage — a corrupt or foreign-shaped doc
      // falls back to pristine instead of poisoning the editor. A v1 document
      // (pre-P2 per-frame text) MIGRATES to v2 (plan §9) — real migration,
      // not drop-and-reseed: associates' saved work keeps opening.
      merge: (persisted, current) => {
        const p = persisted as { doc?: unknown; level?: unknown; unit?: unknown } | undefined;
        let parsed = LayoutDocumentSchema.safeParse(p?.doc);
        if (!parsed.success) {
          const legacy = V1LayoutDocumentSchema.safeParse(p?.doc);
          if (legacy.success) {
            parsed = { success: true, data: migrateLegacyDocument(legacy.data) };
          }
        }
        // Only override from a *present, valid* persisted value; otherwise keep
        // `current`. Rehydration runs after mount, so forcing a default here
        // would clobber a preference the user changed in that window (and the
        // legacy v1.3 "pro" still coerces to "standard").
        const level: ExperienceLevel =
          p?.level === "simple" || p?.level === "standard"
            ? p.level
            : p?.level === "pro"
              ? "standard"
              : current.level;
        const unit: Unit = isUnit(p?.unit) ? p.unit : current.unit;
        if (!parsed.success) return { ...current, level, unit };
        return {
          ...current,
          level,
          unit,
          doc: parsed.data,
          activePageId: parsed.data.pages[0].id,
        };
      },
    },
  ),
);
