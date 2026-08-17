import type { LayoutDocument, PageSize } from "../model";

/**
 * Effective page setup — the schema's per-page override rule resolved in one
 * place: a page's sizeOverride/bleedOverride/marginOverride win over the
 * document-level values; absent = the document value. Framework-free so the
 * stage, the overlay, and fit-zoom math share one resolution.
 */

export type EffectivePageSetup = {
  size: PageSize;
  bleed: number;
  margin: number;
};

/** An out-of-range pageIndex resolves to the document-level values — the
    soft-reference rule: render furniture from defaults rather than erroring. */
export function effectivePageSetup(doc: LayoutDocument, pageIndex: number): EffectivePageSetup {
  const page = doc.pages[pageIndex];
  return {
    size: page?.sizeOverride ?? doc.size,
    bleed: page?.bleedOverride ?? doc.bleed,
    margin: page?.marginOverride ?? doc.margin,
  };
}
