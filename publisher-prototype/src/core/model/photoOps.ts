import { z } from "zod";
import { ColorRefSchema } from "./primitives";

/**
 * The photo recipe vocabulary — schema v3's `adjust: PhotoOp[]` (PLAN.md §6.6,
 * requirements §4.2). One vocabulary serves both the layout Image panel and
 * photo mode, per §6.5's "one engine, three shapes, one recipe vocabulary".
 *
 * The op NAMES are seeded from the POC's proven recipe (crop, rotate, flip,
 * straighten, adjust, autoEnhance, bleedExpand, erase, and the two overlay
 * ops), which a real-document corpus exercised end to end.
 *
 * The op SHAPES deliberately diverge. The POC's ops carry STORED-EXPLICIT
 * resolved-pixel fields (`targetPx`, `px`, the approved `patch` raster) that
 * exist because its replay crosses a process boundary: the client pushes an
 * op, a jailed server re-renders from it, and the two must not re-derive
 * geometry independently. This prototype is fully client-side (§6.7) with no
 * such boundary, so the ops here store the operator's INTENT only and the
 * engine derives pixels at evaluation time. Where a resolved value must
 * survive — the erase patch, once a model service produces it — it belongs to
 * that model-service seam, and lands here with the seam entry SEAMS.md gains
 * when the capability is built, not as a schema field invented now.
 *
 * §6.5's rebuild owns the final vocabulary; this is the storage shape the
 * schema commits to so picture frames can round-trip today.
 */

/** §4.2 tonal and colour controls. Values are absolute setpoints. */
export const AdjustParamSchema = z.enum([
  "brightness",
  "contrast",
  "exposure",
  "highlights",
  "shadows",
  "saturation",
  "temperature",
]);
export type AdjustParam = z.infer<typeof AdjustParamSchema>;

/**
 * An adjust setpoint: an integer in −100..+100 with 0 = identity. The bound is
 * load-bearing rather than cosmetic — the classical contrast factor
 * `f = 259·(v+255) / (255·(259−v))` divides by zero at v = 259, so an
 * unbounded value would poison every entry of a compiled LUT. −100..+100 is
 * also the surface's own slider range.
 */
export const AdjustValueSchema = z.number().int().min(-100).max(100);

/** A normalised rect inside the source image, 0–1 on both axes. */
export const NormalizedRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type NormalizedRect = z.infer<typeof NormalizedRectSchema>;

const opLabel = z.string();

export const PhotoOpSchema = z.discriminatedUnion("op", [
  /**
   * A crop of the source image. Normalised rather than pixel-valued so the op
   * survives the proxy/master resolution split (§6.5) without a stored
   * resolution to interpret it against.
   */
  z.object({
    op: z.literal("crop"),
    label: opLabel,
    rect: NormalizedRectSchema,
    /** The aspect preset that produced the rect ("4×6", "free"); display only. */
    ratio: z.string().nullable().default(null),
    shape: z.enum(["rect", "rounded", "circle"]).default("rect"),
  }),
  /** Quarter turns, positive = clockwise. Arbitrary angles are `straighten`. */
  z.object({
    op: z.literal("rotate"),
    label: opLabel,
    quarterTurns: z.number().int(),
  }),
  z.object({
    op: z.literal("flip"),
    label: opLabel,
    axis: z.enum(["horizontal", "vertical"]),
  }),
  z.object({
    op: z.literal("straighten"),
    label: opLabel,
    degrees: z.number(),
  }),
  z.object({
    op: z.literal("adjust"),
    label: opLabel,
    param: AdjustParamSchema,
    value: AdjustValueSchema,
  }),
  /** Computed once from the image, then stored as one named, replayable step. */
  z.object({
    op: z.literal("autoEnhance"),
    label: opLabel,
    params: z.record(AdjustParamSchema, AdjustValueSchema),
  }),
  /**
   * §9.2 bleed: grow the image past the trim so it survives trimming variance.
   * `amountIn` is intent; the engine resolves pixels against the frame's
   * effective resolution at evaluation time.
   */
  z.object({
    op: z.literal("bleedExpand"),
    label: opLabel,
    strategy: z.enum(["mirror", "smear", "solid"]),
    amountIn: z.number().min(0),
    /** Solid strategy only. */
    color: ColorRefSchema.optional(),
  }),
  /**
   * §4.2 object removal. `maskAssetId` is the brushed mask — the operator's
   * intent and the payload the inpaint seam is called with. The approved patch
   * is a seam result, not a schema field (see the module note).
   */
  z.object({
    op: z.literal("erase"),
    label: opLabel,
    maskAssetId: z.string(),
  }),
  /**
   * Overlay ops carry a `hidden` tombstone rather than being spliced out: the
   * recipe folds last-wins-per-id, so removing an overlay stays a pure cursor
   * move in history instead of a rewrite.
   */
  z.object({
    op: z.literal("textOverlay"),
    label: opLabel,
    id: z.string(),
    text: z.string(),
    family: z.string(),
    /** Size as a fraction of the image's short edge — resolution-independent. */
    size: z.number().positive(),
    bold: z.boolean().default(false),
    italic: z.boolean().default(false),
    color: ColorRefSchema,
    align: z.enum(["left", "center", "right"]).default("left"),
    box: NormalizedRectSchema,
    rotationDeg: z.number().default(0),
    hidden: z.boolean().default(false),
  }),
  z.object({
    op: z.literal("logoOverlay"),
    label: opLabel,
    id: z.string(),
    assetId: z.string(),
    box: NormalizedRectSchema,
    rotationDeg: z.number().default(0),
    hidden: z.boolean().default(false),
  }),
]);
export type PhotoOp = z.infer<typeof PhotoOpSchema>;
