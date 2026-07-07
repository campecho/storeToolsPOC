import { FONT_CATALOG, DEFAULT_FAMILY } from "@/lib/layout/font-catalog";

/**
 * The `.pub` font remap table (plan §10.5) — data, not code paths. Every
 * source family resolves to a catalog family plus an honest tier:
 *
 *  tier 1 — the same family, or a metric-compatible stand-in behind the same
 *           name (Calibri renders via Carlito where Calibri isn't installed);
 *           line breaks and overflow match the original.
 *  tier 2 — a class match (right genre, close texture); metrics differ, so
 *           reflow is possible — the report says so.
 *  tier 3 — nothing suitable shipped; the editor default takes over.
 *
 * Corpus-driven rows: Calibri (3up_tabs), HelveticaNeueLT Pro 45/55/65/95 and
 * Wingdings (production_checkpoint_labels), Goudy Old Style (bcim cards).
 */

export type ResolvedFamily = { family: string; tier: 1 | 2 | 3; reason: string };

const CATALOG_NAMES = new Set(FONT_CATALOG.map((f) => f.name));

type Rule = { test: RegExp; to: string; tier: 1 | 2; reason: string };

const RULES: Rule[] = [
  { test: /^calibri/i, to: "Calibri", tier: 1, reason: "metric-compatible Carlito webfont stands in where Calibri isn't installed" },
  { test: /^cambria/i, to: "Cambria", tier: 1, reason: "metric-compatible Caladea webfont stands in where Cambria isn't installed" },
  { test: /^(arial|helvetica)$/i, to: "Arial", tier: 1, reason: "metric-compatible Arimo webfont stands in" },
  { test: /^times/i, to: "Times New Roman", tier: 1, reason: "metric-compatible Tinos webfont stands in" },
  { test: /^courier/i, to: "Courier New", tier: 1, reason: "metric-compatible Cousine webfont stands in" },
  { test: /^georgia/i, to: "Georgia", tier: 1, reason: "Gelasio webfont stands in where Georgia isn't installed" },
  {
    test: /^helvetica\s?neue/i,
    to: "Libre Franklin",
    tier: 2,
    reason:
      "HelveticaNeue LT is commercial — Libre Franklin is the closest libre class match; LT weight cuts (45/55/65/95) approximate to regular/bold",
  },
  {
    test: /^goudy/i,
    to: "Goudy Old Style",
    tier: 2,
    reason: "Sorts Mill Goudy (a libre Goudy Old Style revival) stands in — close, not metric-identical",
  },
];

/** Resolve one source family name to a catalog family + fidelity tier. */
export function resolveFamily(source: string): ResolvedFamily {
  // Rules first: they carry the honest stand-in story even for names that
  // are themselves in the catalog (Calibri IS listed — via Carlito).
  const rule = RULES.find((r) => r.test.test(source));
  if (rule) return { family: rule.to, tier: rule.tier, reason: rule.reason };
  if (CATALOG_NAMES.has(source)) {
    return { family: source, tier: 1, reason: "in the editor's font list" };
  }
  if (isDingbat(source)) {
    return {
      family: DEFAULT_FAMILY,
      tier: 2,
      reason: "dingbat font — known symbols translate to Unicode equivalents; others keep their raw letters",
    };
  }
  return {
    family: DEFAULT_FAMILY,
    tier: 3,
    reason: "no libre equivalent shipped — the editor default stands in (metrics will differ)",
  };
}

/* ── Dingbat translation ── */

export function isDingbat(family: string): boolean {
  return /^(wingdings|webdings)/i.test(family);
}

/**
 * Wingdings byte → Unicode symbol, for the glyphs that are CONTENT in the
 * store corpus (checkbox marks on the checkpoint labels). Anything unmapped
 * passes through as its raw letter — visible, flagged, never dropped.
 */
const WINGDINGS_MAP: Record<string, string> = {
  "û": "✘", // 0xFB ballot X
  "ü": "✔", // 0xFC check mark
  "ý": "☒", // 0xFD boxed X
  "þ": "☑", // 0xFE boxed check
  "¨": "○", // 0xA8 circle (checkbox blank)
  "o": "□", // 0x6F empty square
  "n": "■", // 0x6E filled square
  "l": "●", // 0x6C filled circle
};

/** Translate dingbat text; reports whether anything remained unmapped. */
export function translateDingbats(text: string): { text: string; unmapped: boolean } {
  let unmapped = false;
  const out = [...text]
    .map((ch) => {
      if (/\s/.test(ch)) return ch;
      const mapped = WINGDINGS_MAP[ch];
      if (mapped === undefined) {
        unmapped = true;
        return ch;
      }
      return mapped;
    })
    .join("");
  return { text: out, unmapped };
}
