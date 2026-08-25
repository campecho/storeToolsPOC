/**
 * Template catalog (redesign plan Phase 9 — figma "Publisher - select a
 * template"): the Template Explorer's sections and cards. Static seed data —
 * a real catalog binds to products later (plan §6); the Blank Sizes row
 * reuses the preset dimensions so a card and the Page tab agree.
 */

export type TemplateCategory = "booklets" | "flyers" | "blank";

export type TemplateCard = {
  id: string;
  name: string;
  category: TemplateCategory;
  /** Portrait-stored inches, like PAGE_PRESETS. */
  w: number;
  h: number;
  orientation: "portrait" | "landscape";
  margin: number;
  bleed: number;
};

/** A3/A5 in inches — the figma cards' "16.535 x 11.693”" family. */
const A3 = { w: 11.693, h: 16.535 };
const A5 = { w: 5.827, h: 8.268 };

export const TEMPLATE_SECTIONS: { category: TemplateCategory; label: string }[] = [
  { category: "booklets", label: "Booklets" },
  { category: "flyers", label: "Flyers" },
  { category: "blank", label: "Blank Sizes" },
];

export const TEMPLATES: readonly TemplateCard[] = [
  { id: "booklet-basic", name: "Basic Booklet", category: "booklets", ...A3, orientation: "landscape", margin: 0.5, bleed: 0.125 },
  { id: "booklet-presentation", name: "Presentation", category: "booklets", ...A3, orientation: "landscape", margin: 0.75, bleed: 0.125 },
  { id: "booklet-manuals", name: "Manuals", category: "booklets", ...A3, orientation: "landscape", margin: 0.75, bleed: 0 },
  { id: "flyer-letter", name: "Letter Flyer", category: "flyers", w: 8.5, h: 11, orientation: "portrait", margin: 0.5, bleed: 0.125 },
  { id: "flyer-half", name: "Half-Page Flyer", category: "flyers", w: 5.5, h: 8.5, orientation: "portrait", margin: 0.375, bleed: 0.125 },
  { id: "flyer-rack", name: "Rack Card", category: "flyers", w: 4, h: 9, orientation: "portrait", margin: 0.25, bleed: 0.125 },
  { id: "blank-a3-landscape", name: "A3 (Landscape)", category: "blank", ...A3, orientation: "landscape", margin: 0.5, bleed: 0 },
  { id: "blank-a3-portrait", name: "A3 (Portrait)", category: "blank", ...A3, orientation: "portrait", margin: 0.5, bleed: 0 },
  { id: "blank-a5-landscape", name: "A5 (Landscape)", category: "blank", ...A5, orientation: "landscape", margin: 0.5, bleed: 0 },
  { id: "blank-a5-portrait", name: "A5 (Portrait)", category: "blank", ...A5, orientation: "portrait", margin: 0.5, bleed: 0 },
  { id: "blank-letter", name: "Letter", category: "blank", w: 8.5, h: 11, orientation: "portrait", margin: 0.5, bleed: 0.125 },
  { id: "blank-legal", name: "Legal", category: "blank", w: 8.5, h: 14, orientation: "portrait", margin: 0.5, bleed: 0.125 },
  { id: "blank-ledger", name: "Ledger", category: "blank", w: 11, h: 17, orientation: "portrait", margin: 0.5, bleed: 0.125 },
];

/** The card caption, oriented: `11.693 x 16.535”` etc. */
export function templateSizeCaption(t: TemplateCard): string {
  const [w, h] = t.orientation === "landscape" ? [t.h, t.w] : [t.w, t.h];
  const f = (n: number) => String(Math.round(n * 1000) / 1000);
  return `${f(w)} x ${f(h)}”`;
}
