/**
 * The font catalog (plan §10.5) — every family the editor offers, with a
 * local-first CSS stack and, where a libre metric-compatible or class-matched
 * face exists, self-hosted WOFF2 files (public/fonts/, vendored from
 * @fontsource by scripts/vendor-fonts.mjs — no CDN at runtime).
 *
 * The stand-in model: a document that says "Calibri" KEEPS saying Calibri —
 * the stack tries the real local face first, then the registered webfont
 * (Carlito, metric-compatible), so machines with the genuine font render it
 * and everything else still matches the original's metrics. The `.pub` import
 * remap table (src/lib/import/font-remap.ts) targets names in this catalog.
 */

export type FontFile = { file: string; weight: 400 | 700; style: "normal" | "italic" };

export type CatalogFamily = {
  /** Display name — what documents store and pickers list. */
  name: string;
  /** CSS stack, local faces first, webfont stand-in next, class fallback last. */
  stack: string;
  /** Family name the WOFF2 faces register under (the stand-in's own name). */
  webFamily?: string;
  /** Files under public/fonts/ — absent = system stack only. */
  files?: FontFile[];
};

/** The standard four faces at conventional fontsource-style names. */
const four = (slug: string): FontFile[] => [
  { file: `${slug}/${slug}-400-normal.woff2`, weight: 400, style: "normal" },
  { file: `${slug}/${slug}-400-italic.woff2`, weight: 400, style: "italic" },
  { file: `${slug}/${slug}-700-normal.woff2`, weight: 700, style: "normal" },
  { file: `${slug}/${slug}-700-italic.woff2`, weight: 700, style: "italic" },
];

// ASSUMPTION: curated list is a guess at the in-store set; Motiva Sans renders
// via system fallback until brand licensing is confirmed (public/fonts/README).
export const FONT_CATALOG: CatalogFamily[] = [
  {
    name: "Motiva Sans",
    stack: '"Motiva Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  {
    name: "Arial",
    stack: 'Arial, "Arimo", Helvetica, sans-serif',
    webFamily: "Arimo",
    files: four("arimo"),
  },
  {
    name: "Calibri",
    stack: 'Calibri, "Carlito", sans-serif',
    webFamily: "Carlito",
    files: four("carlito"),
  },
  {
    name: "Cambria",
    stack: 'Cambria, "Caladea", Georgia, serif',
    webFamily: "Caladea",
    files: four("caladea"),
  },
  {
    name: "Georgia",
    stack: 'Georgia, "Gelasio", "Times New Roman", serif',
    webFamily: "Gelasio",
    files: four("gelasio"),
  },
  {
    name: "Times New Roman",
    stack: '"Times New Roman", "Tinos", Times, serif',
    webFamily: "Tinos",
    files: four("tinos"),
  },
  {
    name: "Courier New",
    stack: '"Courier New", "Cousine", Courier, monospace',
    webFamily: "Cousine",
    files: four("cousine"),
  },
  {
    // Class match for the HelveticaNeue LT Pro family in the store corpus —
    // commercial, can't self-host; Libre Franklin is the closest libre cut.
    name: "Libre Franklin",
    stack: '"Libre Franklin", "Helvetica Neue", Arial, sans-serif',
    webFamily: "Libre Franklin",
    files: four("libre-franklin"),
  },
  {
    // Sorts Mill Goudy is a libre revival of Goudy Old Style (store corpus);
    // no 700 cut exists — browsers synthesize bold from the 400.
    name: "Goudy Old Style",
    stack: '"Goudy Old Style", "Sorts Mill Goudy", Georgia, serif',
    webFamily: "Sorts Mill Goudy",
    files: [
      { file: "sorts-mill-goudy/sorts-mill-goudy-400-normal.woff2", weight: 400, style: "normal" },
      { file: "sorts-mill-goudy/sorts-mill-goudy-400-italic.woff2", weight: 400, style: "italic" },
    ],
  },
  { name: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  { name: "Impact", stack: 'Impact, "Arial Black", sans-serif' },
];

export const DEFAULT_FAMILY = "Motiva Sans";

/** Display name → CSS stack (picker list keeps the old shape). */
export const FONT_FAMILIES: { name: string; stack: string }[] = FONT_CATALOG.map((f) => ({
  name: f.name,
  stack: f.stack,
}));

/** CSS stack for a stored family name — unknown names fall to the default. */
export function fontStack(name: string): string {
  return (FONT_CATALOG.find((f) => f.name === name) ?? FONT_CATALOG[0]).stack;
}
