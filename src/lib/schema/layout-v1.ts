import { z } from "zod";
import {
  AssetSchema,
  FontPropsSchema,
  OrientationSchema,
  ProductBindingSchema,
  StrokeSchema,
  TextAlignSchema,
  type LayoutDocument,
  type LayoutObject,
  type Paragraph,
} from "./layout";

/**
 * FROZEN schema v1 (plan §9) — the shape this POC persisted before the P2
 * per-run text model. Kept only so migrateLegacyDocument can open v1 documents
 * (localStorage `stp-layout-v1`, exported JSON). Never extend this file; new
 * fields go in layout.ts.
 *
 * v1 → v2 deltas: `version` 1→2; per-frame text ({content, font, align,
 * lineSpacing}) → paragraphs of styled runs (+ color, vAlign, inset); new
 * "path" object type. Everything else is shape-identical.
 */

const V1TextPropsSchema = z.object({
  content: z.string(),
  font: FontPropsSchema,
  align: TextAlignSchema,
  lineSpacing: z.number(),
});
type V1TextProps = z.infer<typeof V1TextPropsSchema>;

const V1FrameObjectSchema = z.object({
  id: z.string(),
  type: z.enum(["rect", "ellipse", "picture", "text"]),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number(),
  locked: z.boolean(),
  fill: z.string().nullable(),
  stroke: StrokeSchema.nullable(),
  text: V1TextPropsSchema.optional(),
  assetId: z.string().optional(),
});

const V1LineObjectSchema = z.object({
  id: z.string(),
  type: z.literal("line"),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  stroke: StrokeSchema,
});

const V1LayoutObjectSchema = z.union([V1FrameObjectSchema, V1LineObjectSchema]);
type V1LayoutObject = z.infer<typeof V1LayoutObjectSchema>;

const V1LayoutPageSchema = z.object({
  id: z.string(),
  masterId: z.string().nullable(),
  objects: z.array(V1LayoutObjectSchema),
  sizeOverride: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
});

const V1MasterPageSchema = z.object({
  id: z.string(),
  label: z.string(),
  objects: z.array(V1LayoutObjectSchema),
});

export const V1LayoutDocumentSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  product: ProductBindingSchema.nullable(),
  size: z.object({ w: z.number().positive(), h: z.number().positive() }),
  orientation: OrientationSchema,
  bleed: z.number().min(0),
  margin: z.number().min(0),
  columns: z.number().int().min(1),
  pages: z.array(V1LayoutPageSchema).min(1),
  masters: z.array(V1MasterPageSchema),
  assets: z.record(AssetSchema).default({}),
  guides: z
    .object({ v: z.array(z.number()), h: z.array(z.number()) })
    .default({ v: [], h: [] }),
});
export type V1LayoutDocument = z.infer<typeof V1LayoutDocumentSchema>;

/** v1 ink was fixed — every migrated run gets it. */
const V1_TEXT_COLOR = "#111111";

/** v1 per-frame text → v2 paragraphs: one paragraph per line, one run each. */
function migrateText(t: V1TextProps): { paragraphs: Paragraph[] } {
  const lines = t.content.split("\n");
  return {
    paragraphs: (lines.length ? lines : [""]).map((line) => ({
      align: t.align,
      lineSpacing: t.lineSpacing,
      runs: [{ text: line, font: t.font, color: V1_TEXT_COLOR }],
    })),
  };
}

function migrateObject(o: V1LayoutObject): LayoutObject {
  if (o.type === "line") return o;
  const { text, ...rest } = o;
  return text ? { ...rest, text: migrateText(text) } : rest;
}

/** A parsed v1 document lifted to v2 — pure, total, unit-tested. */
export function migrateLegacyDocument(v1: V1LayoutDocument): LayoutDocument {
  return {
    ...v1,
    version: 2,
    pages: v1.pages.map((p) => ({ ...p, objects: p.objects.map(migrateObject) })),
    masters: v1.masters.map((m) => ({ ...m, objects: m.objects.map(migrateObject) })),
  };
}
