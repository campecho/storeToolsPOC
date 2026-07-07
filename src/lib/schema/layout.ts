import { z } from "zod";

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
 * fixtures/layout-document.v2.json (v1 kept beside it as the migration input).
 * v1 documents migrate on load via migrateLegacyDocument (schema/layout-v1.ts).
 */

export const OrientationSchema = z.enum(["portrait", "landscape"]);
export type Orientation = z.infer<typeof OrientationSchema>;

export const StrokeSchema = z.object({
  color: z.string(),
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
  /** Ink color (hex) — schema v2; v1 was fixed #111111. */
  color: z.string(),
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
  fill: z.string().nullable(),
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

// PROD-TODO: `masterId` is a soft reference — store actions guard it but the
// schema doesn't; a dangling id renders furniture-less rather than erroring.
// A real store enforces the constraint (FK or validation on write).
export const LayoutPageSchema = z.object({
  id: z.string(),
  masterId: z.string().nullable(),
  objects: z.array(LayoutObjectSchema),
  /** Per-page size override (L12), inches — the §9 v2 delta pulled forward
      additively/optional so pre-L12 documents keep parsing. Absent = the
      document `size`; set = this page renders at its own effective size. */
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
  version: z.literal(2),
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
  masters: z.array(MasterPageSchema),
  /** Asset library metadata (L8) — defaulted so pre-L8 documents keep parsing. */
  assets: z.record(AssetSchema).default({}),
  /** Ruler-dragged guides (L11), inches: `v` = x-positions, `h` = y-positions.
      Additive/defaulted so pre-L11 documents keep parsing. */
  guides: z
    .object({ v: z.array(z.number()), h: z.array(z.number()) })
    .default({ v: [], h: [] }),
});
export type LayoutDocument = z.infer<typeof LayoutDocumentSchema>;
