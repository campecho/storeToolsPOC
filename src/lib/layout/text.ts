import type { FontProps, Paragraph, TextAlign, TextProps, TextRun } from "@/schema";
import { DEFAULT_FAMILY } from "./font-catalog";

/**
 * Typography model (plan L5 + P2, §7.6): the curated family list lives in
 * font-catalog.ts (re-exported here); this module owns the size/spacing
 * option lists, the two minimal style bundles, measurement helpers, and —
 * since schema v2 made paragraphs-of-runs the single source of truth — the
 * derived-style API the editing surfaces read (textSummary) and write
 * (applyToAllRuns). Frame-level style is computed, never stored.
 */

export { FONT_FAMILIES, DEFAULT_FAMILY, fontStack } from "./font-catalog";

export const DEFAULT_TEXT_COLOR = "#111111";

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 36, 48, 60, 72];
export const LINE_SPACINGS = [1, 1.15, 1.2, 1.5, 2];

/** Font sizes are points (print-native); CSS pixels = pt × 96/72 × zoom. */
export function ptToPx(pt: number, zoom: number): number {
  return (pt * 96 * zoom) / 72;
}

/** Frame-clipping check with a subpixel cushion (rounded layout heights).
    `cushionPx` is explicit because the two callers measure differently: the
    import mirror (overset.ts) works at zoom 1, where the default 1px absorbs
    rounding, while the live canvas badge reads int-rounded scrollHeights at
    ANY zoom — a ≤1px-at-zoom-1 line-box spill scales linearly with zoom and
    the int rounding adds ±2px, so the badge passes `2 + 2 × zoom` to stay
    consistent with the mirror's verdict instead of flipping on borderline
    frames as the user zooms in (real clipping is a line tall — far past
    either cushion). */
export function isOverflowing(
  contentHeightPx: number,
  frameHeightPx: number,
  cushionPx = 1,
): boolean {
  return contentHeightPx > frameHeightPx + cushionPx;
}

/* ── Schema-v2 text helpers: paragraphs/runs are the source of truth ── */

/** The style a run carries — font plus ink (what TextPatch writes). */
export type RunStyle = { font: FontProps; color: string };

export function defaultRunStyle(): RunStyle {
  return {
    font: { family: DEFAULT_FAMILY, size: 11, bold: false, italic: false, underline: false },
    color: DEFAULT_TEXT_COLOR,
  };
}

/** An empty frame: one paragraph, one empty run (carries the typing style). */
export function defaultTextProps(): TextProps {
  return {
    paragraphs: [{ align: "left", lineSpacing: 1.2, runs: [{ text: "", ...defaultRunStyle() }] }],
  };
}

/** Plain content — paragraphs joined by \n (run text may hold soft breaks). */
export function textContent(t: TextProps): string {
  return t.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n");
}

/** Plain string → paragraphs, every run in the given style (programmatic set). */
export function plainToParagraphs(
  plain: string,
  style: RunStyle,
  para: { align: TextAlign; lineSpacing: number } = { align: "left", lineSpacing: 1.2 },
): Paragraph[] {
  return plain.split("\n").map((line) => ({
    align: para.align,
    lineSpacing: para.lineSpacing,
    runs: [{ text: line, font: style.font, color: style.color }],
  }));
}

/**
 * The frame's "current style" for control faces — dominant by character count
 * (an imported frame that's 90% body text reads as body text). `uniform` is
 * false when any run/paragraph deviates, so pickers can show a mixed state.
 */
export function textSummary(t: TextProps): {
  font: FontProps;
  color: string;
  align: TextAlign;
  lineSpacing: number;
  uniform: boolean;
} {
  let best: TextRun = t.paragraphs[0].runs[0];
  const weights = new Map<string, { run: TextRun; n: number }>();
  let bestN = 0;
  for (const p of t.paragraphs) {
    for (const r of p.runs) {
      const key = JSON.stringify([r.font, r.color]);
      const entry = weights.get(key) ?? { run: r, n: 0 };
      entry.n += Math.max(r.text.length, 1);
      weights.set(key, entry);
      if (entry.n > bestN) {
        best = entry.run;
        bestN = entry.n;
      }
    }
  }
  const uniform =
    weights.size <= 1 &&
    t.paragraphs.every(
      (p) => p.align === t.paragraphs[0].align && p.lineSpacing === t.paragraphs[0].lineSpacing,
    );
  return {
    font: best.font,
    color: best.color,
    align: t.paragraphs[0].align,
    lineSpacing: t.paragraphs[0].lineSpacing,
    uniform,
  };
}

/** Flattened text edit — font fields, ink, alignment, and line spacing. */
export type TextPatch = {
  family?: string;
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  align?: TextAlign;
  lineSpacing?: number;
};

/**
 * Apply a patch to EVERY run and paragraph — the POC's whole-frame styling
 * semantics (all three control surfaces target the frame). Selection-scoped
 * styling is a later slice; the run model already supports it.
 */
export function applyToAllRuns(t: TextProps, patch: TextPatch): TextProps {
  return {
    ...t,
    paragraphs: t.paragraphs.map((p) => ({
      ...p,
      align: patch.align ?? p.align,
      lineSpacing: patch.lineSpacing ?? p.lineSpacing,
      runs: p.runs.map((r) => ({
        ...r,
        color: patch.color ?? r.color,
        font: {
          family: patch.family ?? r.font.family,
          size: patch.size ?? r.font.size,
          bold: patch.bold ?? r.font.bold,
          italic: patch.italic ?? r.font.italic,
          underline: patch.underline ?? r.font.underline,
        },
      })),
    })),
  };
}

export type TextStyleKey = "body" | "heading";

/**
 * The minimal style bundles (plan L5): applying one sets these properties on
 * the whole frame; family is left alone. A real style registry is deferred.
 */
export const TEXT_STYLES: Record<
  TextStyleKey,
  { label: string; props: Pick<TextPatch, "size" | "bold" | "italic" | "underline" | "lineSpacing"> }
> = {
  body: {
    label: "Body · Normal",
    props: { size: 11, bold: false, italic: false, underline: false, lineSpacing: 1.2 },
  },
  heading: {
    label: "Heading",
    props: { size: 24, bold: true, italic: false, underline: false, lineSpacing: 1.1 },
  },
};

/** Which bundle the frame currently matches, for the style-picker face —
    a mixed-style frame matches nothing. */
export function matchTextStyle(text: TextProps): TextStyleKey | undefined {
  const s = textSummary(text);
  if (!s.uniform) return undefined;
  return (Object.keys(TEXT_STYLES) as TextStyleKey[]).find((key) => {
    const p = TEXT_STYLES[key].props;
    return (
      s.font.size === p.size &&
      s.font.bold === p.bold &&
      s.font.italic === p.italic &&
      s.font.underline === p.underline &&
      s.lineSpacing === p.lineSpacing
    );
  });
}
