import { z } from "zod";
import { LayoutObjectSchema } from "./objects";
import {
  BlendModeSchema,
  ColorRefSchema,
  OpacitySchema,
  SizeSchema,
  SwatchSchema,
} from "./primitives";
import {
  CharacterStyleSchema,
  NumberFormatSchema,
  ParagraphFormatSchema,
  ParagraphStyleSchema,
  RunFormatSchema,
} from "./text";

/**
 * Schema v3's document (PLAN.md §6.6) — the storage and rendering contract.
 *
 * CONTRACT: DocumentSchema IS the document format. It is the persistence
 * shape, the round-trip target, and what the dev team's storage implements
 * against. Its lineage is the POC's schema v2 — pages, masters, per-page size
 * overrides, per-run text, vector paths, an asset store, guides, rotation, and
 * threading fields — validated there at 100% element-level fidelity against a
 * real-document corpus, and owned outright here.
 *
 * Referential integrity (`layerId`, `paragraphStyleId`, swatch ids, `basedOn`
 * chains, threading links) is deliberately NOT enforced by the schema: these
 * are soft references, guarded by the actions that write them, so a dangling
 * id degrades rather than making a document unopenable. The v2 lineage took
 * the same position on `masterId`. A production store enforces them for real.
 */

/** The version this module reads and writes. */
export const CURRENT_VERSION = 3;

/**
 * §2.2 layer. Document-scoped, with per-page visibility overrides so a layer
 * can be hidden on one page without leaving the publication-wide stack.
 */
export const LayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Selection-handle and indicator colour for objects on this layer. */
  color: ColorRefSchema,
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  /** False excludes the layer from print and export — dielines, notes, marks. */
  printing: z.boolean().default(true),
  opacity: OpacitySchema.default(1),
  blend: BlendModeSchema.default("normal"),
});
export type Layer = z.infer<typeof LayerSchema>;

/**
 * §1.5 section. Numbering restarts here, and the section may carry its own
 * master — §1.5 requires different masters to be applicable per section.
 */
export const SectionSchema = z.object({
  /** Zero-based index into `pages` where this section begins. */
  startPage: z.number().int().min(0),
  label: z.string(),
  format: NumberFormatSchema.default("arabic"),
  startValue: z.number().int().default(1),
  /** Section prefix, e.g. "A-" or "App-". */
  prefix: z.string().default(""),
  masterId: z.string().nullable().default(null),
});
export type Section = z.infer<typeof SectionSchema>;

/**
 * §3.8's anchor model, in the schema from the first draft with no tool using
 * it yet (PLAN.md §4.4 — the one requirement that must not be deferred).
 *
 * An anchor is a stable reference to a text position that survives reflow.
 * `position` is an offset into the story's character stream; the text engine's
 * cluster maps (§6.4) are what resolve it to a rendered location, which is why
 * the field can be committed now and consumed later. Retrofitting this into a
 * shipped text engine costs substantially more than carrying it unused.
 */
export const AnchorSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  /** Character offset into the story's concatenated run text. */
  position: z.number().int().min(0),
});
export type Anchor = z.infer<typeof AnchorSchema>;

/** §3.3 font record — what the resource manager lists and the PDF seam embeds. */
export const FontRecordSchema = z.object({
  family: z.string(),
  /** Where the face came from: bundled with the app, or activated from a library. */
  source: z.enum(["bundled", "library", "missing"]),
  /** Variable-font axes, tag → {min, max, default}; absent for static faces. */
  axes: z
    .record(
      z.string(),
      z.object({ min: z.number(), max: z.number(), default: z.number() }),
    )
    .optional(),
  /** §3.3: reported where the font file declares it. */
  embeddingPermitted: z.boolean(),
});
export type FontRecord = z.infer<typeof FontRecordSchema>;

/**
 * Imported-asset metadata, carried over from the v2 lineage: only metadata is
 * in the document; the bytes live in the client-side blob store under the same
 * id, so the document JSON stays small enough to round-trip as a file.
 */
export const AssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["image", "pdf"]),
  mime: z.string(),
  /** Natural pixel dimensions — images only. */
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  bytes: z.number().int().min(0),
});
export type Asset = z.infer<typeof AssetSchema>;

/** §2.4 ruler-dragged guides, inches: `v` = x positions, `h` = y positions. */
export const GuidesSchema = z.object({
  v: z.array(z.number()).default([]),
  h: z.array(z.number()).default([]),
});
export type Guides = z.infer<typeof GuidesSchema>;

/** §2.4 / §3.3 baseline grid the document's text can lock to. */
export const BaselineGridSchema = z.object({
  on: z.boolean().default(false),
  /** Distance between baselines, inches. */
  incrementIn: z.number().positive().default(0.16),
  /** Where the first baseline sits, inches from the top trim edge. */
  startIn: z.number().min(0).default(0),
});
export type BaselineGrid = z.infer<typeof BaselineGridSchema>;

/**
 * §1.4 document setup: trim, bleed, and slug as distinct first-class
 * properties. Slug sits outside bleed and carries job notes and approval
 * marks, which §1.4 requires to be includable at export independently of
 * artwork — hence its own extent rather than a larger bleed.
 */
export const PageSetupSchema = z.object({
  /** Trim size, inches — the finished page. */
  trim: SizeSchema,
  bleedIn: z.number().min(0).default(0.125),
  slugIn: z.number().min(0).default(0),
  marginIn: z.number().min(0).default(0.5),
  /** §3.5 column guides. */
  columns: z.number().int().min(1).default(1),
});
export type PageSetup = z.infer<typeof PageSetupSchema>;

/**
 * A page. `setup` present overrides the document's — §1.4 requires per-page or
 * per-spread setup values in mixed-size documents, which generalises the v2
 * lineage's `sizeOverride`. `guides` and `hiddenLayerIds` are likewise
 * per-page (§2.4, §2.2).
 */
export const PageSchema = z.object({
  id: z.string(),
  masterId: z.string().nullable().default(null),
  objects: z.array(LayoutObjectSchema).default([]),
  setup: PageSetupSchema.nullable().default(null),
  /** §1.4 page rotation, quarter turns clockwise. */
  quarterTurns: z.number().int().default(0),
  guides: GuidesSchema.default({ v: [], h: [] }),
  /** §2.2 per-page visibility overrides on document-scoped layers. */
  hiddenLayerIds: z.array(z.string()).default([]),
});
export type Page = z.infer<typeof PageSchema>;

export const MasterPageSchema = z.object({
  id: z.string(),
  label: z.string(),
  objects: z.array(LayoutObjectSchema).default([]),
  guides: GuidesSchema.default({ v: [], h: [] }),
});
export type MasterPage = z.infer<typeof MasterPageSchema>;

/** Catalog binding — null renders as "Custom size — not bound to a SKU". */
export const ProductBindingSchema = z.object({
  sku: z.string(),
  label: z.string(),
});
export type ProductBinding = z.infer<typeof ProductBindingSchema>;

/**
 * The document defaults that make formatting resolution total (see text.ts).
 * Both are complete, so text carrying no style at all still resolves.
 */
export const DocumentDefaultsSchema = z.object({
  paragraph: ParagraphFormatSchema,
  run: RunFormatSchema,
});
export type DocumentDefaults = z.infer<typeof DocumentDefaultsSchema>;

export const DocumentSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  name: z.string(),
  product: ProductBindingSchema.nullable().default(null),
  /** Document-wide setup; pages may override it (§1.4). */
  setup: PageSetupSchema,
  baselineGrid: BaselineGridSchema.default({}),
  /** Spread pairing (§1.2); single-page documents leave it off. */
  facingPages: z.boolean().default(false),
  pages: z.array(PageSchema).min(1),
  masters: z.array(MasterPageSchema).default([]),
  /** §2.2 — document-scoped, bottom of the stack first. */
  layers: z.array(LayerSchema).min(1),
  /** §1.5 — ordered by `startPage`; the first section starts at page 0. */
  sections: z.array(SectionSchema).default([]),
  /** §9.4 named palette; objects reference these by id. */
  swatches: z.array(SwatchSchema).default([]),
  /** §3.6 */
  paragraphStyles: z.array(ParagraphStyleSchema).default([]),
  characterStyles: z.array(CharacterStyleSchema).default([]),
  defaults: DocumentDefaultsSchema,
  /** §3.3 / resource manager / PDF seam. */
  fonts: z.array(FontRecordSchema).default([]),
  /** §3.8 phase-1 model rule — no consumer tool yet, by design (§4.4). */
  anchors: z.array(AnchorSchema).default([]),
  assets: z.record(z.string(), AssetSchema).default({}),
  /** Document-wide guides; pages carry their own as well (§2.4). */
  guides: GuidesSchema.default({ v: [], h: [] }),
});
export type Document = z.infer<typeof DocumentSchema>;
