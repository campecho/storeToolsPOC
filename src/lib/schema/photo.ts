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

/**
 * STORED-EXPLICIT rule (PE5, the three geometry-of-print ops going live —
 * bleedExpand / fitToSize / resize): the UI computes the pixel result at push
 * time and stores it ON the op; replay (client canvas + server compile) reads
 * ONLY the stored pixels and NEVER re-derives them from the document's
 * `target`. So `mode`/`px`/`inchesAtDpi`/`percent` are the operator's INTENT
 * (kept for the panel + history label), while `targetPx` is the RESOLVED output
 * dimensions that both engines fold and render. Pre-release schema v1 — no
 * migration; `targetPx` is required from day one.
 */
export const ResizeOpSchema = z.object({
  op: z.literal("resize"),
  label: opLabel,
  mode: z.enum(["px", "inchesAtDpi", "percent"]),
  px: z.object({ width: z.number().int().min(1), height: z.number().int().min(1) }).optional(),
  inchesAtDpi: z
    .object({ w: z.number().min(0), h: z.number().min(0), dpi: z.number().min(1) })
    .optional(),
  percent: z.number().min(1).optional(),
  /** Resolved output dimensions (stored-explicit) — the ONLY field replay reads.
      effectiveDims folds resize → targetPx (geometry.ts). */
  targetPx: z.object({ width: z.number().int().min(1), height: z.number().int().min(1) }),
});

/**
 * Adjust setpoint bound (schema v1). An adjust `value` is an ABSOLUTE setpoint,
 * an integer in −100..+100 with 0 = identity (adjust-math.ts binding model). The
 * bound is load-bearing, not cosmetic: the classic contrast factor
 * `f = 259·(v+255) / (255·(259−v))` DIVIDES BY ZERO at v = 259, so an unbounded
 * hostile `contrast: 259` would poison every compiled LUT entry with Infinity.
 * −100..+100 is the surface's own range (the sliders never leave it) and keeps
 * the denominator away from zero. Pre-release schema v1 — this only ever
 * TIGHTENS the accepted set, so no persisted document migrates.
 */
const AdjustValueSchema = z.number().min(-100).max(100);

export const AdjustOpSchema = z.object({
  op: z.literal("adjust"),
  label: opLabel,
  param: AdjustParamSchema,
  value: AdjustValueSchema,
});

/** Auto-enhance: computed once, STORED EXPLICIT (plan §3.4) — one named step.
    Its chosen params are setpoints too, so they carry the same −100..+100 bound
    (computeAutoEnhance already clamps tighter — ±40/±50/±30). */
export const AutoEnhanceOpSchema = z.object({
  op: z.literal("autoEnhance"),
  label: opLabel,
  params: z.record(AdjustParamSchema, AdjustValueSchema),
});

export const BleedExpandOpSchema = z.object({
  op: z.literal("bleedExpand"),
  label: opLabel,
  strategy: z.enum(["mirror", "smear", "solid"]),
  /** Expansion per edge, inches (the wires' canonical 0.125 in) — operator
      intent, kept for the history label. */
  amount: z.number().min(0),
  /** Solid strategy only (hex). */
  color: z.string().optional(),
  /** STORED-EXPLICIT (see ResizeOpSchema): pixels added per edge, computed by
      the UI at push time via bleedPx(amount, image, target); replay reads ONLY
      this and never re-derives from `amount` × the target DPI. effectiveDims
      folds bleedExpand → w+2·px, h+2·px (geometry.ts). Required (pre-release v1). */
  px: z.number().int().min(1),
});

/** Anchored white padding per edge, pixels — the fit-mode result of solveFit. */
const FitPadSchema = z.object({
  l: z.number().int().min(0),
  t: z.number().int().min(0),
  r: z.number().int().min(0),
  b: z.number().int().min(0),
});

/**
 * STORED-EXPLICIT (see ResizeOpSchema). Exactly one of `rect`/`pad` is present
 * and it MATCHES the mode — enforced by a refine on PhotoOpSchema (a
 * discriminated-union member can't carry its own refine, so the invariant rides
 * one level up):
 *   • fill → `rect` (an anchored crop of the source, PixelRect), no `pad`.
 *   • fit  → `pad`  (anchored white padding per edge),        no `rect`.
 * effectiveDims folds fitToSize → rect ? {rect.w, rect.h} : {w+l+r, h+t+b}.
 */
export const FitToSizeOpSchema = z.object({
  op: z.literal("fitToSize"),
  label: opLabel,
  mode: z.enum(["fit", "fill"]),
  anchor: FitAnchorSchema,
  /** fill only: the anchored crop rect solveFit chose. */
  rect: PixelRectSchema.optional(),
  /** fit only: the anchored per-edge white padding solveFit chose. */
  pad: FitPadSchema.optional(),
});

/**
 * The `hidden` tombstone (PE6). The UI folds the recipe last-wins-per-`id`; a
 * removed overlay is written back with `hidden: true` rather than spliced out,
 * so undo/redo across a remove stays a pure cursor move (no history rewrite).
 * The SERVER NEVER READS overlay ops — overlays reach the render host as
 * pre-rendered PNG rasters in the RenderPayload `overlays` sidecar, not as ops
 * to draw (fonts live client-side, plan §3.3) — but the schema must still ACCEPT
 * a persisted document carrying the tombstone. Optional/additive (pre-release
 * v1); no persisted document migrates.
 */
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
  /** Remove-tombstone under the UI's last-wins-per-id fold (see above). */
  hidden: z.boolean().optional(),
});

export const LogoOverlayOpSchema = z.object({
  op: z.literal("logoOverlay"),
  label: opLabel,
  id: z.string(),
  /** Blob-store id of the ingested (jail-rasterized) overlay image. */
  assetId: z.string(),
  box: PixelRectSchema,
  rotation: z.number(),
  /** Remove-tombstone under the UI's last-wins-per-id fold — same rule as
      TextOverlayOpSchema.hidden; the server never reads it. */
  hidden: z.boolean().optional(),
});

/**
 * STORED-EXPLICIT erase (PE9, the preview-approve loop that every model op will
 * inherit). The classical fill runs ONCE server-side at preview time (POST
 * /api/photo/erase) on the working master at full resolution; the resolved patch
 * PNG is committed ON the op (the ResizeOpSchema.targetPx discipline). Replay —
 * client canvas AND server export — composites ONLY these approved pixels and
 * NEVER re-runs the fill, so what the associate approved is exactly what renders
 * everywhere. `maskAssetId` is the operator's INTENT (the brushed mask, kept for
 * the model-service seam — a future inpaint model re-runs from the same mask);
 * `patch` is the approved result both engines fold and render. Pre-release schema
 * v1 — `patch` required from day one, no migration.
 */
export const EraseOpSchema = z.object({
  op: z.literal("erase"),
  label: opLabel,
  /** Blob-store id of the brushed mask PNG — the operator's INTENT, kept for the
      model-service seam (a future inpaint model re-runs from the same mask). */
  maskAssetId: z.string(),
  patch: z.object({
    /** Jail-safe part id (the overlay id rule): maps to the multipart part
        `erase:<id>` and the jail basename `erase-<id>.png`. */
    id: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/i),
    /** Blob-store id of the patch PNG. */
    assetId: z.string(),
    /** Patch placement in EFFECTIVE-image px at THIS op's recipe position. The
        bound is the documented invariant made enforceable: the patch PNG's pixel
        dims EQUAL rect.w × rect.h, and the render route rejects a part whose
        header dims mismatch — so a degenerate/fractional rect must die at parse,
        not as a baffling "must be a 1×1 image" 400 later (tighter than the shared
        PixelRectSchema, whose crop consumers legitimately float). */
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

/**
 * The op union, plus the ONE cross-field invariant a discriminated-union member
 * can't express on its own: fitToSize must carry EXACTLY the payload its mode
 * implies (fill ⇒ rect only, fit ⇒ pad only). The refine rides the whole union
 * so the discriminator still produces clean "unknown op" errors first; the
 * fitToSize check only runs once a well-shaped op has parsed. Wrapping the union
 * makes `PhotoOpSchema` a ZodEffects, which stays fully usable in
 * `z.array(PhotoOpSchema)` and `.safeParse` (no consumer reaches for its union
 * `.options`). The exported `PhotoOp` type is unchanged by the refine.
 */
/**
 * The ops that enter the erase FILL INPUT (PE9): geometry + prior erase patches —
 * the effective image the brush was drawn on. Pointwise tone (adjust/autoEnhance)
 * re-applies terminally on top of the patch at every render, and overlays are
 * placed art ABOVE the photo, so neither may bake into the pixels the fill
 * samples. ONE predicate shared by the client's pre-strip (client.ts
 * requestEraseFill) and the server's defensive re-strip (render-host eraseFill) —
 * two hand-copied lists here would drift silently.
 */
export function isFillInputOp(op: PhotoOp): boolean {
  return (
    op.op !== "adjust" &&
    op.op !== "autoEnhance" &&
    op.op !== "textOverlay" &&
    op.op !== "logoOverlay"
  );
}

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
  /** The preserved-CMYK working master's blob-store id — present only when a
      CMYK arrival rode the lcms (tificc) seam that keeps 4 channels off sharp's
      RGB-unpacking decoder (§1.3, v1.4). Absent for the dominant RGB path.
      Optional/additive — no persisted document migrates (pre-release v1). */
  cmykAssetId: z.string().optional(),
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
  "multi-page", // a PDF or other multi-page document — route to the Layout Editor instead
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
  /** The preserved-CMYK working master (a TIFF), present ONLY when a CMYK arrival
      rode the jailed tificc (lcms2-utils) seam that keeps 4 channels off sharp's
      RGB-unpacking decoder (§1.3, PE5, v1.4). The client stores it under
      `photo:<id>:cmyk` and sets `source.cmykAssetId`. Additive/optional — absent
      for the dominant RGB path and wherever tificc isn't installed; no persisted
      shape migrates (pre-release v1). */
  cmykMaster: IntakeImagePayloadSchema.optional(),
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
  /** The CMYK-preserving lcms (tificc) capability — true when the jailed
      `tificc` subprocess probes OK, so a CMYK arrival can stay 4-channel through
      export instead of round-tripping RGB (§1.3, PE5). Independent of `formats`
      (it is a colour-path capability, not a codec) — kept top-level so a false
      here honestly disables the no-re-separation path while codecs stay live. */
  cmykPreserve: z.boolean(),
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

/* ------------------------------------------------------------------ */
/* Render API (POST /api/photo/render) — the export spine, plan §4 PE3 */
/* ------------------------------------------------------------------ */

/**
 * Export container formats the spine renders. JPG/PNG shipped the PE3 spine;
 * PE5 adds the print pair — TIFF and PDF·print, which carry the print-colour and
 * MediaBox/TrimBox/BleedBox math (pdf-wrap.ts + the render host's colour pass).
 * Widened additively — the client still only offers JPG/PNG until the Export
 * panel completes (PE7), so no existing caller emits the new members.
 */
export const RenderFormatSchema = z.enum(["jpeg", "png", "tiff", "pdf"]);
export type RenderFormat = z.infer<typeof RenderFormatSchema>;

/**
 * The render request body: the recipe to replay at full resolution plus the
 * output container. The master bytes ride the multipart `file` part (not this
 * JSON) so a 12 MP upload never base64-inflates through a body field. `quality`
 * is JPEG-only — ignored for PNG (which is lossless). Every field is validated
 * server-side before a single byte reaches the jail (the client is untrusted,
 * §3.6).
 */
export const RenderPayloadSchema = z.object({
  recipe: z.array(PhotoOpSchema),
  format: RenderFormatSchema,
  /** JPEG encoder quality 1–100; ignored for PNG. */
  quality: z.number().int().min(1).max(100).default(90),
  /** Colour intent for the render's terminal colour pass (PE5): `cmyk` separates
      through the committed GRACoL profile, `srgb` embeds the sRGB profile.
      Defaults to `srgb` so a pre-PE5 payload (no intent) renders exactly as
      before — the document's `target.intent` supplies the real value (dev #6). */
  intent: PhotoIntentSchema.default("srgb"),
  /** The print target in INCHES, for the PDF box math (MediaBox/TrimBox/BleedBox
      via pdf-wrap.ts) — `w`×`h` trim plus `bleed` per edge. Optional: present
      only for print-destined renders (PDF·print, TIFF); screen JPG/PNG omit it. */
  printTarget: z
    .object({
      w: z.number().min(0),
      h: z.number().min(0),
      bleed: z.number().min(0),
    })
    .optional(),
  /**
   * Pre-rendered overlay placements (PE6, plan §3.3, §3.6). Fonts live
   * client-side, so text/logo overlays reach the server as PNG RASTERS, never as
   * ops to draw — the recipe's textOverlay/logoOverlay ops are the client's
   * history representation and compileRenderPlan SKIPS them (see render-host).
   * Each entry is a placement in FINAL-OUTPUT pixel space (the effective dims
   * AFTER all geometry — overlay boxes already live in effective-master space, so
   * they pass through 1:1); array order = composite order (later paints over
   * earlier). The raster bytes ride SEPARATE multipart parts named `overlay:<id>`
   * (one per entry) — the route matches, size-caps, dimension-checks, and passes
   * them to the jail, where the worker's sharp decode+resize+composite IS the
   * re-encode that sanitizes the UNTRUSTED client raster (§3.6). `id` is
   * `[a-z0-9-]` (max 64) so it maps safely to a jail basename `overlay-<id>.png`.
   * Capped at 16 overlays. Optional — absent for every pre-PE6 render.
   */
  overlays: z
    .array(
      z.object({
        id: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z0-9-]+$/i),
        left: z.number().int(),
        top: z.number().int(),
        width: z.number().int().min(1),
        height: z.number().int().min(1),
      }),
    )
    .max(16)
    .optional(),
});
export type RenderPayload = z.infer<typeof RenderPayloadSchema>;

/**
 * Render failure codes (plan §4 PE3). `bad-recipe` = the payload didn't parse
 * or validate; `unsupported-op` = a well-formed op this tranche can't render
 * yet (adjust/overlay/bleed…); the rest mirror the intake jail's kill/typed
 * classification. NOTE: a SUCCESSFUL render is BINARY — the image bytes stream
 * back with an `image/jpeg`|`image/png` Content-Type, NOT a JSON envelope — so
 * there is no success schema here; only failures are JSON (RenderErrorSchema).
 */
export const RenderErrorCodeSchema = z.enum([
  "bad-recipe", // payload JSON/Zod invalid
  "unsupported-op", // a valid op tag this tranche doesn't render (names the op + its tranche)
  "too-large", // input over MAX_PHOTO_BYTES, or a pathological render output over the size bound
  "too-many-pixels", // master over MAX_PHOTO_PIXELS (libvips refuses at load)
  "decode-failed", // master unreadable / jail decode died
  "timeout", // jail wall-clock kill
  "engine-error", // engine missing or crashed outside decode
]);
export type RenderErrorCode = z.infer<typeof RenderErrorCodeSchema>;

export const RenderErrorSchema = z.object({
  ok: z.literal(false),
  code: RenderErrorCodeSchema,
  /** Friendly, counter-ready copy — shown verbatim in the UI. */
  message: z.string(),
});
export type RenderError = z.infer<typeof RenderErrorSchema>;

/* ------------------------------------------------------------------ */
/* Erase preview API (POST /api/photo/erase) — the classical fill, PE9 */
/* ------------------------------------------------------------------ */

/**
 * The erase-preview request (PE9): the geometry + prior-erase slice of
 * ops[0..cursor) plus the brushed mask's raster dims and the fill rect. The
 * client strips adjust/autoEnhance/overlay ops (pointwise/composited-above passes
 * that must NOT bake into the fill input); the server ALSO strips them
 * defensively before compiling. Success is BINARY — the patch PNG for `mask.rect`
 * (image/png, no-store); every failure is RenderErrorSchema JSON with the render
 * route's status mapping.
 *
 * MASK CONTRACT (binding, shared by the client brush canvas, the corpus fixture
 * masks, and the worker): the mask part is a GRAYSCALE-ON-BLACK, fully OPAQUE
 * PNG. The pixel LUMINANCE is the fill factor — 0 = keep, 255 = fully remove,
 * intermediate = the soft brush-edge blend. The worker flattens any (hostile)
 * alpha onto black and reads ONE greyscale channel; the alpha channel is never
 * the signal.
 */
export const ErasePayloadSchema = z.object({
  recipe: z.array(PhotoOpSchema),
  mask: z.object({
    /** Mask raster dims as uploaded (any resolution; the worker resizes it to the
        effective image). Must equal the uploaded PNG's header dims. */
    width: z.number().int().min(1),
    height: z.number().int().min(1),
    /** Fill region: the brushed-stroke bbox, padded, in EFFECTIVE-image px at the
        END of `recipe`. The returned patch has exactly these dims. */
    rect: z.object({
      x: z.number().int().min(0),
      y: z.number().int().min(0),
      w: z.number().int().min(1),
      h: z.number().int().min(1),
    }),
  }),
});
export type ErasePayload = z.infer<typeof ErasePayloadSchema>;
