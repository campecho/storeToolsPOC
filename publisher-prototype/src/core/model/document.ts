import { z } from "zod";
import { BlendModeSchema, SwatchSchema } from "./color";
import { LayoutObjectSchema } from "./objects";
import {
  CharacterStyleSchema,
  NumberFormatSchema,
  OrientationSchema,
  ParagraphStyleSchema,
} from "./typography";

/**
 * Document root — schema v3 (PLAN.md §6.6), seeded by the proven v2 lineage
 * and owned here. Canonical units are inches; z-order is array order; the
 * version field is a literal so wrong versions FAIL to parse rather than
 * half-load (parse.ts is the migrate-on-read door).
 *
 * Additive rule (the lineage's): new-in-v3 document fields are optional or
 * defaulted so future additive changes don't force version bumps; core
 * structure (version, pages, size) stays required.
 */

/** Layers are DOCUMENT-scoped with per-page visibility overrides — the §2.2
    "as configured" decision recorded in PLAN.md §4.3. `color` is the UI
    selection-highlight hex, not a print color. */
export const LayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  printing: z.boolean().default(true),
  opacity: z.number().min(0).max(1).default(1),
  blend: BlendModeSchema.default("normal"),
});
export type Layer = z.infer<typeof LayerSchema>;

/** Sections & numbering (§1.5): a section starts at a page index and restyles
    page numbering from there; the page-number field resolves against it. */
export const SectionSchema = z.object({
  /** Index into doc.pages where the section starts. */
  startPage: z.number().int().min(0),
  label: z.string(),
  format: NumberFormatSchema.default("arabic"),
  startValue: z.number().int().min(1).default(1),
  /** Prepended to the rendered number (e.g. "A-"); absent = none. */
  prefix: z.string().optional(),
});
export type Section = z.infer<typeof SectionSchema>;

/** Anchor (§3.8, §4.4 — in the first draft by design, no consumer tool yet):
    a stable reference to a text position surviving reflow. `position` is a
    character offset into the story's plain text, resolvable to geometry via
    the text engine's cluster maps (§6.4). */
export const AnchorSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  position: z.number().int().min(0),
});
export type Anchor = z.infer<typeof AnchorSchema>;

/** ASSUMPTION: the source vocabulary is a working guess — §6.6 requires
    `source` but names no values. "system" = a locally installed font,
    "bundled" = shipped npm font packages (§6.7), "embedded" = carried with
    the document via the asset store. */
export const FontSourceSchema = z.enum(["system", "bundled", "embedded"]);
export type FontSource = z.infer<typeof FontSourceSchema>;

export const FontAxisSchema = z.object({
  min: z.number(),
  max: z.number(),
  default: z.number(),
});
export type FontAxis = z.infer<typeof FontAxisSchema>;

/** Resource-manager entry; `embeddingPermitted` feeds the PDF seam. */
export const FontResourceSchema = z.object({
  family: z.string(),
  source: FontSourceSchema,
  /** Variable fonts: axis tag → range (e.g. wght). */
  axes: z.record(FontAxisSchema).optional(),
  embeddingPermitted: z.boolean(),
});
export type FontResource = z.infer<typeof FontResourceSchema>;

/** ASSUMPTION: minimal nested grouping (§5.1 group editing is Phase B; only
    the model ships now) — a group is an id plus optional parent; objects
    join via their `groupId`. Geometry stays on the member objects; a group
    has none of its own. */
export const GroupSchema = z.object({
  id: z.string(),
  parentGroupId: z.string().optional(),
});
export type Group = z.infer<typeof GroupSchema>;

/** Imported-asset metadata — the lineage's asset-store rule: only metadata
    lives in the document; the bytes live in a client-side blob store keyed
    by the same id, so the document JSON stays small. */
export const AssetSchema = z.object({
  id: z.string(),
  /** Original filename — the library label. */
  name: z.string(),
  kind: z.enum(["image", "pdf"]),
  mime: z.string(),
  /** Natural pixel dimensions — images only. */
  width: z.number().optional(),
  height: z.number().optional(),
  /** Size in bytes, for the library listing. */
  bytes: z.number(),
});
export type Asset = z.infer<typeof AssetSchema>;

/** Ruler guides, inches: `v` = x-positions, `h` = y-positions. */
export const GuidesSchema = z.object({
  v: z.array(z.number()),
  h: z.array(z.number()),
});
export type Guides = z.infer<typeof GuidesSchema>;

/** Baseline grid (§1.4): first line offset from the page top and the leading
    increment, inches. Paragraphs opt in via `baselineGridLock`. */
export const BaselineGridSchema = z.object({
  start: z.number().min(0),
  increment: z.number().positive(),
});
export type BaselineGrid = z.infer<typeof BaselineGridSchema>;

export const PageSizeSchema = z.object({
  w: z.number().positive(),
  h: z.number().positive(),
});
export type PageSize = z.infer<typeof PageSizeSchema>;

/**
 * A page. `masterId` is a soft reference (the lineage rule): store actions
 * guard it; a dangling id renders furniture-less rather than erroring.
 * Per-page setup values (§1.4) follow the lineage's `sizeOverride` pattern —
 * one optional override per document-level setup field; absent = the
 * document value. ASSUMPTION: spreads are modeled as consecutive pages
 * sharing overrides — §6.6 says "per-page/per-spread" without a spread
 * structure, and none is introduced here.
 */
export const LayoutPageSchema = z.object({
  id: z.string(),
  masterId: z.string().nullable(),
  objects: z.array(LayoutObjectSchema),
  /** Per-page size override (the lineage field), inches. */
  sizeOverride: PageSizeSchema.optional(),
  bleedOverride: z.number().min(0).optional(),
  marginOverride: z.number().min(0).optional(),
  slugOverride: z.number().min(0).optional(),
  columnsOverride: z.number().int().min(1).optional(),
  baselineGridOverride: BaselineGridSchema.optional(),
  /** Per-page ruler guides; document-level guides remain in doc.guides. */
  guides: GuidesSchema.optional(),
  /** Per-page layer visibility overrides, keyed by layer id (§2.2). */
  layerOverrides: z.record(z.object({ visible: z.boolean() })).optional(),
});
export type LayoutPage = z.infer<typeof LayoutPageSchema>;

export const MasterPageSchema = z.object({
  id: z.string(),
  label: z.string(),
  objects: z.array(LayoutObjectSchema),
});
export type MasterPage = z.infer<typeof MasterPageSchema>;

/** "image" = a standalone single-image document (§6.5/§6.6): by convention
    one page holding one picture frame whose adjust recipe is the edit. The
    convention is NOT schema-enforced — photo mode maintains it, and the
    layout surface opens the document unharmed if it drifts. */
export const DocumentKindSchema = z.enum(["layout", "image"]);
export type DocumentKind = z.infer<typeof DocumentKindSchema>;

export const LayoutDocumentSchema = z.object({
  version: z.literal(3),
  kind: DocumentKindSchema.default("layout"),
  name: z.string(),
  /** Effective page dimensions in inches (already orientation-applied). */
  size: PageSizeSchema,
  orientation: OrientationSchema,
  /** Per-edge distances, inches: trim → bleed; slug joins them first-class (§1.4). */
  bleed: z.number().min(0),
  margin: z.number().min(0),
  slug: z.number().min(0).default(0),
  /** Column guides derive from this. */
  columns: z.number().int().min(1),
  baselineGrid: BaselineGridSchema.optional(),
  pages: z.array(LayoutPageSchema).min(1),
  masters: z.array(MasterPageSchema),
  /** Empty = the implicit single layer; objects with no layerId belong to
      the first layer (or that implicit one). */
  layers: z.array(LayerSchema).default([]),
  sections: z.array(SectionSchema).default([]),
  anchors: z.array(AnchorSchema).default([]),
  paragraphStyles: z.array(ParagraphStyleSchema).default([]),
  characterStyles: z.array(CharacterStyleSchema).default([]),
  swatches: z.array(SwatchSchema).default([]),
  groups: z.array(GroupSchema).default([]),
  fonts: z.array(FontResourceSchema).default([]),
  assets: z.record(AssetSchema).default({}),
  guides: GuidesSchema.default({ v: [], h: [] }),
});
export type LayoutDocument = z.infer<typeof LayoutDocumentSchema>;
