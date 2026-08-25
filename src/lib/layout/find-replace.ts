import type { LayoutDocument, LayoutObject, TextProps } from "@/lib/schema";
import { textContent } from "./text";

/**
 * Find & Replace engine (redesign plan Phase 7 — figma "Find & Replace"
 * dialog). Pure and framework-free. Matching runs per text RUN, so styling
 * survives replacement exactly; a query spanning two differently-styled runs
 * is not matched (POC scope, noted in the dialog). GREP mode is a real
 * RegExp per decision of record #6 — an invalid pattern reports instead of
 * throwing.
 */

export type FindOptions = {
  matchCase?: boolean;
  /** GREP mode: treat the query as a regular expression. */
  regex?: boolean;
};

export type FindMatch = {
  objectId: string;
  pageId: string;
  /** 1-based; 0 = a master page. */
  pageNo: number;
  /** Where the hit lives, e.g. `Page 1 - Text Frame` / `Master A`. */
  where: string;
  /** Context around the first hit in the frame, with ellipses. */
  snippet: string;
  /** Hits inside this frame. */
  count: number;
};

export type FindResult = {
  matches: FindMatch[];
  total: number;
  /** Set when GREP mode got an invalid pattern — matches are empty then. */
  error?: string;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** null = invalid pattern. A fresh instance per call site — `g` is stateful. */
function buildPattern(query: string, opts: FindOptions): RegExp | null {
  const source = opts.regex ? query : escapeRegExp(query);
  try {
    return new RegExp(source, opts.matchCase ? "g" : "gi");
  } catch {
    return null;
  }
}

function countIn(text: string, re: RegExp): number {
  re.lastIndex = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    n += 1;
    // a zero-length match (e.g. `a*`) would loop forever under replace-all
    // semantics; matchAll advances past it, we just count it once
    if (m[0] === "") break;
  }
  return n;
}

function snippetAround(text: string, re: RegExp): string {
  re.lastIndex = 0;
  const m = re.exec(text);
  if (!m) return "";
  const start = Math.max(0, m.index - 18);
  const end = Math.min(text.length, m.index + m[0].length + 18);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

type Holder = { o: LayoutObject; pageId: string; pageNo: number; where: string };

function textHolders(doc: LayoutDocument): Holder[] {
  const out: Holder[] = [];
  doc.pages.forEach((page, i) => {
    for (const layer of page.layers) {
      for (const o of layer.objects) {
        if (o.type === "text" && o.text) {
          out.push({ o, pageId: page.id, pageNo: i + 1, where: `Page ${i + 1} - Text Frame` });
        }
      }
    }
  });
  for (const master of doc.masters) {
    for (const o of master.objects) {
      if (o.type === "text" && o.text) {
        out.push({ o, pageId: master.id, pageNo: 0, where: `Master ${master.label}` });
      }
    }
  }
  return out;
}

export function findMatches(doc: LayoutDocument, query: string, opts: FindOptions = {}): FindResult {
  if (!query) return { matches: [], total: 0 };
  const re = buildPattern(query, opts);
  if (!re) return { matches: [], total: 0, error: "Invalid regular expression." };

  const matches: FindMatch[] = [];
  let total = 0;
  for (const h of textHolders(doc)) {
    const text = h.o.type === "text" && h.o.text ? textContent(h.o.text) : "";
    const count = countIn(text, re);
    if (!count) continue;
    total += count;
    matches.push({
      objectId: h.o.id,
      pageId: h.pageId,
      pageNo: h.pageNo,
      where: h.where,
      snippet: snippetAround(text, re),
      count,
    });
  }
  return { matches, total };
}

function replaceInText(t: TextProps, re: RegExp, replacement: string): { t: TextProps; n: number } {
  let n = 0;
  const paragraphs = t.paragraphs.map((p) => ({
    ...p,
    runs: p.runs.map((r) => {
      const c = countIn(r.text, re);
      if (!c) return r;
      n += c;
      re.lastIndex = 0;
      return { ...r, text: r.text.replace(re, replacement) };
    }),
  }));
  return n ? { t: { ...t, paragraphs }, n } : { t, n: 0 };
}

/** Replace across every text run on pages and masters. Pure — the store
    wraps the result in one history step. */
export function replaceInDoc(
  doc: LayoutDocument,
  query: string,
  replacement: string,
  opts: FindOptions = {},
): { doc: LayoutDocument; replaced: number } {
  if (!query) return { doc, replaced: 0 };
  const re = buildPattern(query, opts);
  if (!re) return { doc, replaced: 0 };

  let replaced = 0;
  const mapObjects = (objects: LayoutObject[]): LayoutObject[] =>
    objects.map((o) => {
      if (o.type !== "text" || !o.text) return o;
      const { t, n } = replaceInText(o.text, re, replacement);
      if (!n) return o;
      replaced += n;
      return { ...o, text: t };
    });

  const next: LayoutDocument = {
    ...doc,
    pages: doc.pages.map((p) => ({
      ...p,
      layers: p.layers.map((l) => ({ ...l, objects: mapObjects(l.objects) })),
    })),
    masters: doc.masters.map((m) => ({ ...m, objects: mapObjects(m.objects) })),
  };
  return replaced ? { doc: next, replaced } : { doc, replaced: 0 };
}
