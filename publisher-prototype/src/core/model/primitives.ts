import { z } from "zod";

/**
 * Schema v3 primitives — geometry, colour, stroke, fill, and effects
 * (PLAN.md §6.6).
 *
 * Geometry is canonical inches, matching the canvas foundation (§6.2). Field
 * names carry the `In` suffix the prototype already uses in `core/geometry/`
 * and the document slice; the v2 lineage's bare `x/y/w/h` is deliberately not
 * carried over, so the canonical unit is legible at every field rather than
 * only in a header comment.
 *
 * Colour is the §9.4 delta: every ink is a `ColorRef` that either points at a
 * document swatch or carries a literal value, so the Swatches panel can
 * re-point brand colours without walking every object.
 */

/** A point in document space, inches. */
export const PointSchema = z.object({ xIn: z.number(), yIn: z.number() });
export type Point = z.infer<typeof PointSchema>;

/** A positive extent, inches. */
export const SizeSchema = z.object({
  wIn: z.number().positive(),
  hIn: z.number().positive(),
});
export type Size = z.infer<typeof SizeSchema>;

/** Four-sided inset/outset, inches — insets, wrap distance, slug, rules. */
export const EdgesSchema = z.object({
  lIn: z.number(),
  rIn: z.number(),
  tIn: z.number(),
  bIn: z.number(),
});
export type Edges = z.infer<typeof EdgesSchema>;

/**
 * Colour spaces the model stores (§9.4: RGB selection, CMYK-aware workflows,
 * spot workflows). Components are normalised 0–1 in every space so tinting and
 * interpolation need no per-space special cases; the UI presents 0–255 or
 * 0–100% as it prefers.
 */
export const ColorSpaceSchema = z.enum(["rgb", "cmyk", "spot"]);
export type ColorSpace = z.infer<typeof ColorSpaceSchema>;

const componentsFor: Record<ColorSpace, number> = { rgb: 3, cmyk: 4, spot: 4 };

/**
 * A literal colour value. `spot` carries its ink name plus a four-component
 * CMYK alternate — what separates on plate, and what previews on screen.
 */
export const ColorValueSchema = z
  .object({
    space: ColorSpaceSchema,
    values: z.array(z.number().min(0).max(1)).min(3).max(4),
    /** Spot only: the ink name as the print shop knows it, e.g. "PANTONE 032 C". */
    spotName: z.string().optional(),
  })
  .superRefine((color, ctx) => {
    const expected = componentsFor[color.space];
    if (color.values.length !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${color.space} takes ${expected} components, got ${color.values.length}`,
        path: ["values"],
      });
    }
    if (color.space === "spot" && !color.spotName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "spot colours must name their ink",
        path: ["spotName"],
      });
    }
    if (color.space !== "spot" && color.spotName !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "spotName belongs to spot colours only",
        path: ["spotName"],
      });
    }
  });
export type ColorValue = z.infer<typeof ColorValueSchema>;

/**
 * A named document swatch (§9.4 custom palettes and theme colours). Objects
 * reference these by id, so editing the swatch restyles every user of it.
 */
export const SwatchSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: ColorValueSchema,
  /** Theme swatches are the ones a theme swap re-points (§9.4). */
  theme: z.boolean().default(false),
});
export type Swatch = z.infer<typeof SwatchSchema>;

/**
 * An ink reference: a swatch id with a tint, or a one-off literal. Both forms
 * exist because brand colours must stay linked while ad-hoc picks must not
 * pollute the palette.
 */
export const ColorRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("swatch"),
    swatchId: z.string(),
    /** 0–1 screen of the swatch; 1 = full strength. */
    tint: z.number().min(0).max(1).default(1),
  }),
  z.object({ kind: z.literal("literal"), value: ColorValueSchema }),
]);
export type ColorRef = z.infer<typeof ColorRefSchema>;

/** Dash patterns a stroke can take. */
export const DashSchema = z.enum(["solid", "dash", "dot", "dashDot"]);
export type Dash = z.infer<typeof DashSchema>;

/** Object outline — also §4.3's picture border. */
export const StrokeSchema = z.object({
  color: ColorRefSchema,
  widthIn: z.number().min(0),
  dash: DashSchema.default("solid"),
});
export type Stroke = z.infer<typeof StrokeSchema>;

/** One stop on a gradient ramp. */
export const GradientStopSchema = z.object({
  /** Position along the ramp, 0–1. */
  at: z.number().min(0).max(1),
  color: ColorRefSchema,
});
export type GradientStop = z.infer<typeof GradientStopSchema>;

/**
 * Fill. The gradient arm is pulled in by the Shapes group's "fill/stroke/
 * gradient" deliverable (§7) rather than by a §6.6 table row — flagged here
 * because it is the one fill shape the deltas table does not itself name.
 */
export const FillSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("solid"), color: ColorRefSchema }),
  z.object({
    kind: z.literal("gradient"),
    type: z.enum(["linear", "radial"]),
    /** Ramp direction for linear gradients, degrees clockwise from east. */
    angleDeg: z.number().default(0),
    stops: z.array(GradientStopSchema).min(2),
  }),
]);
export type Fill = z.infer<typeof FillSchema>;

/**
 * Blend modes. §2.2 requires Normal, Multiply, Screen, Overlay, Darken,
 * Lighten, and Soft Light "at minimum"; this is exactly that set — widening it
 * is a decision for the Layers panel's group, not for the schema draft.
 */
export const BlendModeSchema = z.enum([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "softLight",
]);
export type BlendMode = z.infer<typeof BlendModeSchema>;

/** Opacity, 0–1. The UI presents §2.2's 0–100 percent. */
export const OpacitySchema = z.number().min(0).max(1);

/**
 * §4.3 graphic effects. Each arm is optional and independently removable,
 * which is what "effect removal or reset" needs.
 *
 * ASSUMPTION: the requirement names the five effects but not their parameters;
 * these are the conventional control sets (offset/blur/colour for shadow,
 * and so on). SME review of §4.3 should confirm the parameter list before the
 * Effects panel is built against it.
 */
export const ShadowEffectSchema = z.object({
  offsetIn: PointSchema,
  blurIn: z.number().min(0),
  color: ColorRefSchema,
  opacity: OpacitySchema.default(0.5),
});
export type ShadowEffect = z.infer<typeof ShadowEffectSchema>;

export const GlowEffectSchema = z.object({
  radiusIn: z.number().min(0),
  color: ColorRefSchema,
  opacity: OpacitySchema.default(0.5),
});
export type GlowEffect = z.infer<typeof GlowEffectSchema>;

export const SoftEdgeEffectSchema = z.object({ radiusIn: z.number().min(0) });
export type SoftEdgeEffect = z.infer<typeof SoftEdgeEffectSchema>;

export const BevelEffectSchema = z.object({
  style: z.enum(["circle", "softRound", "angle", "hardEdge"]),
  widthIn: z.number().min(0),
  heightIn: z.number().min(0),
});
export type BevelEffect = z.infer<typeof BevelEffectSchema>;

export const ReflectionEffectSchema = z.object({
  /** Strength of the mirrored copy at its brightest, 0–1. */
  opacity: OpacitySchema,
  /** Gap between the object and its reflection, inches. */
  offsetIn: z.number().min(0),
  /** How far down the reflection fades to nothing, as a fraction of height. */
  size: z.number().min(0).max(1).default(0.5),
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

/**
 * Vector path segments, carried over from the v2 lineage unchanged: absolute
 * M/L/C/Z only, with coordinates NORMALISED 0–1 inside the object's frame box
 * so move/resize/align tooling works on the frame and the path scales with it.
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
