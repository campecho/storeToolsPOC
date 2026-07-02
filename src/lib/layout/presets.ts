/**
 * Page-size presets (plan §3.2). Dimensions are portrait-stored inches — the
 * document's orientation decides which way they apply. Letter/Legal/Ledger
 * match the homepage's size tiles; the poster sizes carry the large-format
 * story (design doc §4.1 — past the old tooling's ceiling, which custom W/H
 * inputs can exceed further).
 */

export interface PagePreset {
  id: string;
  /** Dropdown face ("Letter"); Ledger is aka Tabloid. */
  label: string;
  w: number;
  h: number;
}

export const PAGE_PRESETS: readonly PagePreset[] = [
  { id: "letter", label: "Letter", w: 8.5, h: 11 },
  { id: "legal", label: "Legal", w: 8.5, h: 14 },
  { id: "ledger", label: "Ledger", w: 11, h: 17 },
  { id: "poster-18x24", label: "Poster 18 × 24", w: 18, h: 24 },
  { id: "poster-24x36", label: "Poster 24 × 36", w: 24, h: 36 },
];

export function getPreset(id: string): PagePreset | undefined {
  return PAGE_PRESETS.find((p) => p.id === id);
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Match effective dimensions against a preset in either orientation. */
export function matchPreset(w: number, h: number): PagePreset | undefined {
  return PAGE_PRESETS.find((p) => (near(p.w, w) && near(p.h, h)) || (near(p.w, h) && near(p.h, w)));
}

/** Short size name for captions and the title-bar hint. */
export function sizeLabel(w: number, h: number): string {
  return matchPreset(w, h)?.label ?? "Custom";
}

/** Inches for display — trims trailing zeros ("8.5", "11", "0.125"). */
export function formatIn(n: number): string {
  return Number(n.toFixed(4)).toString();
}
