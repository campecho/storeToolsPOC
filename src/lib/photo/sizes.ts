import type { Dims } from "./geometry";

/**
 * Crop-aspect + print-size presets (plan §3.2 `sizes.ts`, §4 PE2/PE5). These are
 * ProductBinding-shaped stand-ins: the catalog / spec-sync slice swaps them for
 * real product data later (plan dev #5, §6 "Catalog/product-size [INT]") — the
 * two inert catalog pickers in the wires ("Product size from catalog…",
 * "Pick a catalog product →") are where that binding lands. Until then these
 * fixed presets drive the Crop grid and the Fix-for-print target list.
 *
 * Ratios are auto-oriented by `aspectRectFor` (it tries `ratio` and `1/ratio`
 * and keeps the larger-area crop), so a preset's stored orientation is display
 * intent only, never a constraint on which way the crop lands.
 */

export interface CropPreset {
  id: string;
  label: string;
  /** Target aspect (width / height); null = Free, and Original until the panel
      resolves it from the image. Auto-oriented by `aspectRectFor`. */
  ratio: number | null;
  kind: "free" | "original" | "ratio" | "print";
  /** Physical size, inches — present on print-kind presets (feeds effectiveDpi). */
  inches?: Dims;
}

/**
 * The Section-B aspect grid, ids + labels EXACT (the labels double as the
 * history-dock string via `cropLabel`, wire-pinned as "Crop to 4 × 6", plan §5).
 * Labels use a spaced multiplication sign "×" (U+00D7). Ratios are given as
 * inches w/h (4 × 6 → 6/4 = 1.5, etc.); the reciprocal orientation is handled
 * downstream by auto-orientation.
 */
export const CROP_PRESETS: CropPreset[] = [
  { id: "free", label: "Free", ratio: null, kind: "free" },
  { id: "original", label: "Original", ratio: null, kind: "original" },
  { id: "1-1", label: "1:1", ratio: 1, kind: "ratio" },
  { id: "4x6", label: "4 × 6", ratio: 6 / 4, kind: "ratio" },
  { id: "5x7", label: "5 × 7", ratio: 7 / 5, kind: "ratio" },
  { id: "8x10", label: "8 × 10", ratio: 10 / 8, kind: "ratio" },
  { id: "letter", label: "Letter", ratio: 8.5 / 11, kind: "print", inches: { w: 8.5, h: 11 } },
  { id: "business-card", label: "Business card", ratio: 3.5 / 2, kind: "print", inches: { w: 3.5, h: 2 } },
];

export interface PrintSizePreset {
  sku: string;
  label: string;
  inches: Dims;
  /** Bleed per edge, inches. */
  bleed: number;
}

/**
 * Print products for the Fix-for-print target list. Bleed is a flat 0.125 in
 * placeholder for every SKU at the POC — the catalog binding refines per-product
 * "born correct" bleed values later (plan §6, PE5). The `inches` orientation is
 * nominal; effective-DPI math auto-orients, so it never pins the print's turn.
 */
export const PRINT_SIZES: PrintSizePreset[] = [
  { sku: "4x6", label: "4 × 6", inches: { w: 4, h: 6 }, bleed: 0.125 },
  { sku: "5x7", label: "5 × 7", inches: { w: 5, h: 7 }, bleed: 0.125 },
  { sku: "8x10", label: "8 × 10", inches: { w: 8, h: 10 }, bleed: 0.125 },
  { sku: "letter", label: "Letter", inches: { w: 8.5, h: 11 }, bleed: 0.125 },
  { sku: "business-card", label: "Business card", inches: { w: 3.5, h: 2 }, bleed: 0.125 },
];

/**
 * The history-dock label for applying a crop preset (plan §5, wire-pinned):
 * "Crop to 4 × 6" for a sized/ratio preset, plain "Crop" for Free.
 */
export function cropLabel(preset: CropPreset): string {
  return preset.kind === "free" ? "Crop" : `Crop to ${preset.label}`;
}
