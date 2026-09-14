import { z } from "zod";
import { colorFromHex } from "@/lib/color/convert";
import type { Paint } from "./color";
import {
  AssetSchema,
  FontPropsSchema,
  LayerDefSchema,
  OrientationSchema,
  PathSegSchema,
  ProductBindingSchema,
  TextAlignSchema,
  TextInsetSchema,
  type LayoutDocument,
  type LayoutObject,
  type LayoutPage,
  type MasterPage,
  type Paragraph,
  type Stroke,
  type TextProps,
} from "./layout";
import { PhotoOpSchema } from "./photo";

/**
 * FROZEN schema v3 (redesign Phase 12) — the shape this POC persisted before
 * colors carried their space. Kept only so migrateV3Document can open v3
 * documents (localStorage, saved `.staples` files, exported JSON); the v1 and
 * v2 frozen schemas build on these object shapes, which they share. Never
 * extend this file; new fields go in layout.ts.
 *
 * v3 → v4 deltas: `version` 3→4; every hex string in `fill`, `stroke.color`,
 * and run `color` becomes a Paint (`{ kind: "color", color: { space: "rgb",
 * values } }` — a v3 hex was always screen RGB); new document-level
 * `swatches`. Geometry, layers, masters, assets, and guides are untouched.
 */

export const V3StrokeSchema = z.object({
  color: z.string(),
  width: z.number(),
});
export type V3Stroke = z.infer<typeof V3StrokeSchema>;

const V3TextRunSchema = z.object({
  text: z.string(),
  font: FontPropsSchema,
  color: z.string(),
});

const V3ParagraphSchema = z.object({
  align: TextAlignSchema,
  lineSpacing: z.number(),
  indent: z.number().optional(),
  firstLineIndent: z.number().optional(),
  runs: z.array(V3TextRunSchema).min(1),
});
type V3Paragraph = z.infer<typeof V3ParagraphSchema>;

const V3TextPropsSchema = z.object({
  paragraphs: z.array(V3ParagraphSchema).min(1),
  vAlign: z.enum(["top", "middle", "bottom"]).optional(),
  inset: TextInsetSchema.optional(),
  fontScale: z.number().min(0.5).max(1).optional(),
});
export type V3TextProps = z.infer<typeof V3TextPropsSchema>;

const V3FrameObjectSchema = z.object({
  id: z.string(),
  type: z.enum(["rect", "ellipse", "picture", "text", "path"]),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number(),
  locked: z.boolean(),
  fill: z.string().nullable(),
  stroke: V3StrokeSchema.nullable(),
  text: V3TextPropsSchema.optional(),
  d: z.array(PathSegSchema).optional(),
  assetId: z.string().optional(),
  fit: z.enum(["cover", "stretch", "contain"]).optional(),
  photoEdit: z
    .object({
      recipe: z.array(PhotoOpSchema),
      originalAssetId: z.string(),
    })
    .optional(),
});

const V3LineObjectSchema = z.object({
  id: z.string(),
  type: z.literal("line"),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  stroke: V3StrokeSchema,
});

export const V3LayoutObjectSchema = z.union([V3FrameObjectSchema, V3LineObjectSchema]);
export type V3LayoutObject = z.infer<typeof V3LayoutObjectSchema>;

export const V3MasterPageSchema = z.object({
  id: z.string(),
  label: z.string(),
  objects: z.array(V3LayoutObjectSchema),
});
type V3MasterPage = z.infer<typeof V3MasterPageSchema>;

const V3PageLayerSchema = z.object({
  layerId: z.string(),
  objects: z.array(V3LayoutObjectSchema),
});

const V3LayoutPageSchema = z.object({
  id: z.string(),
  masterId: z.string().nullable(),
  layers: z.array(V3PageLayerSchema).min(1),
  sizeOverride: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
});
export type V3LayoutPage = z.infer<typeof V3LayoutPageSchema>;

export const V3LayoutDocumentSchema = z.object({
  version: z.literal(3),
  name: z.string(),
  product: ProductBindingSchema.nullable(),
  size: z.object({ w: z.number().positive(), h: z.number().positive() }),
  orientation: OrientationSchema,
  bleed: z.number().min(0),
  margin: z.number().min(0),
  columns: z.number().int().min(1),
  pages: z.array(V3LayoutPageSchema).min(1),
  layers: z.array(LayerDefSchema).min(1),
  masters: z.array(V3MasterPageSchema),
  assets: z.record(AssetSchema).default({}),
  guides: z
    .object({ v: z.array(z.number()), h: z.array(z.number()) })
    .default({ v: [], h: [] }),
});
export type V3LayoutDocument = z.infer<typeof V3LayoutDocumentSchema>;

/** A v3 hex string as a v4 literal rgb Paint (a v3 color was always screen RGB). */
function migratePaint(hex: string): Paint {
  return { kind: "color", color: colorFromHex(hex) };
}

function migrateStroke(s: V3Stroke): Stroke {
  return { paint: migratePaint(s.color), width: s.width };
}

function migrateParagraph(p: V3Paragraph): Paragraph {
  return { ...p, runs: p.runs.map((r) => ({ ...r, color: migratePaint(r.color) })) };
}

function migrateText(t: V3TextProps): TextProps {
  return { ...t, paragraphs: t.paragraphs.map(migrateParagraph) };
}

function migrateObject(o: V3LayoutObject): LayoutObject {
  if (o.type === "line") return { ...o, stroke: migrateStroke(o.stroke) };
  const { fill, stroke, text, ...rest } = o;
  return {
    ...rest,
    fill: fill === null ? null : migratePaint(fill),
    stroke: stroke === null ? null : migrateStroke(stroke),
    ...(text ? { text: migrateText(text) } : {}),
  };
}

function migratePage(p: V3LayoutPage): LayoutPage {
  return { ...p, layers: p.layers.map((l) => ({ ...l, objects: l.objects.map(migrateObject) })) };
}

function migrateMaster(m: V3MasterPage): MasterPage {
  return { ...m, objects: m.objects.map(migrateObject) };
}

/** A parsed v3 document lifted to v4 — pure, total, unit-tested. */
export function migrateV3Document(v3: V3LayoutDocument): LayoutDocument {
  return {
    ...v3,
    version: 4,
    pages: v3.pages.map(migratePage),
    masters: v3.masters.map(migrateMaster),
    swatches: [],
  };
}
