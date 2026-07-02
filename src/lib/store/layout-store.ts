import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { LayoutDocumentSchema, type LayoutDocument, type Orientation } from "@/schema";
import {
  clampPageDim,
  clampZoom,
  zoomInStep,
  zoomOutStep,
} from "@/lib/layout/geometry";
import { getPreset } from "@/lib/layout/presets";

/**
 * Layout-editor state (plan §3.3). Prototype UI-state names are kept verbatim
 * — `ribbon` / `tool` / `insp` / `pages` — so the handoff's .dc.html source
 * stays a usable reference.
 *
 * Slices: document (persisted under `stp-layout-v1`, beside the tracker's
 * `stp-feedback-v1`), experience level (persisted), viewport zoom/pan/guides
 * (session), and the UI toggles (session). Selection and history land in L4.
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

      zoom: 1,
      pan: { x: 0, y: 0 },
      guidesVisible: true,
      fitRequestId: 0,
      focusPageSize: false,

      setRibbon: (ribbon) => set({ ribbon }),
      setTool: (tool) => set({ tool }),
      setInsp: (insp) => set({ insp }),
      setPages: (pages) => set({ pages }),

      setName: (name) => set((s) => ({ doc: { ...s.doc, name } })),

      applyPreset: (presetId) => {
        const preset = getPreset(presetId);
        if (!preset) return;
        set((s) => {
          const landscape = s.doc.orientation === "landscape";
          return {
            doc: {
              ...s.doc,
              size: landscape ? { w: preset.h, h: preset.w } : { w: preset.w, h: preset.h },
            },
            fitRequestId: s.fitRequestId + 1,
          };
        });
      },

      setPageSize: (w, h) =>
        set((s) => {
          const cw = clampPageDim(w);
          const ch = clampPageDim(h);
          const orientation: Orientation =
            cw === ch ? s.doc.orientation : cw > ch ? "landscape" : "portrait";
          return {
            doc: { ...s.doc, size: { w: cw, h: ch }, orientation },
            fitRequestId: s.fitRequestId + 1,
          };
        }),

      setOrientation: (orientation) =>
        set((s) => {
          if (s.doc.orientation === orientation) return s;
          return {
            doc: {
              ...s.doc,
              orientation,
              size: { w: s.doc.size.h, h: s.doc.size.w },
            },
            fitRequestId: s.fitRequestId + 1,
          };
        }),

      setBleed: (bleed) =>
        set((s) => ({ doc: { ...s.doc, bleed: Math.min(0.5, Math.max(0, bleed)) } })),

      setMargin: (margin) =>
        set((s) => {
          const max = Math.min(s.doc.size.w, s.doc.size.h) / 2;
          return { doc: { ...s.doc, margin: Math.min(max, Math.max(0, margin)) } };
        }),

      setColumns: (columns) =>
        set((s) => ({
          doc: { ...s.doc, columns: Math.min(6, Math.max(1, Math.round(columns))) },
        })),

      setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
      zoomIn: () => set((s) => ({ zoom: zoomInStep(s.zoom) })),
      zoomOut: () => set((s) => ({ zoom: zoomOutStep(s.zoom) })),
      setPan: (pan) => set({ pan }),
      toggleGuides: () => set((s) => ({ guidesVisible: !s.guidesVisible })),
      setFocusPageSize: (v) => set({ focusPageSize: v }),

      resetDoc: () =>
        set((s) => ({
          doc: createDefaultDocument(),
          activePageId: "page-1",
          masterEditingId: null,
          guidesVisible: true,
          pan: { x: 0, y: 0 },
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
