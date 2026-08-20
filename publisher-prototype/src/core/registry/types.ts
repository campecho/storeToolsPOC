/**
 * The capability registry's contract types (PLAN.md §4, §5).
 *
 * The registry is the first artifact: one machine-readable classification of
 * every requirement, with its § citation, tier, and contract. The dock, the
 * options bar, the control panel, the review checklists, and every generated
 * handoff document are renderings of registry data — never hand-maintained
 * copies.
 *
 * Every tool carries identical fields; uniformity is the point. A reviewer
 * can diff tool 17 against tool 3 and see exactly what differs.
 */

export type ToolMode = "layout" | "photo" | "both";

/** Dock groups: §4.1 (layout) plus the photo-mode dock of §4.2. */
export type ToolGroup =
  | "selection"
  | "content"
  | "shapes"
  | "style"
  | "layout-aids"
  | "data"
  | "navigation"
  | "photo";

/**
 * Build status (PLAN.md §3). OUT capabilities are not tools — they appear
 * only in the capability map with a named owner — so a ToolContract is
 * always LIVE or SURFACE.
 */
export type Tier = "LIVE" | "SURFACE";

/** What a creation tool leaves on the canvas; null for non-creating tools. */
export type ObjectType =
  | "textFrame"
  | "pictureFrame"
  | "table"
  | "shape"
  | "line"
  | "guide"
  | "mergeField"
  | "buildingBlock";

/**
 * Hit-testing is a first-class contract field because Canvas has no DOM hit
 * testing: click tolerance on a hairline, whether a click inside an unfilled
 * shape selects it, and how locked objects respond are day-one questions
 * prose specs leave undefined (PLAN.md §5).
 */
export type HitTestSpec = {
  /** Screen-space tolerance around strokes/hairlines, independent of zoom. */
  tolerancePx: number;
  /** Does a click inside an unfilled interior select the object? */
  unfilledInterior: "selects" | "passesThrough";
  /** How the tool treats locked objects under the pointer. */
  lockedObjects: "skips" | "hits";
};

/**
 * One id, three places: a GestureClause id is a line in the generated spec,
 * the name of a test assertion, and — via `action` — part of the running
 * app's Redux vocabulary (PLAN.md §5).
 */
export type GestureClause = {
  /** e.g. "rect.drag.shift-constrains-square" — starts with the tool id. */
  id: string;
  /** e.g. "drag + Shift" */
  trigger: string;
  /** One sentence, testable. */
  behavior: string;
  /** RTK action type dispatched on commit, e.g. "rect/drawCommitted". */
  action: string;
};

/** Options with types, ranges, and defaults — the reviewable option set. */
export type OptionSpec =
  | { kind: "boolean"; id: string; label: string; default: boolean }
  | {
      kind: "number";
      id: string;
      label: string;
      default: number;
      min: number;
      max: number;
      step?: number;
      unit?: string;
    }
  | {
      kind: "enum";
      id: string;
      label: string;
      default: string;
      values: readonly string[];
    }
  | { kind: "color"; id: string; label: string; default: string };

/** Panels of §4.3 — layout set plus the photo-mode set. */
export type PanelId =
  | "transform"
  | "character"
  | "paragraph"
  | "styles"
  | "layers"
  | "pages"
  | "master-pages"
  | "sections-numbering"
  | "document-setup"
  | "guides-grid"
  | "align-distribute"
  | "text-wrap"
  | "text-fit-overflow"
  | "color-swatches"
  | "effects"
  | "image-adjust"
  | "resource-manager"
  | "design-checker"
  | "data-merge"
  | "templates"
  | "building-blocks"
  | "themes"
  | "language-proofing"
  | "table-properties"
  | "find-replace"
  | "history"
  | "photo-adjustments"
  | "photo-crop-geometry"
  | "photo-history"
  | "photo-overlays"
  | "photo-fix-for-print"
  | "photo-export";

/**
 * History behavior (PLAN.md §6.3): document history takes one entry per
 * completed gesture; viewport-only tools (zoom, pan) never touch it.
 */
export type UndoGranularity = "per-gesture" | "none";

/**
 * SURFACE only: the declared interface the dev team implements, and the POC
 * implementation cited as working reference where one exists. A citation is
 * never the only explanation — `payload` and `returns` describe the shapes
 * in full (SEAMS.md decision of record).
 */
export type SeamSpec = {
  /** The call the surface would make, e.g. "inpaint(image, mask) → patch". */
  interface: string;
  /** What it is called with — shape described self-containedly. */
  payload: string;
  /** What comes back — shape described self-containedly. */
  returns: string;
  /** Optional POC path proving the far side, e.g. "storeToolsPOC src/…". */
  reference?: string;
};

/**
 * A control panel's registry entry (PLAN.md §4.3). Panels carry no gesture
 * clauses — their option-level contracts arrive with their Phase B groups —
 * but they classify from day one: id, mode, citations, tier, and what the
 * requirements oblige them to expose.
 */
export type PanelSpec = {
  id: PanelId;
  label: string;
  mode: ToolMode;
  /** Requirement citations, e.g. ["§2.2"] — resolve in docs/. */
  req: string[];
  tier: Tier;
  /** What the panel must expose, per the requirements — dense, reviewable. */
  carries: string[];
  /** SURFACE only. */
  seam?: SeamSpec;
  notes: string[];
};

export type ToolContract = {
  id: string;
  label: string;
  mode: ToolMode;
  group: ToolGroup;
  /**
   * The single letter that activates the tool, or null for a dock-only tool
   * that no keystroke reaches. Null rather than an omitted field: every tool
   * carries identical fields, so a reviewer reads "no shortcut" as a decision
   * rather than wondering whether the entry is unfinished.
   */
  shortcut: string | null;
  /** Requirement citations, e.g. ["§4.4", "§2.1"] — resolve in docs/. */
  req: string[];
  tier: Tier;
  cursor: string;
  creates: ObjectType | null;
  hitTest: HitTestSpec;
  gestures: GestureClause[];
  options: OptionSpec[];
  /** Panels that apply while this tool is active. */
  panels: PanelId[];
  undo: UndoGranularity;
  /** SURFACE only. */
  seam?: SeamSpec;
  notes: string[];
};
