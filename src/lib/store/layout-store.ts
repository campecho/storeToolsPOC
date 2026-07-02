import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  LayoutDocumentSchema,
  type LayoutDocument,
  type LayoutObject,
  type Orientation,
  type Stroke,
} from "@/schema";
import {
  clampPageDim,
  clampZoom,
  zoomInStep,
  zoomOutStep,
} from "@/lib/layout/geometry";
import { getPreset } from "@/lib/layout/presets";
import { DUPLICATE_OFFSET_IN, MIN_OBJECT_IN, translated } from "@/lib/layout/objects";

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
 */

export type RibbonTab = "home" | "insert" | "layout" | "text";
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
export type ExperienceLevel = "simple" | "standard" | "pro";

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

/** Geometry-only edit to one object — frame x/y/w/h or line endpoints. */
export type TransformPatch = {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
};

export type ObjectPropsPatch = { fill?: string | null; stroke?: Stroke | null };

const HISTORY_CAP = 50;

/** Spread into a set() patch: push a snapshot, clear the redo stack. */
function pushed(s: Pick<LayoutEditorState, "past">, snapshot: LayoutDocument) {
  return { past: [...s.past, snapshot].slice(-HISTORY_CAP), future: [] as LayoutDocument[] };
}

function mapPageObjects(
  doc: LayoutDocument,
  pageId: string,
  fn: (objects: LayoutObject[]) => LayoutObject[],
): LayoutDocument {
  return {
    ...doc,
    pages: doc.pages.map((p) => (p.id === pageId ? { ...p, objects: fn(p.objects) } : p)),
  };
}

/** Selection filtered to objects that still exist (after undo/redo). */
function pruneSelection(ids: string[], doc: LayoutDocument, pageId: string): string[] {
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return [];
  const alive = new Set(page.objects.map((o) => o.id));
  return ids.filter((id) => alive.has(id));
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
  };
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
    version: 1,
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
  };
}

export interface LayoutEditorState {
  // UI toggles (prototype names)
  ribbon: RibbonTab;
  tool: EditorTool;
  insp: InspectorTab;
  pages: PagesPaneView;

  // document (persisted) + session pointers
  doc: LayoutDocument;
  activePageId: string;
  masterEditingId: string | null;

  // selection (session)
  selectedIds: string[];

  // history (session): bounded per-gesture snapshots of the document slice
  past: LayoutDocument[];
  future: LayoutDocument[];

  // experience (persisted; switching arrives in L8)
  level: ExperienceLevel;

  // viewport (session)
  /** CanvasViewport replaces this with the computed fit on mount (§3.5). */
  zoom: number;
  pan: { x: number; y: number };
  guidesVisible: boolean;
  /** Bumped by page-geometry mutations — CanvasViewport re-fits when it moves. */
  fitRequestId: number;
  /** One-shot deep-link cue (`/layout?custom=1`): focus the Page tab's width field. */
  focusPageSize: boolean;

  setRibbon: (ribbon: RibbonTab) => void;
  setTool: (tool: EditorTool) => void;
  setInsp: (insp: InspectorTab) => void;
  setPages: (pages: PagesPaneView) => void;

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

  // viewport
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setPan: (pan: { x: number; y: number }) => void;
  toggleGuides: () => void;
  setFocusPageSize: (v: boolean) => void;

  // selection & objects (active page)
  setSelection: (ids: string[]) => void;
  /** Appends, selects, and returns the tool to Select (Publisher behavior). */
  addObject: (obj: LayoutObject) => void;
  /** Geometry edit; `transient` skips history (live drags — commitGesture ends them). */
  transformObject: (id: string, patch: TransformPatch, transient?: boolean) => void;
  setObjectProps: (id: string, patch: ObjectPropsPatch) => void;
  deleteSelection: () => void;
  /** Copies land 0.25 in right+down and become the selection. */
  duplicateSelection: () => void;
  reorder: (dir: "forward" | "backward") => void;
  nudgeSelection: (dx: number, dy: number) => void;

  // history
  /** Push the pre-gesture snapshot, once, if the gesture changed the doc. */
  commitGesture: (before: LayoutDocument) => void;
  undo: () => void;
  redo: () => void;

  /** Start over: pristine document, guides on, view re-fit. */
  resetDoc: () => void;
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

      doc: createDefaultDocument(),
      activePageId: "page-1",
      masterEditingId: null,
      level: "standard",

      selectedIds: [],
      past: [],
      future: [],

      zoom: 1,
      pan: { x: 0, y: 0 },
      guidesVisible: true,
      fitRequestId: 0,
      focusPageSize: false,

      setRibbon: (ribbon) => set({ ribbon }),
      setTool: (tool) => set({ tool }),
      setInsp: (insp) => set({ insp }),
      setPages: (pages) => set({ pages }),

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

      setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
      zoomIn: () => set((s) => ({ zoom: zoomInStep(s.zoom) })),
      zoomOut: () => set((s) => ({ zoom: zoomOutStep(s.zoom) })),
      setPan: (pan) => set({ pan }),
      toggleGuides: () => set((s) => ({ guidesVisible: !s.guidesVisible })),
      setFocusPageSize: (v) => set({ focusPageSize: v }),

      setSelection: (ids) => set({ selectedIds: ids }),

      addObject: (obj) =>
        set((s) => ({
          ...pushed(s, s.doc),
          doc: mapPageObjects(s.doc, s.activePageId, (objs) => [...objs, obj]),
          selectedIds: [obj.id],
          // Publisher behavior: a completed draw returns to Select
          tool: "select",
        })),

      transformObject: (id, patch, transient = false) =>
        set((s) => {
          const doc = mapPageObjects(s.doc, s.activePageId, (objs) =>
            objs.map((o) => (o.id === id ? applyTransform(o, patch) : o)),
          );
          return transient ? { doc } : { ...pushed(s, s.doc), doc };
        }),

      setObjectProps: (id, patch) =>
        set((s) => ({
          ...pushed(s, s.doc),
          doc: mapPageObjects(s.doc, s.activePageId, (objs) =>
            objs.map((o) => (o.id === id ? applyProps(o, patch) : o)),
          ),
        })),

      deleteSelection: () =>
        set((s) => {
          if (!s.selectedIds.length) return s;
          const drop = new Set(s.selectedIds);
          return {
            ...pushed(s, s.doc),
            doc: mapPageObjects(s.doc, s.activePageId, (objs) =>
              objs.filter((o) => !drop.has(o.id)),
            ),
            selectedIds: [],
          };
        }),

      duplicateSelection: () =>
        set((s) => {
          const page = s.doc.pages.find((p) => p.id === s.activePageId);
          if (!page || !s.selectedIds.length) return s;
          const sel = new Set(s.selectedIds);
          const copies = page.objects
            .filter((o) => sel.has(o.id))
            .map((o) => ({
              ...translated(o, DUPLICATE_OFFSET_IN, DUPLICATE_OFFSET_IN),
              id: crypto.randomUUID(),
            }));
          if (!copies.length) return s;
          return {
            ...pushed(s, s.doc),
            doc: mapPageObjects(s.doc, s.activePageId, (objs) => [...objs, ...copies]),
            selectedIds: copies.map((c) => c.id),
          };
        }),

      reorder: (dir) =>
        set((s) => {
          const page = s.doc.pages.find((p) => p.id === s.activePageId);
          if (!page || !s.selectedIds.length) return s;
          const sel = new Set(s.selectedIds);
          const next = [...page.objects];
          if (dir === "forward") {
            // z-order is array order: swap selected items toward the top
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
          if (next.every((o, i) => o === page.objects[i])) return s; // already at the edge
          return {
            ...pushed(s, s.doc),
            doc: mapPageObjects(s.doc, s.activePageId, () => next),
          };
        }),

      nudgeSelection: (dx, dy) =>
        set((s) => {
          if (!s.selectedIds.length) return s;
          const sel = new Set(s.selectedIds);
          return {
            ...pushed(s, s.doc),
            doc: mapPageObjects(s.doc, s.activePageId, (objs) =>
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
          return {
            past: s.past.slice(0, -1),
            future: [s.doc, ...s.future].slice(0, HISTORY_CAP),
            doc: prev,
            selectedIds: pruneSelection(s.selectedIds, prev, s.activePageId),
          };
        }),

      redo: () =>
        set((s) => {
          const next = s.future[0];
          if (!next) return s;
          return {
            past: [...s.past, s.doc].slice(-HISTORY_CAP),
            future: s.future.slice(1),
            doc: next,
            selectedIds: pruneSelection(s.selectedIds, next, s.activePageId),
          };
        }),

      resetDoc: () =>
        set((s) => ({
          doc: createDefaultDocument(),
          activePageId: "page-1",
          masterEditingId: null,
          guidesVisible: true,
          pan: { x: 0, y: 0 },
          selectedIds: [],
          past: [],
          future: [],
          fitRequestId: s.fitRequestId + 1,
        })),
    }),
    {
      name: "stp-layout-v1",
      // Bumped when the persisted document shape changes beyond what the
      // schema-validating merge below can absorb.
      version: 1,
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? noopStorage : window.localStorage,
      ),
      // SSR and the first client render use the pristine document; the
      // StoreHydrator rehydrates after mount so server and client markup match.
      skipHydration: true,
      // Only the file + experience level persist (§3.3) — selection, history,
      // and viewport stay session-scoped.
      partialize: (s) => ({ doc: s.doc, level: s.level }),
      // Validate what came out of storage — a corrupt or foreign-shaped doc
      // falls back to pristine instead of poisoning the editor.
      merge: (persisted, current) => {
        const p = persisted as { doc?: unknown; level?: unknown } | undefined;
        const parsed = LayoutDocumentSchema.safeParse(p?.doc);
        const level: ExperienceLevel =
          p?.level === "simple" || p?.level === "pro" ? p.level : "standard";
        if (!parsed.success) return { ...current, level };
        return {
          ...current,
          level,
          doc: parsed.data,
          activePageId: parsed.data.pages[0].id,
        };
      },
    },
  ),
);
