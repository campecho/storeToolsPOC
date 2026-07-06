import { z } from "zod";

/**
 * Import report (plan §10.4) — the structured record of every conversion
 * decision. CONTRACT: this shape is the API response's `report` half and the
 * P4 report panel's input; nothing degrades silently (§10.3's tiering rule).
 * Tiers: 1 = converted clean · 2 = degraded with a note · 3 = flag-only.
 */

export const ImportNoteSchema = z.object({
  /** Object the note anchors to — P4's report panel deep-links via this. */
  objectId: z.string().optional(),
  pageId: z.string().optional(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  message: z.string(),
  /** Kinded notes get their own report-panel groups (and, for autofit,
      idempotent replacement by re-measures). "autofit" = client-side shrink
      applied; "corrected" = the importer restored something the conversion
      toolchain got wrong (e.g. mirrored text boxes folded into a 180°
      rotation), with the evidence read from the source file itself. */
  kind: z.union([z.literal("autofit"), z.literal("corrected")]).optional(),
});
export type ImportNote = z.infer<typeof ImportNoteSchema>;

export const FontRemapSchema = z.object({
  /** Family name as the .pub referenced it. */
  source: z.string(),
  /** Family it renders with in the editor. */
  mappedTo: z.string(),
  reason: z.string(),
});
export type FontRemap = z.infer<typeof FontRemapSchema>;

/**
 * Extracted image bytes (P3), keyed by the asset id referenced in
 * `doc.assets` / picture frames. CONTRACT: this is the API response's
 * `assets` half — the client decodes each entry to a Blob and seeds the
 * asset blob store BEFORE opening the document. Base64 in JSON is the POC
 * transport; a production service would serve asset URLs instead (the
 * document schema's `assets` metadata is transport-agnostic either way).
 */
export const ImportAssetPayloadSchema = z.object({
  mime: z.string(),
  dataB64: z.string(),
});
export type ImportAssetPayload = z.infer<typeof ImportAssetPayloadSchema>;

export const ImportAssetsPayloadSchema = z.record(ImportAssetPayloadSchema);
export type ImportAssetsPayload = z.infer<typeof ImportAssetsPayloadSchema>;

export const ImportReportSchema = z.object({
  /** 'live' = pub2raw ran; 'fixture' = the canned demo trace (plan §10.1). */
  mode: z.enum(["live", "fixture"]),
  source: z.object({ filename: z.string(), bytes: z.number() }),
  fidelity: z.object({
    converted: z.number(),
    degraded: z.number(),
    flagged: z.number(),
  }),
  fonts: z.array(FontRemapSchema),
  notes: z.array(ImportNoteSchema),
  /** Overflowing text frames — populated by the client-side overset check (P4). */
  overset: z.array(z.string()),
});
export type ImportReport = z.infer<typeof ImportReportSchema>;
