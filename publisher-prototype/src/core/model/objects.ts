import { z } from "zod";
import { BlendModeSchema, PaintSchema } from "./color";
import { PhotoOpSchema } from "./photo";
import { ParagraphSchema, TextInsetSchema, TextPropsSchema } from "./typography";

/**
 * Canvas objects (PLAN.md §6.6) — the v2 lineage's object shapes carried
 * whole (frame box + rotation + locked + fill/stroke; normalized vector
 * paths; picture asset binding; line endpoints), renamed to the registry's
 * ObjectType vocabulary (src/core/registry/types.ts) so every creatable
 * object type has exactly one schema member: textFrame, pictureFrame, table,
 * shape, line, mergeField.
 *
 * Registry types with no schema member, by design:
 * - "guide": guides are document/page-level setup (`doc.guides`,
 *   `page.guides`), not canvas objects — the guide tool writes there.
 * - "buildingBlock": placing a block instantiates ordinary objects; the
 *   gallery is panel state, not a document object type.
 *
 * Geometry is canonical inches; z-order is array order.
 */

/**
 * Vector path segments — absolute-form M/L/C/Z only (the lineage's full
 * vocabulary; arcs are cubic-approximated upstream). Coordinates are
 * NORMALIZED 0–1 within the object's frame box, so move/resize/align tooling
 * works on x/y/w/h unchanged and the path scales.
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

/** Stroke — the lineage's shape with the hex color generalized to a Paint.
    Width in points (the print-rule convention, matching font sizes). */
export const StrokeSchema = z.object({
  paint: PaintSchema,
  width: z.number().min(0),
});
export type Stroke = z.infer<typeof StrokeSchema>;

/** ASSUMPTION: effect parameter sets are Publisher-parity guesses — the §6.6
    delta names the five effect slots (shadow/glow/softEdge/bevel/reflection),
    not their parameters. Lengths in inches, opacity 0–1. */
export const ShadowEffectSchema = z.object({
  color: PaintSchema,
  offsetX: z.number(),
  offsetY: z.number(),
  blur: z.number().min(0),
  opacity: z.number().min(0).max(1),
});
export type ShadowEffect = z.infer<typeof ShadowEffectSchema>;

export const GlowEffectSchema = z.object({
  color: PaintSchema,
  radius: z.number().min(0),
  opacity: z.number().min(0).max(1),
});
export type GlowEffect = z.infer<typeof GlowEffectSchema>;

export const SoftEdgeEffectSchema = z.object({
  radius: z.number().min(0),
});
export type SoftEdgeEffect = z.infer<typeof SoftEdgeEffectSchema>;

export const BevelEffectSchema = z.object({
  width: z.number().min(0),
  height: z.number().min(0),
});
export type BevelEffect = z.infer<typeof BevelEffectSchema>;

export const ReflectionEffectSchema = z.object({
  opacity: z.number().min(0).max(1),
  offset: z.number().min(0),
  blur: z.number().min(0),
});
export type ReflectionEffect = z.infer<typeof ReflectionEffectSchema>;

export const EffectsSchema = z.object({
  shadow: ShadowEffectSchema.optional(),
  glow: GlowEffectSchema.optional(),
  softEdge: SoftEdgeEffectSchema.optional(),
  bevel: BevelEffectSchema.optional(),
  reflection: ReflectionEffectSchema.optional(),
});
export type Effects = z.infer<typeof EffectsSchema>;

/** ASSUMPTION: the mode vocabulary is Publisher's wrap set — the §6.6 delta
    gives `{ mode, distance, boundary? }` without naming the modes. */
export const WrapModeSchema = z.enum(["none", "square", "tight", "through", "topAndBottom"]);
export type WrapMode = z.infer<typeof WrapModeSchema>;

/** Consumed by the line breaker as exclusion geometry (§3.4). */
export const TextWrapSchema = z.object({
  mode: WrapModeSchema,
  /** Standoff, inches. */
  distance: z.number().min(0).default(0),
  /** Custom contour, normalized 0–1 in the object's frame box (tight/through);
      absent = the object's own outline. */
  boundary: z.array(PathSegSchema).optional(),
});
export type TextWrap = z.infer<typeof TextWrapSchema>;

/** In-frame crop transform: how the image sits inside the picture frame.
    `x`/`y` pan the image as fractions of the frame box (0 = natural
    placement), `scale` multiplies the fit-derived size, `rotation` is degrees
    about the frame center. Applies on top of `fit`. */
export const CropTransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  scale: z.number().positive(),
  rotation: z.number(),
});
export type CropTransform = z.infer<typeof CropTransformSchema>;

/** Fields every canvas object carries. New-in-v3 fields are optional so the
    lineage's additive rule holds: absent layerId = the document's first
    layer; absent groupId = ungrouped; absent opacity = 1; absent blend =
    normal; absent wrap = none. */
const objectShared = {
  id: z.string(),
  /** Soft reference into doc.layers — same guard rule as the lineage's masterId. */
  layerId: z.string().optional(),
  /** ASSUMPTION: minimal nested grouping — membership lives on the object,
      nesting lives in doc.groups via parentGroupId (§5.1 group editing is
      Phase B; only the model ships now). */
  groupId: z.string().optional(),
  locked: z.boolean(),
  opacity: z.number().min(0).max(1).optional(),
  blend: BlendModeSchema.optional(),
  effects: EffectsSchema.optional(),
  wrap: TextWrapSchema.optional(),
};

/** Fields every rectangular-frame object adds: the frame box (inches),
    rotation (degrees, about the frame CENTER — decision of record in
    SEAMS.md), and fill/stroke (null = none, the lineage rule). */
const frameShared = {
  ...objectShared,
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number(),
  fill: PaintSchema.nullable(),
  stroke: StrokeSchema.nullable(),
};

export const TextFrameSchema = z.object({
  ...frameShared,
  type: z.literal("textFrame"),
  text: TextPropsSchema,
  /** Threading (the lineage fields, activated by the link tool §3.2): frames
      sharing a storyId hold one story; prev/next order the chain. Soft
      references; absent = an unthreaded single frame. */
  storyId: z.string().optional(),
  prevFrameId: z.string().optional(),
  nextFrameId: z.string().optional(),
});
export type TextFrame = z.infer<typeof TextFrameSchema>;

export const PictureFrameSchema = z.object({
  ...frameShared,
  type: z.literal("pictureFrame"),
  /** Key into doc.assets; absent = the placeholder frame. Bytes live outside
      the document (asset store rule). */
  assetId: z.string().optional(),
  /** How the image fills the frame; absent = "cover". */
  fit: z.enum(["cover", "stretch", "contain"]).optional(),
  /** In-frame pan/zoom/rotate applied on top of `fit`. */
  crop: CropTransformSchema.optional(),
  /** Ordered adjust recipe (§6.5) — replaces the lineage's baked photoEdit
      result: the recipe is stored raw and replayed, full-resolution replay at
      export being the registered seam. */
  adjust: z.array(PhotoOpSchema).default([]),
});
export type PictureFrame = z.infer<typeof PictureFrameSchema>;

export const TableCellSchema = z.object({
  /** Span counts; absent = 1. Grid positions covered by a span are simply
      omitted from their row — Σ(colSpan) per row versus the column count is
      a store/editor invariant, not schema-enforced (the masterId rule). */
  rowSpan: z.number().int().min(1).optional(),
  colSpan: z.number().int().min(1).optional(),
  /** A cell is a text frame: same paragraph schema, same engine (§8.1). */
  paragraphs: z.array(ParagraphSchema).min(1),
  borders: z
    .object({
      top: StrokeSchema.optional(),
      right: StrokeSchema.optional(),
      bottom: StrokeSchema.optional(),
      left: StrokeSchema.optional(),
    })
    .optional(),
  shading: PaintSchema.optional(),
  inset: TextInsetSchema.optional(),
  vAlign: z.enum(["top", "middle", "bottom"]).optional(),
});
export type TableCell = z.infer<typeof TableCellSchema>;

export const TableRowSchema = z.object({
  /** Inches; absent = auto (content-derived). */
  height: z.number().positive().optional(),
  cells: z.array(TableCellSchema),
});
export type TableRow = z.infer<typeof TableRowSchema>;

export const TableColumnSchema = z.object({
  /** Inches. */
  width: z.number().positive(),
});
export type TableColumn = z.infer<typeof TableColumnSchema>;

export const TableFrameSchema = z.object({
  ...frameShared,
  type: z.literal("table"),
  columns: z.array(TableColumnSchema).min(1),
  rows: z.array(TableRowSchema).min(1),
});
export type TableFrame = z.infer<typeof TableFrameSchema>;

/** A point in the frame's unit box — the coordinate space every normalized
    path here speaks. Not clamped: a callout's tail tip lives outside it. */
export const NormalizedPointSchema = z.object({ x: z.number(), y: z.number() });
export type NormalizedPoint = z.infer<typeof NormalizedPointSchema>;

/**
 * The four corners a callout's tail can be SEEDED from (§4.4 callouts) — a
 * draw-time preset in the tool's options bar, not storage. The placed object
 * keeps a free `tailTip` instead, which the adjust handle moves anywhere.
 */
export const CalloutTailAnchorSchema = z.enum([
  "bottom-left",
  "bottom-right",
  "top-left",
  "top-right",
]);
export type CalloutTailAnchor = z.infer<typeof CalloutTailAnchorSchema>;

/** Where each preset puts the tip: just outside that corner, so a freshly
    drawn callout has a tail of real length pointing the way it was asked to. */
export function tailTipFor(anchor: CalloutTailAnchor): NormalizedPoint {
  return {
    x: anchor.endsWith("right") ? 0.94 : 0.06,
    y: anchor.startsWith("bottom") ? 1.22 : -0.22,
  };
}

/**
 * Shape object — the lineage's non-content frame kinds folded under the
 * registry's single "shape" object type.
 *
 * PARAMETRIC KINDS store the parameter that shapes them (the additive v3
 * delta SEAMS.md deferred, no version bump per the additive rule) instead of
 * baking it into a path: the outline derives from the parameter and the frame
 * wherever it is drawn or hit-tested, so the parameter stays editable after
 * the shape is placed and survives a resize as itself. `path` remains for
 * shapes with no parameters to speak of — the pen's freeform output, and the
 * banner, whose only contracted adjustment has no tool option behind it yet.
 *
 * Each kind carries EXACTLY its own geometry fields (SHAPE_GEOMETRY_FIELDS),
 * enforced by the refine on LayoutObjectSchema.
 */
export const ShapeObjectSchema = z.object({
  ...frameShared,
  type: z.literal("shape"),
  shape: z.enum([
    "rect",
    "ellipse",
    "roundedRect",
    "starPolygon",
    "callout",
    "banner",
    "path",
  ]),
  /** Path shapes only: normalized segments — see PathSegSchema. */
  d: z.array(PathSegSchema).optional(),
  /** Rounded rectangles only: corner radius in INCHES. Kept as the user set
      it: a resize can leave it above the geometric bound of half the shorter
      side, and the bound is applied where the shape is drawn and hit-tested
      (clampCornerRadius), so growing the frame back restores the radius
      rather than losing it. */
  cornerRadius: z.number().nonnegative().optional(),
  /** Stars/polygons only: vertex count (3+) and how deep the points cut, as
      a fraction of the outer radius. */
  points: z.number().int().min(3).optional(),
  innerRadiusRatio: z.number().min(0).max(1).optional(),
  /** Callouts only: where the pointer tail's TIP sits, normalized to the
      frame box like every other path coordinate here. Usually outside 0–1 —
      that is what gives the tail length — so the tail reaches past the body
      the way PowerPoint's does. Dragging it changes the tail's length and
      angle together. */
  tailTip: NormalizedPointSchema.optional(),
  /** Banners only: the two ribbon adjustments, each a fraction of the frame —
      how far the raised panel's sides sit in from the edges, and where its
      bottom edge falls. The tails, folds and notches follow from them. */
  panelInset: z.number().optional(),
  panelHeight: z.number().optional(),
});
export type ShapeObject = z.infer<typeof ShapeObjectSchema>;

/** The geometry field(s) each shape kind owns — the refine's table, and the
    single place a new parametric kind declares what shapes it. */
export const SHAPE_GEOMETRY_FIELDS = {
  rect: [],
  ellipse: [],
  roundedRect: ["cornerRadius"],
  starPolygon: ["points", "innerRadiusRatio"],
  callout: ["tailTip"],
  banner: ["panelInset", "panelHeight"],
  path: ["d"],
} as const satisfies Record<ShapeObject["shape"], readonly (keyof ShapeObject)[]>;

/** Line-end decoration vocabulary (§4.4 arrows — the arrow tool's contract
    option set, user-ratified 2026-08-18 as an additive v3 delta recorded in
    SEAMS.md). */
export const ArrowHeadSchema = z.enum(["none", "arrow", "circle", "diamond"]);
export type ArrowHead = z.infer<typeof ArrowHeadSchema>;

export const ArrowHeadSizeSchema = z.enum(["s", "m", "l"]);
export type ArrowHeadSize = z.infer<typeof ArrowHeadSizeSchema>;

export const LineDashSchema = z.enum(["solid", "dashed", "dotted"]);
export type LineDash = z.infer<typeof LineDashSchema>;

/** Endpoints in inches — the lineage shape, plus the v3 shared fields and
    the additive line-decoration delta: absent headStart/headEnd = "none",
    absent headSize = "m", absent dash = "solid" (the additive rule — tools
    omit default values so lean lineage documents stay valid unchanged). */
export const LineObjectSchema = z.object({
  ...objectShared,
  type: z.literal("line"),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  stroke: StrokeSchema,
  headStart: ArrowHeadSchema.optional(),
  headEnd: ArrowHeadSchema.optional(),
  headSize: ArrowHeadSizeSchema.optional(),
  dash: LineDashSchema.optional(),
});
export type LineObject = z.infer<typeof LineObjectSchema>;

/** ASSUMPTION: a standalone merge field is a text-frame-like object carrying
    the bound column name — §7.1 states the capability (placeholder display,
    live-record preview), not the object shape. `text` styles the rendered
    value; absent = the surrounding defaults. Inline fields (inside a text
    frame's story) are a text-engine tranche concern, not an object type. */
export const MergeFieldObjectSchema = z.object({
  ...frameShared,
  type: z.literal("mergeField"),
  /** Data-source column name, e.g. "firstName". */
  field: z.string(),
  text: TextPropsSchema.optional(),
});
export type MergeFieldObject = z.infer<typeof MergeFieldObjectSchema>;

const LayoutObjectUnionSchema = z.discriminatedUnion("type", [
  TextFrameSchema,
  PictureFrameSchema,
  TableFrameSchema,
  ShapeObjectSchema,
  LineObjectSchema,
  MergeFieldObjectSchema,
]);

/** Every geometry field any shape kind owns — the domain the refine checks
    each object against its own kind's row. */
const ALL_SHAPE_GEOMETRY_FIELDS = [
  ...new Set(Object.values(SHAPE_GEOMETRY_FIELDS).flat()),
] as readonly (keyof ShapeObject)[];

/** The object union plus the cross-field invariants a discriminated-union
    member can't express itself (the PhotoOpSchema pattern): a shape carries
    exactly the geometry fields its kind owns (SHAPE_GEOMETRY_FIELDS) and
    none of the others, so a parametric kind can never lose the parameter
    that shapes it or carry one meant for a different kind. */
export const LayoutObjectSchema = LayoutObjectUnionSchema.superRefine((obj, ctx) => {
  if (obj.type !== "shape") return;
  const owned: readonly (keyof ShapeObject)[] = SHAPE_GEOMETRY_FIELDS[obj.shape];
  for (const field of ALL_SHAPE_GEOMETRY_FIELDS) {
    const present = obj[field] != null;
    if (present !== owned.includes(field)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `shape: kind '${obj.shape}' ${owned.includes(field) ? "requires" : "must not carry"} \`${field}\``,
      });
    }
  }
  // `d` is the one field an empty value would satisfy vacuously.
  if (obj.shape === "path" && (obj.d?.length ?? 0) === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["d"],
      message: "shape: kind 'path' requires NON-EMPTY `d`",
    });
  }
});
export type LayoutObject = z.infer<typeof LayoutObjectSchema>;
