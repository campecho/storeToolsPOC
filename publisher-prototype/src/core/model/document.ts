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

/** Minimal nested grouping (§5.1) — a group is an id plus optional parent;
    objects join via their `groupId`.

    A group owns ONE piece of geometry: the angle its selection frame is drawn
    at. Everything else stays on the members. The angle has to be stored
    because it cannot be recovered from them: rotating a group turns every
    member AND orbits it, so the members alone only ever yield an axis-aligned
    union, and the frame would spring back square after each turn. The frame's
    BOX stays derived from the members in that angle's space — storing it too
    would go stale the moment one member moved. Absent = 0, per the additive
    rule (SEAMS: decision of record, superseding "a group has none of its
    own"). */
export const GroupSchema = z.object({
  id: z.string(),
  parentGroupId: z.string().optional(),
  /** Degrees, clockwise, about the frame's centre — same convention as an
      object's own rotation. */
  rotation: z.number().optional(),
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

/** Binding (§1.2, decided in PLAN.md §6.8): "facing" turns the document into
    spreads. Spread membership itself is NEVER stored — it derives from page
    order via `spreadsOf` below, so it cannot drift out of agreement with the
    page array on insert, delete, duplicate, or reorder. */
export const BindingSchema = z.enum(["single", "facing"]);
export type Binding = z.infer<typeof BindingSchema>;

/** Per-edge margins (§1.2's mirrored inside/outside margins), inches. The
    spine-side edge is `inside`, so a gutter allowance survives a page moving
    from verso to recto. `effectiveMargins` resolves these to left/right for a
    given page; under single binding inside reads as left. */
export const EdgeMarginsSchema = z.object({
  top: z.number().min(0),
  bottom: z.number().min(0),
  inside: z.number().min(0),
  outside: z.number().min(0),
});
export type EdgeMargins = z.infer<typeof EdgeMarginsSchema>;

/**
 * A page. `masterId` is a soft reference (the lineage rule): store actions
 * guard it; a dangling id renders furniture-less rather than erroring.
 * Per-page setup values (§1.4) follow the lineage's `sizeOverride` pattern —
 * one optional override per document-level setup field; absent = the
 * document value.
 */
export const LayoutPageSchema = z.object({
  id: z.string(),
  masterId: z.string().nullable(),
  objects: z.array(LayoutObjectSchema),
  /** Per-page size override (the lineage field), inches. */
  sizeOverride: PageSizeSchema.optional(),
  bleedOverride: z.number().min(0).optional(),
  marginOverride: z.number().min(0).optional(),
  /** Per-edge form of `marginOverride`; wins over it where present. */
  marginsOverride: EdgeMarginsSchema.optional(),
  slugOverride: z.number().min(0).optional(),
  columnsOverride: z.number().int().min(1).optional(),
  baselineGridOverride: BaselineGridSchema.optional(),
  /** Per-page ruler guides; document-level guides remain in doc.guides. */
  guides: GuidesSchema.optional(),
  /** Per-page layer visibility overrides, keyed by layer id (§2.2). */
  layerOverrides: z.record(z.object({ visible: z.boolean() })).optional(),
  /** Joins this page to the preceding spread instead of starting a new one —
      §1.2's gatefolds and island spreads. Absent = start a new spread.
      Ignored under single binding. */
  keepWithPrevious: z.boolean().optional(),
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
  /** Single-page or facing-page (spread) document (§1.2). */
  binding: BindingSchema.default("single"),
  /** Per-edge distances, inches: trim → bleed; slug joins them first-class (§1.4). */
  bleed: z.number().min(0),
  margin: z.number().min(0),
  /** Per-edge margins; wins over the scalar `margin` where present (§1.2). */
  margins: EdgeMarginsSchema.optional(),
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

/* ── Spreads: derived, never stored (PLAN.md §6.8) ─────────────────────── */

/** One spread as the canvas and the Pages panel display it: page indices in
    page order. Under single binding every spread holds exactly one page. */
export type Spread = { pageIndices: number[] };

/**
 * Spread membership as a pure function of page order, binding, and
 * `keepWithPrevious` — the §6.8 invariant. Because nothing is stored, an
 * insert, delete, duplicate, or reorder needs no reconciliation step: the
 * next call simply reflects the new page order.
 *
 * Facing rule: the first page sits alone on the recto, then pages pair;
 * `keepWithPrevious` appends to the current spread regardless of how full it
 * is, which is how gatefolds and island spreads exceed two pages (§1.2).
 */
export function spreadsOf(doc: LayoutDocument): Spread[] {
  if (doc.binding === "single") return doc.pages.map((_, i) => ({ pageIndices: [i] }));

  const spreads: Spread[] = [];
  doc.pages.forEach((page, i) => {
    const current = spreads[spreads.length - 1];
    // The opening spread is the solo recto; every later spread pairs.
    const capacity = spreads.length === 1 ? 1 : 2;
    if (current && (page.keepWithPrevious || current.pageIndices.length < capacity)) {
      current.pageIndices.push(i);
    } else {
      spreads.push({ pageIndices: [i] });
    }
  });
  return spreads;
}

/** The spread a page belongs to, or undefined if the index is out of range. */
export function spreadOfPage(doc: LayoutDocument, pageIndex: number): Spread | undefined {
  return spreadsOf(doc).find((s) => s.pageIndices.includes(pageIndex));
}

/**
 * Which side of the spine a page falls on. Derived from page index, not from
 * spread membership, so it stays correct through island spreads: page 1 is
 * the recto (right-hand) page, and sides alternate from there — the universal
 * print convention. Single binding has no spine; every page reads as recto so
 * `inside` resolves to the left edge.
 */
export function pageSide(doc: LayoutDocument, pageIndex: number): "verso" | "recto" {
  if (doc.binding === "single") return "recto";
  return pageIndex % 2 === 0 ? "recto" : "verso";
}

/** Margins resolved to physical edges for one page, inches. */
export type ResolvedMargins = { top: number; bottom: number; left: number; right: number };

/**
 * Effective margins for a page. Resolution is **page level before document
 * level** — the rule every other override in this schema follows — with the
 * per-edge form preferred over the scalar *within* a level. So a page's
 * uniform `marginOverride` still beats a document-wide `margins`, rather than
 * being masked by it.
 *
 * Inside/outside then map to left/right by the page's side: on a recto the
 * spine is at the left, on a verso at the right. An out-of-range index
 * resolves to document-level values, matching the soft-reference rule
 * `effectivePageSetup` follows.
 *
 * NOTE: `core/render/pageSetup.ts` still resolves the scalar margin only; it
 * adopts this when the Document structure tranche wires spread furniture.
 */
export function effectiveMargins(doc: LayoutDocument, pageIndex: number): ResolvedMargins {
  const page = doc.pages[pageIndex];
  const uniform = (value: number): ResolvedMargins => ({
    top: value,
    bottom: value,
    left: value,
    right: value,
  });

  const edges = page?.marginsOverride ?? (page?.marginOverride === undefined ? doc.margins : undefined);
  if (!edges) return uniform(page?.marginOverride ?? doc.margin);

  const spineAtLeft = pageSide(doc, pageIndex) === "recto";
  return {
    top: edges.top,
    bottom: edges.bottom,
    left: spineAtLeft ? edges.inside : edges.outside,
    right: spineAtLeft ? edges.outside : edges.inside,
  };
}
