import type { TextProps } from "@/schema";

/**
 * Typography model for the POC (plan L5, §7.6): a curated family list —
 * Motiva Sans leads and falls back to system faces until licensing is
 * confirmed (the public/fonts/README posture) — plus the size/spacing
 * option lists, the two minimal style bundles, and measurement helpers.
 * Text ink is fixed #111 in v1; per-run color arrives with schema v2 (§9).
 */

/** Display name → CSS stack. The document stores the display name. */
export const FONT_FAMILIES: { name: string; stack: string }[] = [
  { name: "Motiva Sans", stack: '"Motiva Sans", system-ui, -apple-system, "Segoe UI", sans-serif' },
  { name: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { name: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
  { name: "Times New Roman", stack: '"Times New Roman", Times, serif' },
  { name: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  { name: "Courier New", stack: '"Courier New", Courier, monospace' },
  { name: "Impact", stack: 'Impact, "Arial Black", sans-serif' },
];

export const DEFAULT_FAMILY = "Motiva Sans";

/** CSS stack for a stored family name — unknown names fall to the default. */
export function fontStack(name: string): string {
  return (FONT_FAMILIES.find((f) => f.name === name) ?? FONT_FAMILIES[0]).stack;
}

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 36, 48, 60, 72];
export const LINE_SPACINGS = [1, 1.15, 1.2, 1.5, 2];

/** Font sizes are points (print-native); CSS pixels = pt × 96/72 × zoom. */
export function ptToPx(pt: number, zoom: number): number {
  return (pt * 96 * zoom) / 72;
}

/** Frame-clipping check with a subpixel cushion (rounded layout heights). */
export function isOverflowing(contentHeightPx: number, frameHeightPx: number): boolean {
  return contentHeightPx > frameHeightPx + 1;
}

export type TextStyleKey = "body" | "heading";

/**
 * The minimal style bundles (plan L5): applying one sets these properties;
 * family is left alone. A real style registry with propagation is deferred.
 */
export const TEXT_STYLES: Record<
  TextStyleKey,
  { label: string; props: Pick<TextProps["font"], "size" | "bold" | "italic" | "underline"> & { lineSpacing: number } }
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

/** Which bundle the frame currently matches, for the style-picker face. */
export function matchTextStyle(text: TextProps): TextStyleKey | undefined {
  return (Object.keys(TEXT_STYLES) as TextStyleKey[]).find((key) => {
    const p = TEXT_STYLES[key].props;
    return (
      text.font.size === p.size &&
      text.font.bold === p.bold &&
      text.font.italic === p.italic &&
      text.font.underline === p.underline &&
      text.lineSpacing === p.lineSpacing
    );
  });
}
