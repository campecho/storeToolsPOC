import { z } from "zod";

/**
 * Color model (PLAN.md §6.6 "Color model" delta) — swatches carry the named,
 * reusable colors the Swatches panel manages; every fill/stroke/ink in the
 * document is a Paint that either references a swatch by id or embeds a
 * literal color. Channels are normalized 0–1 in every space so no consumer
 * guesses at 0–255 vs 0–100 conventions.
 */

export const ColorSpaceSchema = z.enum(["rgb", "cmyk", "spot"]);
export type ColorSpace = z.infer<typeof ColorSpaceSchema>;

const ChannelSchema = z.number().min(0).max(1);

/** Literal device color. Spot exists only as a named swatch — a literal spot
    paint would be an unnamed ink, which no separation workflow can address. */
export const ColorValueSchema = z.discriminatedUnion("space", [
  z.object({
    space: z.literal("rgb"),
    values: z.tuple([ChannelSchema, ChannelSchema, ChannelSchema]),
  }),
  z.object({
    space: z.literal("cmyk"),
    values: z.tuple([ChannelSchema, ChannelSchema, ChannelSchema, ChannelSchema]),
  }),
]);
export type ColorValue = z.infer<typeof ColorValueSchema>;

/** A named color in the document's swatch list. A spot swatch carries the ink
    name plus a CMYK process fallback in `values` (preview and
    separations-off output render the fallback; separations address
    `spotName`). */
export const SwatchSchema = z.discriminatedUnion("space", [
  z.object({
    id: z.string(),
    name: z.string(),
    space: z.literal("rgb"),
    values: z.tuple([ChannelSchema, ChannelSchema, ChannelSchema]),
  }),
  z.object({
    id: z.string(),
    name: z.string(),
    space: z.literal("cmyk"),
    values: z.tuple([ChannelSchema, ChannelSchema, ChannelSchema, ChannelSchema]),
  }),
  z.object({
    id: z.string(),
    name: z.string(),
    space: z.literal("spot"),
    values: z.tuple([ChannelSchema, ChannelSchema, ChannelSchema, ChannelSchema]),
    spotName: z.string(),
  }),
]);
export type Swatch = z.infer<typeof SwatchSchema>;

/** Fill/stroke/ink value: a swatch reference (optionally tinted) or a literal
    color. `swatchId` is a soft reference like the lineage's `masterId` —
    store actions guard it; a dangling id renders as the literal fallback
    black rather than erroring. */
export const PaintSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("swatch"),
    swatchId: z.string(),
    /** 0–1 tint of the referenced swatch; absent = 1 (full strength). */
    tint: ChannelSchema.optional(),
  }),
  z.object({
    kind: z.literal("color"),
    color: ColorValueSchema,
  }),
]);
export type Paint = z.infer<typeof PaintSchema>;

/** Compositing modes shared by layers and objects — the canvas
    globalCompositeOperation set the render layer can honor directly. */
export const BlendModeSchema = z.enum([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "colorDodge",
  "colorBurn",
  "hardLight",
  "softLight",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);
export type BlendMode = z.infer<typeof BlendModeSchema>;
