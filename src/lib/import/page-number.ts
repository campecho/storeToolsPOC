/**
 * Page-number field substitution (ecl_workbook corpus) — the single shared
 * rule, applied on BOTH sides of the fidelity harness (plan §10.6).
 *
 * Publisher's page-number FIELD arrives in the conversion trace as a literal
 * `insertText (#)` — zero insertField callbacks in 43MB — so footers import
 * reading "Page | #". The product decision is to SUBSTITUTE: fill in the real
 * page number where the '#' stands. That rule lives here so the mapper
 * (mapper.ts) and the fidelity harness (fidelity.ts) apply the IDENTICAL
 * transform — the same precedent as the Wingdings translation, where the
 * harness pushes the reference side through the public font-remap rule it's
 * measuring rather than special-casing the comparison.
 */

/**
 * Header/footer band as a fraction of page height. A '#' is treated as the
 * page-number placeholder ONLY when the text frame's vertical center sits in
 * the top or bottom `PAGE_NUMBER_BAND` of its page, where headers/footers
 * live. Scoping to the band is what keeps body-copy '#' from being rewritten:
 * ecl_workbook has body frames ("Total # of Cuts per Order.", "# of Trims")
 * and production_checkpoint_labels has one ("…7mil: #3-#4…") whose centers sit
 * mid-page (≈ 4.5–6.25in of 11in) and must stay literal. 0.15 (top/bottom 15%)
 * clears those with margin while catching every ecl_workbook footer (frame
 * center ≈ 10.75in of 11in).
 */
export const PAGE_NUMBER_BAND = 0.15;

/** True when a frame's vertical center sits in the top or bottom header/footer
    band of a page `pageH` tall. */
export function inPageNumberBand(centerY: number, pageH: number): boolean {
  return centerY <= PAGE_NUMBER_BAND * pageH || centerY >= (1 - PAGE_NUMBER_BAND) * pageH;
}

/**
 * Replace every STANDALONE '#' token in `text` with `pageNumber`, returning
 * the rewritten text and how many tokens were replaced.
 *
 * "Standalone" means whitespace- or string-boundary-delimited — the same shape
 * Publisher's lone page-number field takes ("Page | #" → "Page | 5"). A '#'
 * glued to other glyphs is content, not a field, and is left untouched:
 * "#1 Store" and "Page #2" keep their '#'. `hits === 0` means nothing matched
 * (the text is returned unchanged), which is how callers decide a frame
 * carried a real field vs. an incidental '#'.
 */
export function substitutePageTokens(
  text: string,
  pageNumber: number,
): { text: string; hits: number } {
  let hits = 0;
  const out = text.replace(/(^|\s)#(?=\s|$)/g, (_match, pre: string) => {
    hits++;
    return `${pre}${pageNumber}`;
  });
  return { text: out, hits };
}
