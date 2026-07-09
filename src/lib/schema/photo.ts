import { z } from "zod";

/**
 * Photo-editor document model (plan §3.4) — the recipe IS the document.
 * Canonical units: raster ops address SOURCE PIXELS of the working master;
 * inches enter only where print sizes do (target.size, target.bleed,
 * bleedExpand.amount, resize inchesAtDpi).
 *
 * CONTRACT: PhotoDocumentSchema is the persistence shape (photo-store
 * `persist`), the client↔server render contract (PE3), and the history model
 * (ops[0..cursor) are applied; the rest is the redo tail). Ops are STORED
 * EXPLICIT — auto-enhance writes the values it chose — so replay never
 * re-derives. Every op carries a human `label` for the history dock (the
 * wires' canonical strings, plan §5). Op unions are additive: deferred ops
 * (the withdrawn Pro set, model-backed fills) arrive in later schema revs
 * without migration.
 *
 * Intake/diagnostics API schemas live here too (client.ts Zod-validates every
 * response — the import/client.ts pattern). RenderRequest schemas land with
 * the export spine (PE3).
 */

export const PhotoColorSpaceSchema = z.enum(["rgb", "cmyk"]);
export type PhotoColorSpace = z.infer<typeof PhotoColorSpaceSchema>;

/** Export intent — defaults from source.colorSpace: CMYK arrivals stay cmyk;
    RGB arrivals sit at srgb until the one-click convert flips it (dev #6). */
export const PhotoIntentSchema = z.enum(["cmyk", "srgb"]);
export type PhotoIntent = z.infer<typeof PhotoIntentSchema>;

/** Adjust parameters (plan §3.4). The UI label for `temperature` is "Warmth". */
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

/** Axis-aligned rect in working-master pixels. */
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

const opLabel = z.string(); // human history-dock label, e.g. "Crop to 4 × 6"

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

export const ResizeOpSchema = z.object({
  op: z.literal("resize"),
  label: opLabel,
  mode: z.enum(["px", "inchesAtDpi", "percent"]),
  px: z.object({ width: z.number().int().min(1), height: z.number().int().min(1) }).optional(),
  inchesAtDpi: z
    .object({ w: z.number().min(0), h: z.number().min(0), dpi: z.number().min(1) })
    .optional(),
  percent: z.number().min(1).optional(),
});

export const AdjustOpSchema = z.object({
  op: z.literal("adjust"),
  label: opLabel,
  param: AdjustParamSchema,
  value: z.number(),
});

/** Auto-enhance: computed once, STORED EXPLICIT (plan §3.4) — one named step. */
export const AutoEnhanceOpSchema = z.object({
  op: z.literal("autoEnhance"),
  label: opLabel,
  params: z.record(AdjustParamSchema, z.number()),
});

export const BleedExpandOpSchema = z.object({
  op: z.literal("bleedExpand"),
  label: opLabel,
  strategy: z.enum(["mirror", "smear", "solid"]),
  /** Expansion per edge, inches (the wires' canonical 0.125 in). */
  amount: z.number().min(0),
  /** Solid strategy only (hex). */
  color: z.string().optional(),
});

export const FitToSizeOpSchema = z.object({
  op: z.literal("fitToSize"),
  label: opLabel,
  mode: z.enum(["fit", "fill"]),
  anchor: FitAnchorSchema,
});

export const TextOverlayOpSchema = z.object({
  op: z.literal("textOverlay"),
  label: opLabel,
  id: z.string(),
  text: z.string(),
  font: z.object({
    family: z.string(),
    /** Size in working-master pixels (raster surface — not points). */
    size: z.number().min(1),
    bold: z.boolean(),
    italic: z.boolean(),
  }),
  color: z.string(),
  align: z.enum(["left", "center", "right"]),
  box: PixelRectSchema,
  rotation: z.number(),
});

export const LogoOverlayOpSchema = z.object({
  op: z.literal("logoOverlay"),
  label: opLabel,
  id: z.string(),
  /** Blob-store id of the ingested (jail-rasterized) overlay image. */
  assetId: z.string(),
  box: PixelRectSchema,
  rotation: z.number(),
});

export const EraseOpSchema = z.object({
  op: z.literal("erase"),
  label: opLabel,
  /** Blob-store id of the brushed mask PNG (PE9's preview-approve loop). */
  maskAssetId: z.string(),
});

export const PhotoOpSchema = z.discriminatedUnion("op", [
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
export type PhotoOp = z.infer<typeof PhotoOpSchema>;

/** Master + proxy ids and dimensions enter the document; bytes stay in the
    blob store under `photo:`-namespaced ids (v1.4 — the store is shared with
    layout assets and photo writes must stay non-destructive). */
export const PhotoSourceSchema = z.object({
  assetId: z.string(),
  proxyAssetId: z.string(),
  masterMime: z.string(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  proxyWidth: z.number().int().min(1),
  proxyHeight: z.number().int().min(1),
  originalName: z.string(),
  colorSpace: PhotoColorSpaceSchema,
  /** Honest intake notes surfaced in UI ("metadata removed when opened", …). */
  intakeNotes: z.array(z.string()),
});
export type PhotoSource = z.infer<typeof PhotoSourceSchema>;

export const PhotoTargetSchema = z.object({
  /** Print size, inches — null until the associate picks one. */
  size: z.object({ w: z.number().min(0), h: z.number().min(0) }).nullable(),
  product: z.object({ sku: z.string(), label: z.string() }).nullable(),
  /** Bleed per edge, inches; 0 = not set. */
  bleed: z.number().min(0),
  intent: PhotoIntentSchema,
});
export type PhotoTarget = z.infer<typeof PhotoTargetSchema>;

export const PhotoDocumentSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  source: PhotoSourceSchema,
  target: PhotoTargetSchema,
  /** Ordered; array order = application order. */
  recipe: z.array(PhotoOpSchema),
  /** ops[0..cursor) are applied; the rest are the redo tail. */
  cursor: z.number().int().min(0),
});
export type PhotoDocument = z.infer<typeof PhotoDocumentSchema>;

/* ------------------------------------------------------------------ */
/* Intake API (POST /api/photo/intake) — plan §3.3 "Open"              */
/* ------------------------------------------------------------------ */

/** One encoded image leg of the intake response. A production service returns
    URLs instead of base64 — same note as the import report. */
export const IntakeImagePayloadSchema = z.object({
  b64: z.string(),
  mime: z.string(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});
export type IntakeImagePayload = z.infer<typeof IntakeImagePayloadSchema>;

export const IntakeErrorCodeSchema = z.enum([
  "not-an-image", // sniff failed or disguised bytes
  "unsupported-here", // sniffed fine, this server lacks the capability (HEIC without heif-convert, raw BMP)
  "too-large", // MAX_PHOTO_BYTES
  "too-many-pixels", // MAX_PHOTO_PIXELS
  "decode-failed", // jail decode died (truncated/hostile)
  "timeout", // jail wall-clock kill
  "engine-error", // engine missing or crashed outside decode
]);
export type IntakeErrorCode = z.infer<typeof IntakeErrorCodeSchema>;

export const IntakeSuccessSchema = z.object({
  ok: z.literal(true),
  master: IntakeImagePayloadSchema,
  proxy: IntakeImagePayloadSchema,
  meta: z.object({
    originalName: z.string(),
    colorSpace: PhotoColorSpaceSchema,
    /** Honest notes: metadata stripped, EXIF orientation applied, CMYK caveat, … */
    notes: z.array(z.string()),
  }),
});
export type IntakeSuccess = z.infer<typeof IntakeSuccessSchema>;

export const IntakeErrorSchema = z.object({
  ok: z.literal(false),
  code: IntakeErrorCodeSchema,
  /** Friendly, counter-ready copy — shown verbatim in the UI. */
  message: z.string(),
});
export type IntakeError = z.infer<typeof IntakeErrorSchema>;

export const IntakeResponseSchema = z.discriminatedUnion("ok", [
  IntakeSuccessSchema,
  IntakeErrorSchema,
]);
export type IntakeResponse = z.infer<typeof IntakeResponseSchema>;

/* ------------------------------------------------------------------ */
/* Diagnostics (GET /api/photo) — capability matrix, §3.5              */
/* ------------------------------------------------------------------ */

export const PhotoDiagnosticsSchema = z.object({
  engine: z
    .object({
      name: z.string(), // "sharp"
      version: z.string(),
      libvips: z.string(),
    })
    .nullable(),
  jailed: z.object({
    /** prlimit availability — false means wall-clock timeout is the only cap
        (the pub2raw diagnostics posture). */
    rlimits: z.boolean(),
  }),
  formats: z.object({
    jpeg: z.boolean(),
    png: z.boolean(),
    webp: z.boolean(),
    gif: z.boolean(),
    tiff: z.boolean(),
    heic: z.boolean(), // true only when heif-convert probes OK
    svg: z.boolean(),
    bmp: z.boolean(), // always false server-side (v1.4 — client-decode path)
  }),
});
export type PhotoDiagnostics = z.infer<typeof PhotoDiagnosticsSchema>;
