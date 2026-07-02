import { create } from "zustand";

/**
 * Layout-editor UI state, ported from the handoff prototype's Component class
 * (docs/handoff/layout-editor/Layout Editor.dc.html). State names are kept
 * aligned with the prototype — `ribbon` / `tool` / `insp` / `pages` — so the
 * .dc.html source stays a usable reference (plan §3.3).
 *
 * L1 scope: the four UI toggles only. The document model, selection, viewport,
 * history, and persistence (`stp-layout-v1`) land in step L3.
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

export interface LayoutEditorState {
  ribbon: RibbonTab;
  tool: EditorTool;
  insp: InspectorTab;
  pages: PagesPaneView;

  setRibbon: (ribbon: RibbonTab) => void;
  setTool: (tool: EditorTool) => void;
  setInsp: (insp: InspectorTab) => void;
  setPages: (pages: PagesPaneView) => void;
}

export const useLayoutStore = create<LayoutEditorState>()((set) => ({
  // Prototype defaults: Home ribbon, Select tool, Page inspector tab, Pages view.
  ribbon: "home",
  tool: "select",
  insp: "page",
  pages: "pages",

  setRibbon: (ribbon) => set({ ribbon }),
  setTool: (tool) => set({ tool }),
  setInsp: (insp) => set({ insp }),
  setPages: (pages) => set({ pages }),
}));
