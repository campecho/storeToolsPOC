import { z } from "zod";
import { ColorRefSchema, EdgesSchema, OpacitySchema } from "./primitives";

/**
 * Schema v3 text — the run and paragraph typography deltas and the style
 * system (PLAN.md §6.6; requirements §3.3, §3.6).
 *
 * Formatting resolves in one direction, and every level is stored as a
 * *partial* so the §3.6 override indicator is derivable rather than tracked:
 *
 *   document defaults → paragraph style chain (`basedOn`) → paragraph
 *   overrides → character style chain → run overrides
 *
 * The document's defaults are complete, so resolution is total even for text
 * carrying no style at all — which is how the v2 lineage's styleless runs keep
 * their meaning. "Has local overrides" is then just a non-empty override
 * object at the level in question.
 *
 * Style resolution itself belongs to the text engine (T1, §6.4); this module
 * owns only the storage shape.
 */

/** §3.3: how a justified paragraph's last line is treated. */
export const LastLineAlignSchema = z.enum(["left", "center", "right", "justify"]);
export type LastLineAlign = z.infer<typeof LastLineAlignSchema>;

export const TextAlignSchema = z.enum(["left", "center", "right", "justify"]);
export type TextAlign = z.infer<typeof TextAlignSchema>;

/**
 * §3.3 line spacing: a multiple of font size, an absolute leading value, or a
 * lock to the document baseline grid.
 */
export const LineSpacingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("multiple"), value: z.number().positive() }),
  z.object({ mode: z.literal("absolute"), pt: z.number().positive() }),
  z.object({ mode: z.literal("baselineGrid") }),
]);
export type LineSpacing = z.infer<typeof LineSpacingSchema>;

/** §3.3: metric, optical, or off. Optical's depth is an open §9 decision. */
export const KerningModeSchema = z.enum(["metric", "optical", "none"]);
export type KerningMode = z.infer<typeof KerningModeSchema>;

/** §3.3: superscript / subscript, stored as one position rather than two flags. */
export const BaselinePositionSchema = z.enum(["normal", "superscript", "subscript"]);
export type BaselinePosition = z.infer<typeof BaselinePositionSchema>;

/** §3.3: underline weight, offset, and colour where feasible. */
export const UnderlineSchema = z.object({
  on: z.boolean(),
  weightPt: z.number().min(0).optional(),
  offsetPt: z.number().optional(),
  color: ColorRefSchema.optional(),
});
export type Underline = z.infer<typeof UnderlineSchema>;

/**
 * One manual kerning adjustment between a character pair (§3.3), in 1/1000 em.
 * Keyed by the run-relative index of the pair's left glyph so it survives
 * reflow the way the surrounding run does.
 */
export const ManualKernSchema = z.object({
  afterIndex: z.number().int().min(0),
  value: z.number(),
});
export type ManualKern = z.infer<typeof ManualKernSchema>;

/**
 * Complete character formatting (§3.3 Character Formatting, Font Support, and
 * Advanced Typography). Stored complete only as the document default; styles
 * and runs store `RunFormatOverridesSchema`, the partial of this.
 */
export const RunFormatSchema = z.object({
  family: z.string(),
  sizePt: z.number().positive(),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: UnderlineSchema,
  strikethrough: z.boolean(),
  color: ColorRefSchema,
  /** Absent = no highlight; §3.3 "Highlighting". */
  highlight: ColorRefSchema.nullable(),
  baselinePosition: BaselinePositionSchema,
  allCaps: z.boolean(),
  smallCaps: z.boolean(),
  /** §3.3 horizontal/vertical glyph scaling, 1 = unscaled. */
  hScale: z.number().positive(),
  vScale: z.number().positive(),
  /** §3.3 tracking, 1/1000 em. */
  tracking: z.number(),
  /** §3.3 baseline shift, points; positive raises. */
  baselineShiftPt: z.number(),
  kerning: KerningModeSchema,
  manualKerns: z.array(ManualKernSchema),
  /**
   * §3.3 full OpenType feature support — tag → value, e.g. `{ liga: 1,
   * ss01: 1, onum: 1 }`. Tags are passed to the shaper unmodified (§6.4), so
   * the vocabulary is the font's, not an enum this schema has to track.
   */
  features: z.record(z.string(), z.number().int()),
  /** §3.3 variable-font axes — axis tag → value, e.g. `{ wght: 550 }`. */
  variations: z.record(z.string(), z.number()),
  /** BCP-47, driving hyphenation and shaping (§3.7, §6.4). */
  language: z.string(),
});
export type RunFormat = z.infer<typeof RunFormatSchema>;

/** The stored shape for character styles and run-level local formatting. */
export const RunFormatOverridesSchema = RunFormatSchema.partial();
export type RunFormatOverrides = z.infer<typeof RunFormatOverridesSchema>;

/** §3.3 tab stops, including leaders. */
export const TabStopSchema = z.object({
  positionIn: z.number().min(0),
  align: z.enum(["left", "right", "center", "decimal"]),
  /** Leader glyph run out to the stop, e.g. "." — absent = none. */
  leader: z.string().optional(),
});
export type TabStop = z.infer<typeof TabStopSchema>;

/** §3.3 bullets: glyph or image, with size, colour, and indent. */
export const BulletSchema = z.object({
  kind: z.enum(["glyph", "image"]),
  /** Glyph bullets: the character. Image bullets: the asset id. */
  value: z.string(),
  /** Relative to the resolved run size, 1 = same size. */
  scale: z.number().positive().default(1),
  color: ColorRefSchema.optional(),
  indentIn: z.number().min(0).default(0),
});
export type Bullet = z.infer<typeof BulletSchema>;

/** §1.5's numbering formats, reused for §3.3 paragraph numbering. */
export const NumberFormatSchema = z.enum([
  "arabic",
  "upperRoman",
  "lowerRoman",
  "upperAlpha",
  "lowerAlpha",
]);
export type NumberFormat = z.infer<typeof NumberFormatSchema>;

/** §3.3 numbering: format, start value, separator, continuation across frames. */
export const NumberingSchema = z.object({
  format: NumberFormatSchema,
  startAt: z.number().int(),
  /** Text after the number, e.g. "." or ")". */
  separator: z.string(),
  /** Continue the sequence across linked frames rather than restarting. */
  continueAcrossFrames: z.boolean().default(true),
  indentIn: z.number().min(0).default(0),
});
export type Numbering = z.infer<typeof NumberingSchema>;

/** §3.3 drop caps: lines dropped, characters included, styling, and gap. */
export const DropCapSchema = z.object({
  lines: z.number().int().min(2),
  characters: z.number().int().min(1),
  /** Character style applied to the dropped glyphs; null = inherit the run. */
  characterStyleId: z.string().nullable(),
  gapIn: z.number().min(0).default(0),
});
export type DropCap = z.infer<typeof DropCapSchema>;

/** §3.3 hyphenation controls, per paragraph. */
export const HyphenationSchema = z.object({
  on: z.boolean(),
  minWordLength: z.number().int().min(1),
  minCharsBefore: z.number().int().min(1),
  minCharsAfter: z.number().int().min(1),
  maxConsecutive: z.number().int().min(0),
  /** Ragged-edge zone within which hyphenation is not attempted, inches. */
  zoneIn: z.number().min(0),
  hyphenateCapitalized: z.boolean(),
});
export type Hyphenation = z.infer<typeof HyphenationSchema>;

/** One min/desired/max spacing band for justified text (§3.3). */
const SpacingBandSchema = z.object({
  min: z.number(),
  desired: z.number(),
  max: z.number(),
});

/**
 * §3.3 justification: word spacing as a multiple of the space advance,
 * letter spacing in 1/1000 em. Consumed by the composer (§6.4).
 */
export const JustificationSchema = z.object({
  word: SpacingBandSchema,
  letter: SpacingBandSchema,
  lastLine: LastLineAlignSchema,
});
export type Justification = z.infer<typeof JustificationSchema>;

/** §3.3 paragraph rules above and below: weight, colour, width, offset. */
export const ParagraphRuleSchema = z.object({
  on: z.boolean(),
  weightPt: z.number().min(0),
  color: ColorRefSchema,
  /** Rule width: the text column, or the longest line in the paragraph. */
  width: z.enum(["column", "text"]),
  offsetIn: z.number(),
});
export type ParagraphRule = z.infer<typeof ParagraphRuleSchema>;

/** §3.3 keep options. */
export const KeepOptionsSchema = z.object({
  withNext: z.boolean(),
  linesTogether: z.boolean(),
  /** Minimum lines left at the bottom of a frame. */
  widowLines: z.number().int().min(0),
  /** Minimum lines carried to the next frame. */
  orphanLines: z.number().int().min(0),
  breakBefore: z.enum(["none", "frame", "page"]),
});
export type KeepOptions = z.infer<typeof KeepOptionsSchema>;

/**
 * Complete paragraph formatting (§3.3 Paragraph Formatting). As with runs,
 * stored complete only as the document default.
 */
export const ParagraphFormatSchema = z.object({
  align: TextAlignSchema,
  lineSpacing: LineSpacingSchema,
  /** Left and right paragraph indents, inches. */
  indentLeftIn: z.number(),
  indentRightIn: z.number(),
  /** Additional first-line indent; negative gives a hanging indent. */
  firstLineIndentIn: z.number(),
  spaceBeforeIn: z.number().min(0),
  spaceAfterIn: z.number().min(0),
  tabs: z.array(TabStopSchema),
  /** Absent arms mean the paragraph is neither bulleted nor numbered. */
  bullet: BulletSchema.nullable(),
  numbering: NumberingSchema.nullable(),
  dropCap: DropCapSchema.nullable(),
  hyphenation: HyphenationSchema,
  justification: JustificationSchema,
  ruleAbove: ParagraphRuleSchema.nullable(),
  ruleBelow: ParagraphRuleSchema.nullable(),
  keep: KeepOptionsSchema,
  /** §3.3 paragraph shading / background fill; null = none. */
  shading: ColorRefSchema.nullable(),
  /** §3.3 paragraph-level baseline-grid alignment. */
  alignToBaselineGrid: z.boolean(),
  /** §3.3 direction appropriate to the text's language. */
  direction: z.enum(["ltr", "rtl"]),
});
export type ParagraphFormat = z.infer<typeof ParagraphFormatSchema>;

/** The stored shape for paragraph styles and paragraph-level local formatting. */
export const ParagraphFormatOverridesSchema = ParagraphFormatSchema.partial();
export type ParagraphFormatOverrides = z.infer<typeof ParagraphFormatOverridesSchema>;

/**
 * §1.5's automatic page-number field. Phase 1 needs exactly this one; §3.8's
 * text variables (page count, section name, file name, …) are the stretch goal
 * that widens the enum without changing the run's shape.
 */
export const TextFieldSchema = z.enum(["pageNumber"]);
export type TextField = z.infer<typeof TextFieldSchema>;

/**
 * One styled run. Text may contain \n (soft line breaks within a paragraph),
 * as in the v2 lineage.
 */
export const TextRunSchema = z.object({
  text: z.string(),
  /** §3.6 applied character style; null = none. */
  characterStyleId: z.string().nullable().default(null),
  /** §3.6 local formatting on top of the style — non-empty means "overridden". */
  overrides: RunFormatOverridesSchema.default({}),
  /**
   * §1.5: when set, this run is a field. `text` holds the last resolved value
   * so a document renders without re-running resolution, and the field is
   * recomputed against `doc.sections` whenever pagination changes.
   */
  field: TextFieldSchema.nullable().default(null),
});
export type TextRun = z.infer<typeof TextRunSchema>;

/**
 * A paragraph. `runs` is never empty — an empty paragraph is one run with text
 * "", carrying the formatting new typing continues in (the v2 lineage's rule,
 * kept because it is what stops frame-level "current style" from drifting).
 */
export const ParagraphSchema = z.object({
  paragraphStyleId: z.string().nullable().default(null),
  overrides: ParagraphFormatOverridesSchema.default({}),
  runs: z.array(TextRunSchema).min(1),
});
export type Paragraph = z.infer<typeof ParagraphSchema>;

/**
 * §3.6 paragraph style: carries both paragraph-level and character-level
 * attributes, with `basedOn` inheritance and a `nextStyle` for the paragraph
 * started after it. `basedOn` cycles are a validation concern for the Styles
 * panel, not a schema constraint — see the reference note on DocumentSchema.
 */
export const ParagraphStyleSchema = z.object({
  id: z.string(),
  name: z.string(),
  basedOn: z.string().nullable().default(null),
  nextStyle: z.string().nullable().default(null),
  /** §3.6 style groups/folders; null = top level. */
  group: z.string().nullable().default(null),
  /** §3.6 assignable keyboard shortcut. */
  shortcut: z.string().nullable().default(null),
  paragraph: ParagraphFormatOverridesSchema.default({}),
  character: RunFormatOverridesSchema.default({}),
});
export type ParagraphStyle = z.infer<typeof ParagraphStyleSchema>;

/**
 * §3.6 character style: applies only the attributes it defines, leaving the
 * rest of the paragraph's formatting intact — which is exactly a partial.
 */
export const CharacterStyleSchema = z.object({
  id: z.string(),
  name: z.string(),
  basedOn: z.string().nullable().default(null),
  group: z.string().nullable().default(null),
  shortcut: z.string().nullable().default(null),
  character: RunFormatOverridesSchema.default({}),
});
export type CharacterStyle = z.infer<typeof CharacterStyleSchema>;

/**
 * Text frame body plus the frame-local properties the v2 lineage proved out.
 * Threading lives on the object (§3.2), not here, because it is the frame that
 * is linked; a story's paragraphs live on the frame that starts it.
 */
export const TextBodySchema = z.object({
  paragraphs: z.array(ParagraphSchema).min(1),
  vAlign: z.enum(["top", "middle", "bottom"]).default("top"),
  /** Text insets, inches (Publisher's default is 0.04 on all sides). */
  inset: EdgesSchema.default({ lIn: 0.04, rIn: 0.04, tIn: 0.04, bIn: 0.04 }),
  /**
   * §3.5 autofit. `shrinkOnOverflow` mirrors Publisher's behaviour and is the
   * v2 lineage's `fontScale` generalised: declared run sizes stay the source of
   * truth so the scale is reversible and round-trips.
   */
  autofit: z.enum(["off", "shrinkOnOverflow", "growFrame"]).default("off"),
  /** Render-time uniform scale applied by autofit; 1 = none. */
  fontScale: z.number().min(0.1).max(1).default(1),
  /** §3.1 multi-column text frames. */
  columns: z.number().int().min(1).default(1),
  columnGapIn: z.number().min(0).default(0.16),
  /** Opacity of the body independent of the frame (§2.2 coexistence rule). */
  opacity: OpacitySchema.default(1),
});
export type TextBody = z.infer<typeof TextBodySchema>;
