import { z } from "zod";

/**
 * Color model (redesign plan Phase 12, decision 13) — the publisher
 * prototype's shape, adopted unchanged so the eventual merge is a rename, not
 * a translation. Every fill, stroke, and run ink in the document is a Paint
 * that either references a document swatch by id or embeds a literal color
 * carrying its own space. Channels are normalized 0–1 in every space so no
 * consumer guesses at 0–255 vs 0–100 conventions; the picker scales for
 * display (percent for CMYK, 0–255 for RGB).
 *
 * A CMYK literal is what a print operator typed: it reaches the export step
 * untouched. An RGB literal is converted there through the press profile.
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
    name plus a CMYK process fallback in `values` (preview renders the
    fallback; separations address `spotName`). */
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
    color. `swatchId` is a soft reference like `masterId` — a dangling id
    renders as the literal fallback black rather than erroring. */
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
