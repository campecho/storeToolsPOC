import { z } from "zod";
import {
  AssetSchema,
  LayoutObjectSchema,
  MasterPageSchema,
  OrientationSchema,
  ProductBindingSchema,
  baseLayerDef,
  type LayoutDocument,
  type LayoutPage,
} from "./layout";

/**
 * FROZEN schema v2 (redesign Phase 5) — the shape this POC persisted before
 * layers. Kept only so migrateV2Document can open v2 documents (localStorage,
 * saved `.staples` files, exported JSON). Never extend this file; new fields
 * go in layout.ts. Objects are shape-identical to v3, so their schemas are
 * shared; only the page/document containers are frozen here.
 *
 * v2 → v3 deltas: `version` 2→3; per-page flat `objects` → `layers`
 * ([{layerId, objects}]); new document-level `layers` definitions. A migrated
 * page carries all its content on the base layer, preserving z-order exactly.
 */

const V2LayoutPageSchema = z.object({
  id: z.string(),
  masterId: z.string().nullable(),
  objects: z.array(LayoutObjectSchema),
  sizeOverride: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
});
export type V2LayoutPage = z.infer<typeof V2LayoutPageSchema>;

export const V2LayoutDocumentSchema = z.object({
  version: z.literal(2),
  name: z.string(),
  product: ProductBindingSchema.nullable(),
  size: z.object({ w: z.number().positive(), h: z.number().positive() }),
  orientation: OrientationSchema,
  bleed: z.number().min(0),
  margin: z.number().min(0),
  columns: z.number().int().min(1),
  pages: z.array(V2LayoutPageSchema).min(1),
  masters: z.array(MasterPageSchema),
  assets: z.record(AssetSchema).default({}),
  guides: z
    .object({ v: z.array(z.number()), h: z.array(z.number()) })
    .default({ v: [], h: [] }),
});
export type V2LayoutDocument = z.infer<typeof V2LayoutDocumentSchema>;

/** A v2 page's flat objects become the base layer's contents, z-order intact. */
function migratePage(p: V2LayoutPage): LayoutPage {
  const { objects, ...rest } = p;
  return { ...rest, layers: [{ layerId: baseLayerDef().id, objects }] };
}

/** A parsed v2 document lifted to v3 — pure, total, unit-tested. */
export function migrateV2Document(v2: V2LayoutDocument): LayoutDocument {
  return {
    ...v2,
    version: 3,
    layers: [baseLayerDef()],
    pages: v2.pages.map(migratePage),
  };
}
