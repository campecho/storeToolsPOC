import { z } from "zod";
import { PaintSchema } from "./color";

/**
 * Text model (PLAN.md §6.6) — the v2 lineage's per-run model carried whole:
 * paragraphs of styled runs are the single source of truth; frame-level
 * "current style" is derived, never stored, so the two can't drift. v3 adds
 * the Character/Paragraph panel vocabulary (§3.3), styles with basedOn /
 * nextStyle (§3.6), and the justification/hyphenation inputs the H&J
 * composer consumes (§6.4).
 *
 * Units: lengths are canonical inches; font `size` and `baselineShift` are
 * typographic points (the lineage's font-size convention); `tracking` is
 * 1/1000 em; spacing ranges are multipliers/em-fractions as noted.
 */

export const OrientationSchema = z.enum(["portrait", "landscape"]);
export type Orientation = z.infer<typeof OrientationSchema>;

export const TextAlignSchema = z.enum(["left", "center", "right", "justify"]);
export type TextAlign = z.infer<typeof TextAlignSchema>;

export const FontPropsSchema = z.object({
  family: z.string(),
  /** Points. */
  size: z.number(),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
});
export type FontProps = z.infer<typeof FontPropsSchema>;

export const KerningModeSchema = z.enum(["metrics", "optical", "none"]);
export type KerningMode = z.infer<typeof KerningModeSchema>;

/**
 * One styled run — text may contain \n (soft line breaks within a paragraph).
 * Explicit props stay the source of truth even when `styleId` is set: the
 * style is the provenance pointer, and the Styles panel's override indicator
 * derives by comparing the run's explicit props against the resolved style
 * chain (§3.6). New-in-v3 fields are optional so the run shape stays additive.
 */
export const TextRunSchema = z.object({
  text: z.string(),
  font: FontPropsSchema,
  /** Ink — a Paint in v3 (the lineage's hex string generalized to the swatch model). */
  color: PaintSchema,
  /** Character style provenance (§3.6); absent = no style applied. */
  styleId: z.string().optional(),
  /** 1/1000 em added between glyphs; absent = 0. */
  tracking: z.number().optional(),
  /** Points; positive raises off the baseline; absent = 0. */
  baselineShift: z.number().optional(),
  /** Absent = "metrics". */
  kerning: KerningModeSchema.optional(),
  /** OpenType feature tag → on/off or alternate index (e.g. { liga: true, salt: 2 }). */
  features: z.record(z.union([z.boolean(), z.number().int().min(0)])).optional(),
  /** Variable-font axis tag → design-space value (e.g. { wght: 600 }). */
  variations: z.record(z.number()).optional(),
  /** BCP-47 tag driving shaping, hyphenation patterns, and proofing; absent = document default. */
  language: z.string().optional(),
  /** Glyph scale multipliers; absent = 1. */
  horizontalScale: z.number().positive().optional(),
  verticalScale: z.number().positive().optional(),
});
export type TextRun = z.infer<typeof TextRunSchema>;

export const TabAlignSchema = z.enum(["start", "center", "end", "decimal"]);
export type TabAlign = z.infer<typeof TabAlignSchema>;

export const TabStopSchema = z.object({
  /** Inches from the paragraph's left edge. */
  position: z.number().min(0),
  align: TabAlignSchema.default("start"),
  /** Leader fill repeated to the stop (e.g. "."); absent = whitespace. */
  leader: z.string().optional(),
});
export type TabStop = z.infer<typeof TabStopSchema>;

/** ASSUMPTION: parameter set and defaults follow the Liang/H&J composer's
    conventional knobs (§6.4) — §3.3 requires hyphenation control but names
    no parameters. */
export const HyphenationSchema = z.object({
  enabled: z.boolean(),
  minWordLength: z.number().int().min(2).default(5),
  minBefore: z.number().int().min(1).default(2),
  minAfter: z.number().int().min(1).default(3),
  /** Max consecutive hyphenated line endings; 0 = unlimited. */
  consecutiveLimit: z.number().int().min(0).default(0),
  hyphenateCapitalized: z.boolean().default(true),
});
export type Hyphenation = z.infer<typeof HyphenationSchema>;

const SpacingRangeSchema = z.object({
  min: z.number(),
  desired: z.number(),
  max: z.number(),
});

/** H&J inputs (§6.4): word spacing as multipliers of the space glyph
    (1 = normal), letter spacing as em fractions added between glyphs
    (0 = normal). */
export const JustificationSchema = z.object({
  wordSpacing: SpacingRangeSchema,
  letterSpacing: SpacingRangeSchema,
});
export type Justification = z.infer<typeof JustificationSchema>;

/** Shared by list numbering and section page numbering. */
export const NumberFormatSchema = z.enum([
  "arabic",
  "lowerRoman",
  "upperRoman",
  "lowerAlpha",
  "upperAlpha",
]);
export type NumberFormat = z.infer<typeof NumberFormatSchema>;

/** ASSUMPTION: bullet/number vocabulary is a Publisher-parity guess — §3.3
    requires bullets and numbering but not their parameter set. */
export const ListSettingsSchema = z.object({
  kind: z.enum(["bullet", "number"]),
  /** Nesting depth, 0 = top level. */
  level: z.number().int().min(0).default(0),
  /** Bullet kind only. */
  bulletChar: z.string().optional(),
  /** Number kind only. */
  format: NumberFormatSchema.optional(),
  /** Number kind only; absent = continue the list. */
  start: z.number().int().min(0).optional(),
  /** Text after the number (e.g. "."). */
  separator: z.string().optional(),
});
export type ListSettings = z.infer<typeof ListSettingsSchema>;

export const DropCapSchema = z.object({
  /** Lines the cap descends through. */
  lines: z.number().int().min(2),
  /** Leading characters included in the cap. */
  chars: z.number().int().min(1).default(1),
});
export type DropCap = z.infer<typeof DropCapSchema>;

export const ParagraphRuleSchema = z.object({
  paint: PaintSchema,
  /** Points. */
  thickness: z.number().min(0),
  /** Inches from the baseline (above rules) / last baseline (below rules). */
  offset: z.number(),
});
export type ParagraphRule = z.infer<typeof ParagraphRuleSchema>;

/** ASSUMPTION: keep-options parameter set is a Publisher-parity guess —
    §3.3 requires keep controls but not their exact knobs. */
export const KeepOptionsSchema = z.object({
  withNext: z.boolean().default(false),
  linesTogether: z.boolean().default(false),
  /** Orphan control: min lines kept at a frame/column bottom. */
  minFirstLines: z.number().int().min(1).default(2),
  /** Widow control: min lines carried to the next frame/column top. */
  minLastLines: z.number().int().min(1).default(2),
});
export type KeepOptions = z.infer<typeof KeepOptionsSchema>;

export const ParagraphSchema = z.object({
  align: TextAlignSchema,
  /** Line height as a multiplier of the font size (Publisher "1sp" ≈ 1.19). */
  lineSpacing: z.number(),
  /** Left indent, inches. */
  indent: z.number().optional(),
  /** Additional first-line indent, inches (may be negative: hanging indent). */
  firstLineIndent: z.number().optional(),
  /** Right indent, inches. */
  rightIndent: z.number().optional(),
  /** Inches. */
  spaceBefore: z.number().min(0).optional(),
  spaceAfter: z.number().min(0).optional(),
  /** Paragraph style provenance (§3.6) — same override rule as run styleId. */
  styleId: z.string().optional(),
  hyphenation: HyphenationSchema.optional(),
  justification: JustificationSchema.optional(),
  tabs: z.array(TabStopSchema).optional(),
  list: ListSettingsSchema.optional(),
  dropCap: DropCapSchema.optional(),
  ruleAbove: ParagraphRuleSchema.optional(),
  ruleBelow: ParagraphRuleSchema.optional(),
  keep: KeepOptionsSchema.optional(),
  shading: PaintSchema.optional(),
  /** Snap baselines to the document/page baseline grid; absent = off. */
  baselineGridLock: z.boolean().optional(),
  /** Never empty — an empty paragraph is one run with text "" (it carries the
      style new typing continues in). */
  runs: z.array(TextRunSchema).min(1),
});
export type Paragraph = z.infer<typeof ParagraphSchema>;

export const TextInsetSchema = z.object({
  l: z.number().min(0),
  r: z.number().min(0),
  t: z.number().min(0),
  b: z.number().min(0),
});
export type TextInset = z.infer<typeof TextInsetSchema>;

export const TextPropsSchema = z.object({
  /** Never empty — an empty frame is one paragraph with one empty run. */
  paragraphs: z.array(ParagraphSchema).min(1),
  /** Vertical alignment inside the frame; absent = top. */
  vAlign: z.enum(["top", "middle", "bottom"]).optional(),
  /** Text insets, inches; absent = none. */
  inset: TextInsetSchema.optional(),
  /** Carried from the lineage: a uniform render-time scale on every run's
      size (overflow shrink). Declared run sizes stay the source of truth;
      absent = 1. */
  fontScale: z.number().min(0.5).max(1).optional(),
});
export type TextProps = z.infer<typeof TextPropsSchema>;

/** Character-level style payload — every field optional: a style states only
    what it sets, the rest resolves through `basedOn`. */
export const CharacterStylePropsSchema = z.object({
  family: z.string().optional(),
  size: z.number().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  color: PaintSchema.optional(),
  tracking: z.number().optional(),
  baselineShift: z.number().optional(),
  kerning: KerningModeSchema.optional(),
  features: z.record(z.union([z.boolean(), z.number().int().min(0)])).optional(),
  variations: z.record(z.number()).optional(),
  language: z.string().optional(),
  horizontalScale: z.number().positive().optional(),
  verticalScale: z.number().positive().optional(),
});
export type CharacterStyleProps = z.infer<typeof CharacterStylePropsSchema>;

export const CharacterStyleSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Parent style id — resolution walks the chain; soft reference. */
  basedOn: z.string().optional(),
  props: CharacterStylePropsSchema.default({}),
});
export type CharacterStyle = z.infer<typeof CharacterStyleSchema>;

/** Paragraph-level style payload — same states-only-what-it-sets rule. */
export const ParagraphStylePropsSchema = z.object({
  align: TextAlignSchema.optional(),
  lineSpacing: z.number().optional(),
  indent: z.number().optional(),
  firstLineIndent: z.number().optional(),
  rightIndent: z.number().optional(),
  spaceBefore: z.number().min(0).optional(),
  spaceAfter: z.number().min(0).optional(),
  hyphenation: HyphenationSchema.optional(),
  justification: JustificationSchema.optional(),
  tabs: z.array(TabStopSchema).optional(),
  list: ListSettingsSchema.optional(),
  dropCap: DropCapSchema.optional(),
  ruleAbove: ParagraphRuleSchema.optional(),
  ruleBelow: ParagraphRuleSchema.optional(),
  keep: KeepOptionsSchema.optional(),
  shading: PaintSchema.optional(),
  baselineGridLock: z.boolean().optional(),
});
export type ParagraphStyleProps = z.infer<typeof ParagraphStylePropsSchema>;

export const ParagraphStyleSchema = z.object({
  id: z.string(),
  name: z.string(),
  basedOn: z.string().optional(),
  /** Style applied to the paragraph created by Enter at this paragraph's end. */
  nextStyle: z.string().optional(),
  paragraph: ParagraphStylePropsSchema.default({}),
  /** A paragraph style also sets character formatting for its runs. */
  character: CharacterStylePropsSchema.default({}),
});
export type ParagraphStyle = z.infer<typeof ParagraphStyleSchema>;
