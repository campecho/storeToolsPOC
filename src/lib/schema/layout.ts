import { z } from "zod";

/**
 * Layout-editor document model (plan §3.4) — engine-agnostic, canonical
 * inches, z-order is array order. Page size is document-level; per-page mixed
 * sizes are deferred (plan §6). Text styling is per-frame for the POC — the
 * richer per-run model is the versioned v2 migration (plan §9).
 *
 * CONTRACT: LayoutDocumentSchema IS the document format — the persistence
 * shape, the `.pub` import target (plan §9-§11), and the render contract. Any
 * backend stack implements against it; a committed example lives at
 * fixtures/layout-document.v1.json.
 * PROD-TODO: schema v2 (per-run text, assets, vector paths) ships with a
 * v1→v2 migration; the prototype may drop-and-reseed, production must not.
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

export const TextPropsSchema = z.object({
  content: z.string(),
  font: FontPropsSchema,
  align: z.enum(["left", "center", "right", "justify"]),
  lineSpacing: z.number(),
});
export type TextProps = z.infer<typeof TextPropsSchema>;

/** Rect / ellipse / picture / text frame. `text` is set on type "text" only. */
export const FrameObjectSchema = z.object({
  id: z.string(),
  type: z.enum(["rect", "ellipse", "picture", "text"]),
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

export const LayoutDocumentSchema = z.object({
  version: z.literal(1),
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
});
export type LayoutDocument = z.infer<typeof LayoutDocumentSchema>;
