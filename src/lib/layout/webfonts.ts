import type { LayoutDocument, LayoutObject } from "@/schema";
import { FONT_CATALOG } from "./font-catalog";

/**
 * Lazy webfont registration (plan §10.5): catalog families with self-hosted
 * WOFF2 stand-ins register via the FontFace API on first use — nothing loads
 * at page start, and families never used by a document never load. Callers
 * await ensureFamiliesLoaded before trusting text measurement (the overflow
 * badge re-measures when it resolves).
 *
 * SSR-safe: on the server this is a no-op (document.fonts is browser-only).
 */

const requested = new Set<string>();

/** Every font family any run in the document references (pages + masters). */
export function collectDocFontFamilies(doc: LayoutDocument): string[] {
  const names = new Set<string>();
  const collect = (obj: LayoutObject) => {
    if (obj.type === "text" && obj.text) {
      for (const p of obj.text.paragraphs) for (const r of p.runs) names.add(r.font.family);
    }
  };
  for (const page of doc.pages) for (const layer of page.layers) layer.objects.forEach(collect);
  for (const master of doc.masters) master.objects.forEach(collect);
  return [...names];
}

/**
 * Register + load the webfont faces behind the given catalog family names.
 * Resolves true when at least one NEW face finished loading (callers use it
 * to re-measure); families without webfont files resolve without work.
 */
export async function ensureFamiliesLoaded(names: Iterable<string>): Promise<boolean> {
  if (typeof document === "undefined" || !("fonts" in document)) return false;
  const loads: Promise<unknown>[] = [];
  for (const name of names) {
    const entry = FONT_CATALOG.find((f) => f.name === name);
    if (!entry?.files || !entry.webFamily || requested.has(name)) continue;
    requested.add(name);
    for (const file of entry.files) {
      const face = new FontFace(entry.webFamily, `url(/fonts/${file.file})`, {
        weight: String(file.weight),
        style: file.style,
      });
      document.fonts.add(face);
      loads.push(
        face.load().catch((err) => {
          // A missing/corrupt file degrades to the CSS stack's next entry —
          // log once so the gap is visible, never throw into render paths.
          console.warn(`webfont failed to load: ${entry.name} (${file.file})`, err);
        }),
      );
    }
  }
  if (!loads.length) return false;
  await Promise.all(loads);
  return true;
}
