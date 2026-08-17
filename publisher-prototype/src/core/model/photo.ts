import { z } from "zod";

/**
 * Photo recipe vocabulary (PLAN.md §6.5, §6.6 "Picture adjust" delta) —
 * seeded from the POC's proven recipe architecture. A picture frame's
 * `adjust` is an ordered PhotoOp[]; array order is application order. Ops are
 * STORED EXPLICIT — anything computed (auto-enhance params, resolved pixel
 * dims) is written onto the op at commit time, so replay never re-derives.
 * Every op carries a human `label` for the history surface. The union is
 * additive: later ops arrive in later revs without a version bump.
 *
 * Units: raster ops address SOURCE PIXELS of the image asset; inches enter
 * only where print geometry does (bleedExpand.amount).
 */

/** Adjust parameters. The UI label for `temperature` is "Warmth". */
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

/** Axis-aligned rect in source pixels. */
export const PixelRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().min(0),
  h: z.number().min(0),
});
export type PixelRect = z.infer<typeof PixelRectSchema>;

export const FitAnchorSchema = z.enum([
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
]);
export type FitAnchor = z.infer<typeof FitAnchorSchema>;

const opLabel = z.string();

/**
 * An adjust `value` is an ABSOLUTE setpoint, −100..+100 with 0 = identity.
 * The bound is load-bearing (POC-proven): the classic contrast factor
 * divides by zero at v = 259, so an unbounded hostile value would poison the
 * compiled LUT with Infinity; −100..+100 is the surface's own slider range.
 */
const AdjustValueSchema = z.number().min(-100).max(100);

export const CropOpSchema = z.object({
  op: z.literal("crop"),
  label: opLabel,
  rect: PixelRectSchema,
  /** The aspect preset that produced the rect ("4×6", "free", …) — display only. */
  ratio: z.string().nullable(),
  shape: z.enum(["rect", "rounded", "circle"]),
});

export const RotateOpSchema = z.object({
  op: z.literal("rotate"),
  label: opLabel,
  /** Quarter turns, positive = clockwise (±1, ±2). Arbitrary angles are `straighten`. */
  quarterTurns: z.number().int(),
});

export const FlipOpSchema = z.object({
  op: z.literal("flip"),
  label: opLabel,
  axis: z.enum(["horizontal", "vertical"]),
});

export const StraightenOpSchema = z.object({
  op: z.literal("straighten"),
  label: opLabel,
  degrees: z.number(),
});

/** `mode`/`px`/`inchesAtDpi`/`percent` are operator INTENT (panel + history
    label); `targetPx` is the RESOLVED output the replay reads — stored
    explicit at commit, never re-derived. */
export const ResizeOpSchema = z.object({
  op: z.literal("resize"),
  label: opLabel,
  mode: z.enum(["px", "inchesAtDpi", "percent"]),
  px: z.object({ width: z.number().int().min(1), height: z.number().int().min(1) }).optional(),
  inchesAtDpi: z
    .object({ w: z.number().min(0), h: z.number().min(0), dpi: z.number().min(1) })
    .optional(),
  percent: z.number().min(1).optional(),
  targetPx: z.object({ width: z.number().int().min(1), height: z.number().int().min(1) }),
});

export const AdjustOpSchema = z.object({
  op: z.literal("adjust"),
  label: opLabel,
  param: AdjustParamSchema,
  value: AdjustValueSchema,
});

/** Auto-enhance: computed once, STORED EXPLICIT — one named history step. */
export const AutoEnhanceOpSchema = z.object({
  op: z.literal("autoEnhance"),
  label: opLabel,
  params: z.record(AdjustParamSchema, AdjustValueSchema),
});

export const BleedExpandOpSchema = z.object({
  op: z.literal("bleedExpand"),
  label: opLabel,
  strategy: z.enum(["mirror", "smear", "solid"]),
  /** Expansion per edge, inches — operator intent, kept for the history label. */
  amount: z.number().min(0),
  /** Solid strategy only (hex). */
  color: z.string().optional(),
  /** STORED EXPLICIT: pixels added per edge, resolved at commit time. */
  px: z.number().int().min(1),
});

/** Anchored white padding per edge, pixels — the fit-mode solve result. */
const FitPadSchema = z.object({
  l: z.number().int().min(0),
  t: z.number().int().min(0),
  r: z.number().int().min(0),
  b: z.number().int().min(0),
});

/** STORED EXPLICIT. Exactly one of `rect`/`pad` is present and it MATCHES the
    mode — enforced by the refine on PhotoOpSchema (a discriminated-union
    member can't carry its own refine, so the invariant rides one level up):
    fill → `rect` (anchored source crop), fit → `pad` (anchored padding). */
export const FitToSizeOpSchema = z.object({
  op: z.literal("fitToSize"),
  label: opLabel,
  mode: z.enum(["fit", "fill"]),
  anchor: FitAnchorSchema,
  rect: PixelRectSchema.optional(),
  pad: FitPadSchema.optional(),
});

/** The `hidden` tombstone: consumers fold the recipe last-wins-per-`id`; a
    removed overlay is written back with `hidden: true` rather than spliced
    out, so undo/redo across a remove stays a pure cursor move. */
export const TextOverlayOpSchema = z.object({
  op: z.literal("textOverlay"),
  label: opLabel,
  id: z.string(),
  text: z.string(),
  font: z.object({
    family: z.string(),
    /** Size in source pixels (raster surface — not points). */
    size: z.number().min(1),
    bold: z.boolean(),
    italic: z.boolean(),
  }),
  color: z.string(),
  align: z.enum(["left", "center", "right"]),
  box: PixelRectSchema,
  rotation: z.number(),
  hidden: z.boolean().optional(),
});

export const LogoOverlayOpSchema = z.object({
  op: z.literal("logoOverlay"),
  label: opLabel,
  id: z.string(),
  /** Asset-store id of the overlay image (metadata in `doc.assets`; bytes elsewhere). */
  assetId: z.string(),
  box: PixelRectSchema,
  rotation: z.number(),
  /** Remove-tombstone — same last-wins-per-id fold as TextOverlayOpSchema.hidden. */
  hidden: z.boolean().optional(),
});

/** STORED-EXPLICIT erase: the fill runs once at preview time; the approved
    patch raster is committed ON the op and replay composites ONLY it.
    `maskAssetId` is the operator's intent (kept for the model-service seam —
    a future inpaint re-runs from the same mask). */
export const EraseOpSchema = z.object({
  op: z.literal("erase"),
  label: opLabel,
  maskAssetId: z.string(),
  patch: z.object({
    id: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/i),
    /** Asset-store id of the patch raster. */
    assetId: z.string(),
    /** Patch placement in effective-image px at this op's recipe position;
        the patch raster's dims equal rect.w × rect.h — integral so a
        degenerate rect dies at parse. */
    rect: z.object({
      x: z.number().int().min(0),
      y: z.number().int().min(0),
      w: z.number().int().min(1),
      h: z.number().int().min(1),
    }),
  }),
});

const PhotoOpUnionSchema = z.discriminatedUnion("op", [
  CropOpSchema,
  RotateOpSchema,
  FlipOpSchema,
  StraightenOpSchema,
  ResizeOpSchema,
  AdjustOpSchema,
  AutoEnhanceOpSchema,
  BleedExpandOpSchema,
  FitToSizeOpSchema,
  TextOverlayOpSchema,
  LogoOverlayOpSchema,
  EraseOpSchema,
]);

/** The op union plus the one cross-field invariant a discriminated-union
    member can't express itself (fitToSize's mode-matched payload). The refine
    rides the whole union so the discriminator still produces clean
    "unknown op" errors first. */
export const PhotoOpSchema = PhotoOpUnionSchema.superRefine((op, ctx) => {
  if (op.op !== "fitToSize") return;
  const hasRect = op.rect != null;
  const hasPad = op.pad != null;
  const ok = op.mode === "fill" ? hasRect && !hasPad : hasPad && !hasRect;
  if (!ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "fitToSize: mode 'fill' requires exactly `rect` (no `pad`); mode 'fit' requires exactly `pad` (no `rect`)",
    });
  }
});
export type PhotoOp = z.infer<typeof PhotoOpSchema>;
