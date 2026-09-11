import { z } from "zod";
import { PaintSchema, SwatchSchema } from "./color";
import { PhotoOpSchema } from "./photo";

/**
 * Layout-editor document model (plan §3.4) — engine-agnostic, canonical
 * inches, z-order is array order. Page size is document-level; per-page mixed
 * sizes are deferred (plan §6). Text is the schema-v2 per-run model (plan §9,
 * P2): paragraphs of styled runs are the single source of truth — frame-level
 * "current style" is derived, never stored, so the two can't drift.
 *
 * CONTRACT: LayoutDocumentSchema IS the document format — the persistence
 * shape, the `.pub` import target (plan §9-§11), and the render contract. Any
 * backend stack implements against it; a committed example lives at
 * fixtures/layout-document.v4.json (v1/v2/v3 kept beside it as migration
 * inputs). Older documents migrate on load: v1 → v2 via migrateLegacyDocument
 * (schema/layout-v1.ts), v2 → v3 via migrateV2Document (schema/layout-v2.ts) —
 * v3 nests each page's flat objects into named layer containers (Phase 5) —
 * and v3 → v4 via migrateV3Document (schema/layout-v3.ts): v4 stores every
 * fill, stroke, and run ink as a Paint carrying its color space (Phase 12).
 */

export const OrientationSchema = z.enum(["portrait", "landscape"]);
export type Orientation = z.infer<typeof OrientationSchema>;

/** Stroke — the paint plus a width in CSS px at zoom 1 (ObjectNode: width × zoom). */
export const StrokeSchema = z.object({
  paint: PaintSchema,
  width: z.number(),
});
export type Stroke = z.infer<typeof StrokeSchema>;

export const FontPropsSchema = z.object({
  family: z.string(),
  size: z.number(),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
});
export type FontProps = z.infer<typeof FontPropsSchema>;

export const TextAlignSchema = z.enum(["left", "center", "right", "justify"]);
export type TextAlign = z.infer<typeof TextAlignSchema>;

/** One styled run — text may contain \n (soft line breaks within a paragraph). */
export const TextRunSchema = z.object({
  text: z.string(),
  font: FontPropsSchema,
  /** Ink — a Paint since schema v4 (v2/v3 stored hex; v1 was fixed #111111). */
  color: PaintSchema,
});
export type TextRun = z.infer<typeof TextRunSchema>;

export const ParagraphSchema = z.object({
  align: TextAlignSchema,
  /** Line height as a multiplier of the font size (Publisher "1sp" ≈ 1.19). */
  lineSpacing: z.number(),
  /** Left indent, inches (import fidelity — no editing UI yet). */
  indent: z.number().optional(),
  /** Additional first-line indent, inches (may be negative: hanging indent). */
  firstLineIndent: z.number().optional(),
  /** Never empty — an empty paragraph is one run with text "" (it carries the
      style new typing continues in). */
  runs: z.array(TextRunSchema).min(1),
});
export type Paragraph = z.infer<typeof ParagraphSchema>;

export const TextInsetSchema = z.object({
  l: z.number().min(0),
  r: z.number().min(0),
  t: z.number().min(0),
  b: z.number().min(0),
});
export type TextInset = z.infer<typeof TextInsetSchema>;

export const TextPropsSchema = z.object({
  /** Never empty — an empty frame is one paragraph with one empty run. */
  paragraphs: z.array(ParagraphSchema).min(1),
  /** Vertical alignment inside the frame; absent = top. */
  vAlign: z.enum(["top", "middle", "bottom"]).optional(),
  /** Text insets, inches (Publisher's default is 0.04 on all sides); absent = none. */
  inset: TextInsetSchema.optional(),
  /** Import autofit (§10.5): a uniform render-time scale on every run's size,
      mirroring Publisher's "shrink text on overflow" when the remapped
      stand-in font runs wider than the original. Declared run sizes stay the
      source of truth (reversible, round-trips); absent = 1. */
  fontScale: z.number().min(0.5).max(1).optional(),
});
export type TextProps = z.infer<typeof TextPropsSchema>;

/**
 * Vector path segments (schema v2, plan §9) — absolute-form M/L/C/Z only
 * (the full vocabulary libmspub emits; arcs would be cubic-approximated at
 * import). Coordinates are NORMALIZED 0–1 within the object's frame box, so
 * move/resize/align tooling works on x/y/w/h unchanged and the path scales.
 */
export const PathSegSchema = z.union([
  z.object({ c: z.enum(["M", "L"]), x: z.number(), y: z.number() }),
  z.object({
    c: z.literal("C"),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
    x: z.number(),
    y: z.number(),
  }),
  z.object({ c: z.literal("Z") }),
]);
export type PathSeg = z.infer<typeof PathSegSchema>;

/** Rect / ellipse / picture / text / path frame. `text` is set on type "text"
    only; `d` on type "path" only. */
export const FrameObjectSchema = z.object({
  id: z.string(),
  type: z.enum(["rect", "ellipse", "picture", "text", "path"]),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  /** In the schema now (import fidelity); the editing UI arrives later. */
  rotation: z.number(),
  locked: z.boolean(),
  /** Solid fill as a Paint (schema v4); null = none. */
  fill: PaintSchema.nullable(),
  stroke: StrokeSchema.nullable(),
  text: TextPropsSchema.optional(),
  /** Paths only (schema v2): normalized segments — see PathSegSchema. */
  d: z.array(PathSegSchema).optional(),
  /** Pictures only (L8): key into the document's `assets`; absent = the gray
      placeholder frame. The blob behind it lives in the IndexedDB store. */
  assetId: z.string().optional(),
  /** Pictures only (P3, the §9 delta): how the image fills the frame.
      Absent = "cover" (the L8 upload default). Imports use "stretch" —
      Publisher scales the image to the frame exactly. */
  fit: z.enum(["cover", "stretch", "contain"]).optional(),
  /** Pictures only (F2, PE8): the Photo Editor round-trip result — the applied
      recipe plus the ORIGINAL asset id the frame was bound to at the first edit.
      Present after a "Done" from the Photo Editor; `assetId` then points at the
      rendered result, and "Revert photo edits" restores `originalAssetId` and
      drops this field (one named layout history step). PhotoOpSchema is the
      same-repo contract from ./photo. Additive, schema-v2-compatible, migrate-free
      (plan §3.4). */
  photoEdit: z
    .object({
      recipe: z.array(PhotoOpSchema),
      originalAssetId: z.string(),
    })
    .optional(),
});
export type FrameObject = z.infer<typeof FrameObjectSchema>;

export const LineObjectSchema = z.object({
  id: z.string(),
  type: z.literal("line"),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  stroke: StrokeSchema,
});
export type LineObject = z.infer<typeof LineObjectSchema>;

export const LayoutObjectSchema = z.union([FrameObjectSchema, LineObjectSchema]);
export type LayoutObject = z.infer<typeof LayoutObjectSchema>;

/**
 * Named layer definition (schema v3, redesign Phase 5 — figma "Layers Tab").
 * Definitions are document-level so names/visibility hold across pages;
 * contents live per page in PageLayerSchema. Order in the document's `layers`
 * array is bottom-to-top — the render order.
 */
export const LayerDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Layers-panel accent (row bar) — assigned from a palette on creation. */
  color: z.string(),
  /** Hidden layers don't render and aren't hit-testable. */
  visible: z.boolean(),
  /** Layer-level lock — composes with per-object `locked`: an object is
      effectively locked when either is true. */
  locked: z.boolean(),
  /** Renders in the editor (badged); excluded by print/export tooling. */
  nonPrint: z.boolean(),
});
export type LayerDef = z.infer<typeof LayerDefSchema>;

/** Every document has at least this layer; migrated v1/v2 content lands here. */
export const BASE_LAYER_ID = "layer-base";
export function baseLayerDef(): LayerDef {
  return { id: BASE_LAYER_ID, name: "Layer 1", color: "#41b6e6", visible: true, locked: false, nonPrint: false };
}

/** One layer's content on one page — z-order within the layer is array order. */
export const PageLayerSchema = z.object({
  /** References a document-level LayerDef id. */
  layerId: z.string(),
  objects: z.array(LayoutObjectSchema),
});
export type PageLayer = z.infer<typeof PageLayerSchema>;

// PROD-TODO: `masterId` is a soft reference — store actions guard it but the
// schema doesn't; a dangling id renders furniture-less rather than erroring.
// A real store enforces the constraint (FK or validation on write). The same
// applies to `layers[].layerId` vs the document's layer definitions — store
// normalization (lib/layout/layers.ts) keeps them 1:1 and ordered.
export const LayoutPageSchema = z.object({
  id: z.string(),
  masterId: z.string().nullable(),
  /** Layer containers (schema v3), aligned 1:1 with the document's `layers`
      order, bottom-to-top. Whole-page z-order is the concatenation. */
  layers: z.array(PageLayerSchema).min(1),
  /** Per-page size override (L12), inches. Absent = the document `size`;
      set = this page renders at its own effective size. */
  sizeOverride: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
});
export type LayoutPage = z.infer<typeof LayoutPageSchema>;

export const MasterPageSchema = z.object({
  id: z.string(),
  label: z.string(),
  objects: z.array(LayoutObjectSchema),
});
export type MasterPage = z.infer<typeof MasterPageSchema>;

/** Catalog binding — null renders as "Custom size — not bound to a SKU". */
export const ProductBindingSchema = z.object({
  sku: z.string(),
  label: z.string(),
});
export type ProductBinding = z.infer<typeof ProductBindingSchema>;

/**
 * Imported-asset metadata (L8) — the §9 asset-store delta pulled forward
 * additively into v1. Only metadata lives in the document; the bytes live in
 * the client-side IndexedDB blob store (src/lib/assets/blob-store.ts), keyed
 * by the same id, so the document JSON stays small.
 */
export const AssetSchema = z.object({
  id: z.string(),
  /** Original filename — the library label. */
  name: z.string(),
  /** PDFs join the library but are placeable only once print tooling lands. */
  kind: z.enum(["image", "pdf"]),
  mime: z.string(),
  /** Natural pixel dimensions — images only. */
  width: z.number().optional(),
  height: z.number().optional(),
  /** Size in bytes, for the library listing. */
  bytes: z.number(),
});
export type Asset = z.infer<typeof AssetSchema>;

export const LayoutDocumentSchema = z.object({
  version: z.literal(4),
  name: z.string(),
  product: ProductBindingSchema.nullable(),
  /** Effective page dimensions in inches (already orientation-applied). */
  size: z.object({ w: z.number().positive(), h: z.number().positive() }),
  orientation: OrientationSchema,
  bleed: z.number().min(0),
  margin: z.number().min(0),
  /** Column guides derive from this (plan §3.5). */
  columns: z.number().int().min(1),
  pages: z.array(LayoutPageSchema).min(1),
  /** Layer definitions (schema v3), bottom-to-top; every page carries one
      PageLayer per definition, in this order. Masters stay flat — master
      furniture renders as a single band beneath all page layers. */
  layers: z.array(LayerDefSchema).min(1),
  masters: z.array(MasterPageSchema),
  /** Named document colors (schema v4, Phase 12) — paints may reference one
      by id. Defaulted so a v4 document without the field still parses. */
  swatches: z.array(SwatchSchema).default([]),
  /** Asset library metadata (L8) — defaulted so pre-L8 documents keep parsing. */
  assets: z.record(AssetSchema).default({}),
  /** Ruler-dragged guides (L11), inches: `v` = x-positions, `h` = y-positions.
      Additive/defaulted so pre-L11 documents keep parsing. */
  guides: z
    .object({ v: z.array(z.number()), h: z.array(z.number()) })
    .default({ v: [], h: [] }),
});
export type LayoutDocument = z.infer<typeof LayoutDocumentSchema>;
