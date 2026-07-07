import { createHash } from "node:crypto";
import type { LayoutDocument, LayoutObject, TextProps, TextRun } from "@/schema";
import { textContent } from "@/lib/layout/text";
import { arcToCubics } from "./arc";
import { isDingbat, resolveFamily, translateDingbats } from "./font-remap";
import { decodeBase64 } from "./image-meta";
import { inPageNumberBand, substitutePageTokens } from "./page-number";
import type { ImportAssetsPayload } from "./report";

/**
 * Fidelity harness (plan §10.6, P5) — scores the import pipeline's
 * `LayoutDocument` output against `pub2xhtml`'s reference render of the same
 * `.pub` (an independent consumer of the same libmspub parse), across the
 * Markzware conformance categories: page size · positioning · colors ·
 * fonts+remap · text attributes · text flow · images. Pure module — no fs;
 * corpus-fidelity.test.ts reads the checked-in fixtures and feeds them in.
 *
 * Reference-format facts this parser encodes (ground-truthed against
 * libmspub-tools 0.1.4 output, fixtures/pub-refs/):
 *   - one `<svg:svg width="9.0000in" …viewBox="0 0 648.0000 792.0000">` per
 *     page; coordinates inside are POINTS (viewBox units, 72/in);
 *   - `<!-- … -->` comment blocks wrap embedded XML doctypes — strip first;
 *   - `<svg:tspan font-size="0.1667">` is in INCHES (the same libmspub quirk
 *     the trace has: 0.1667 ≈ 12 pt);
 *   - shape paint lives in a `style="fill: …; stroke: …"` attribute; bitmap
 *     fills are `fill: url(#imgN)` referencing an `<svg:pattern>` in
 *     `<svg:defs>` whose `<svg:image>` carries the bytes as a data: URI;
 *   - the serializer pretty-prints a newline at the start of EVERY tspan's
 *     text node, while paragraph boundaries emit nothing at all — so tspan
 *     boundaries are unreliable whitespace. Text comparison therefore walks
 *     tspan tokens allowing ANY amount of whitespace (including none) at
 *     token boundaries; real content differences still fail.
 */

/* ── Reference model ── */

export type RefTspan = {
  /** Entity-decoded raw text (serializer newlines intact — normalized later). */
  text: string;
  family: string;
  /** font-size × 72 (the attribute is inches). */
  sizePt: number;
  /** Set only when the tspan carries font-weight / font-style — the contract
      checks bold/italic only when the reference declares them. */
  bold?: boolean;
  italic?: boolean;
  /** tspan fill, lowercase hex. */
  color: string;
};

export type RefText = {
  /** Anchor (baseline-ish, NOT the frame origin), inches. */
  x: number;
  y: number;
  /** transform="rotate(deg, cx, cy)" — librevenge rotates about the frame
      center, so cx/cy ≈ our frame center (inches). */
  rotate?: { deg: number; cx: number; cy: number };
  tspans: RefTspan[];
};

export type BBox = { x: number; y: number; w: number; h: number };

export type RefShape = {
  kind: "polygon" | "path" | "line";
  /** Coordinate hull, inches. For paths this includes curve control points —
      deliberately the SAME convention model.ts uses for the trace side, so
      both bboxes overestimate curves identically. */
  bbox: BBox;
  /** Lowercase hex; null = none. Pattern fills park the id in patternId. */
  fill: string | null;
  patternId?: string;
  stroke: string | null;
};

export type RefImage = { id: string; mime: string; dataB64: string };

export type RefPage = {
  w: number;
  h: number;
  texts: RefText[];
  shapes: RefShape[];
  images: RefImage[];
};

/* ── Reference parsing (hand-rolled: the output is machine-generated and
      regular; a DOM dependency would be heavier than the grammar) ── */

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : undefined;
}

function num(attrs: string, name: string): number | undefined {
  const v = attr(attrs, name);
  if (v === undefined) return undefined;
  const n = parseFloat(v); // parseFloat stops at a unit suffix ("9.0000in")
  return Number.isNaN(n) ? undefined : n;
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === "#") {
      const code =
        ent[1]?.toLowerCase() === "x" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isNaN(code) ? whole : String.fromCodePoint(code);
    }
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    return named[ent.toLowerCase()] ?? whole;
  });
}

/** Collapse whitespace runs to a single space and trim. */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function parseStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of style.split(";")) {
    const colon = part.indexOf(":");
    if (colon === -1) continue;
    out[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
  }
  return out;
}

function paintOf(attrs: string): { fill: string | null; patternId?: string; stroke: string | null } {
  const style = parseStyle(attr(attrs, "style") ?? "");
  const fill = style["fill"];
  const stroke = style["stroke"];
  const pattern = fill ? /^url\(#([^)]+)\)$/.exec(fill) : null;
  return {
    fill: !fill || fill === "none" || pattern ? null : fill.toLowerCase(),
    ...(pattern ? { patternId: pattern[1] } : {}),
    stroke: !stroke || stroke === "none" ? null : stroke.toLowerCase(),
  };
}

function bboxOfCoords(xs: number[], ys: number[], ptPerIn: number): BBox | undefined {
  if (!xs.length || !ys.length) return undefined;
  const x = Math.min(...xs) / ptPerIn;
  const y = Math.min(...ys) / ptPerIn;
  return { x, y, w: Math.max(...xs) / ptPerIn - x, h: Math.max(...ys) / ptPerIn - y };
}

/**
 * Command-aware `d` tokenizer → coordinate hull (viewBox points). The naive
 * "pair up every number" scan this replaced misread arcs catastrophically:
 * `A16.7750,14.4000 0.0000 1,1 85.1918,603.8565` pairs radii/rotation/flags
 * as coordinates. Grammar per pub2xhtml's serializer: absolute uppercase
 * M/L (1 pair), C (3 pairs), Q (2 pairs), Z (none), and
 * A (rx ry rot large-arc sweep x y). Arcs convert through the SAME
 * arcToCubics the trace side uses (scale-equivariant, so running it in
 * points matches the model's inch-side conversion exactly), and the hull
 * takes the resulting control points — both sides then hull equivalent
 * bézier geometry. Bare pairs after a command repeat it per SVG (after M
 * they mean L); pub2xhtml doesn't emit implicit repeats today, but the
 * grammar is cheap insurance.
 */
function pathCoords(d: string): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = "";
  let cur: { x: number; y: number } | null = null;
  let subpathStart: { x: number; y: number } | null = null;
  const read = () => parseFloat(tokens[i++]);
  const pushPt = (x: number, y: number) => {
    // a truncated command reads past the token list (NaN) — never hull it
    if (Number.isNaN(x) || Number.isNaN(y)) return;
    xs.push(x);
    ys.push(y);
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) {
      cmd = t.toUpperCase();
      i++;
      if (cmd === "Z") cur = subpathStart;
      continue;
    }
    switch (cmd) {
      case "M": {
        const x = read();
        const y = read();
        pushPt(x, y);
        cur = { x, y };
        subpathStart = cur;
        cmd = "L"; // implicit pairs after M are lineto (SVG spec)
        break;
      }
      case "L": {
        const x = read();
        const y = read();
        pushPt(x, y);
        cur = { x, y };
        break;
      }
      case "C": {
        const x1 = read();
        const y1 = read();
        const x2 = read();
        const y2 = read();
        const x = read();
        const y = read();
        pushPt(x1, y1);
        pushPt(x2, y2);
        pushPt(x, y);
        cur = { x, y };
        break;
      }
      case "Q": {
        const x1 = read();
        const y1 = read();
        const x = read();
        const y = read();
        pushPt(x1, y1);
        pushPt(x, y);
        cur = { x, y };
        break;
      }
      case "A": {
        const rx = read();
        const ry = read();
        const rotDeg = read();
        const largeArc = read() !== 0;
        const sweep = read() !== 0;
        const x = read();
        const y = read();
        if (cur) {
          for (const c of arcToCubics(cur, { rx, ry, rotDeg, largeArc, sweep, x, y })) {
            pushPt(c.x1, c.y1);
            pushPt(c.x2, c.y2);
            pushPt(c.x, c.y);
          }
        }
        pushPt(x, y); // endpoint always hulls, even without a current point
        cur = { x, y };
        break;
      }
      default:
        i++; // number with no governing command — malformed; skip it
    }
  }
  return { xs, ys };
}

/** Parse a pub2xhtml reference render into per-page reference models.
    A 0-byte render (master-page-only publication) parses to zero pages. */
export function parseReferencePages(xhtml: string): RefPage[] {
  const clean = xhtml.replace(/<!--[\s\S]*?-->/g, "");
  const pages: RefPage[] = [];
  for (const m of clean.matchAll(/<svg:svg\b([^>]*)>([\s\S]*?)<\/svg:svg>/g)) {
    const [, svgAttrs, body] = m;
    const w = num(svgAttrs, "width") ?? 0;
    const h = num(svgAttrs, "height") ?? 0;
    // Points per inch from the viewBox when present (648 units / 9in = 72);
    // 72 is librevenge's constant, kept as the fallback.
    const vb = (attr(svgAttrs, "viewBox") ?? "").split(/\s+/).map(parseFloat);
    const ptPerIn = vb.length === 4 && w > 0 && vb[2] > 0 ? vb[2] / w : 72;

    const texts: RefText[] = [];
    for (const t of body.matchAll(/<svg:text\b([^>]*)>([\s\S]*?)<\/svg:text>/g)) {
      const [, tAttrs, tBody] = t;
      const rot = /rotate\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/.exec(
        attr(tAttrs, "transform") ?? "",
      );
      const tspans: RefTspan[] = [];
      for (const s of tBody.matchAll(/<svg:tspan\b([^>]*)>([\s\S]*?)<\/svg:tspan>/g)) {
        const [, sAttrs, sText] = s;
        const weight = attr(sAttrs, "font-weight");
        const fstyle = attr(sAttrs, "font-style");
        tspans.push({
          text: decodeEntities(sText),
          family: attr(sAttrs, "font-family") ?? "",
          sizePt: (num(sAttrs, "font-size") ?? NaN) * 72,
          ...(weight !== undefined
            ? { bold: weight === "bold" || parseInt(weight, 10) >= 600 }
            : {}),
          ...(fstyle !== undefined ? { italic: fstyle === "italic" || fstyle === "oblique" } : {}),
          color: (attr(sAttrs, "fill") ?? "#000000").toLowerCase(),
        });
      }
      texts.push({
        x: (num(tAttrs, "x") ?? 0) / ptPerIn,
        y: (num(tAttrs, "y") ?? 0) / ptPerIn,
        ...(rot
          ? {
              rotate: {
                deg: parseFloat(rot[1]),
                cx: parseFloat(rot[2]) / ptPerIn,
                cy: parseFloat(rot[3]) / ptPerIn,
              },
            }
          : {}),
        tspans,
      });
    }

    const shapes: RefShape[] = [];
    for (const p of body.matchAll(/<svg:polygon\b([\s\S]*?)\/>/g)) {
      const points = (attr(p[1], "points") ?? "")
        .split(",")
        .map((pair) => pair.trim().split(/\s+/).map(parseFloat))
        .filter((xy) => xy.length === 2 && xy.every((n) => !Number.isNaN(n)));
      const bbox = bboxOfCoords(points.map((xy) => xy[0]), points.map((xy) => xy[1]), ptPerIn);
      if (bbox) shapes.push({ kind: "polygon", bbox, ...paintOf(p[1]) });
    }
    for (const p of body.matchAll(/<svg:path\b([\s\S]*?)\/>/g)) {
      // Command-aware scan (pathCoords): M/L/C/Q pairs plus arcs lowered
      // through the same arcToCubics as the trace side — the hull covers
      // control points, matching model.ts's bbox convention on both sides.
      const { xs, ys } = pathCoords(attr(p[1], "d") ?? "");
      const bbox = bboxOfCoords(xs, ys, ptPerIn);
      if (bbox) shapes.push({ kind: "path", bbox, ...paintOf(p[1]) });
    }
    for (const l of body.matchAll(/<svg:line\b([\s\S]*?)\/>/g)) {
      const coords = ["x1", "y1", "x2", "y2"].map((k) => num(l[1], k));
      if (coords.some((c) => c === undefined)) continue;
      const [x1, y1, x2, y2] = coords as number[];
      const bbox = bboxOfCoords([x1, x2], [y1, y2], ptPerIn);
      if (bbox) shapes.push({ kind: "line", bbox, ...paintOf(l[1]) });
    }

    const images: RefImage[] = [];
    for (const pat of body.matchAll(/<svg:pattern\b([^>]*)>([\s\S]*?)<\/svg:pattern>/g)) {
      const id = attr(pat[1], "id");
      const href = /xlink:href="data:([^;",]+);base64,([^"]*)"/.exec(pat[2]);
      if (id && href) images.push({ id, mime: href[1], dataB64: href[2] });
    }

    pages.push({ w, h, texts, shapes, images });
  }
  return pages;
}

/* ── Scorecard model ── */

export const CATEGORIES = [
  "pageSize",
  "position",
  "color",
  "font",
  "textAttrs",
  "textFlow",
  "images",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Tally = { pass: number; total: number };

export type FileScore = {
  name: string;
  categories: Record<Category, Tally>;
  /** Doc objects no reference element claimed — logged, pinned by the test. */
  extras: number;
  /** Reference elements no doc object matched (each already failed its
      applicable categories above). */
  unmatched: number;
  /** Human-readable failure lines for the scorecard log. */
  misses: string[];
};

export type Scorecard = { files: FileScore[]; combined: Record<Category, Tally> };

export type FidelityInput = {
  name: string;
  refPages: RefPage[];
  doc: LayoutDocument;
  /** Extracted image bytes from the mapper (assetId → payload). */
  blobs: ImportAssetsPayload;
};

export function categoryRatio(t: Tally): number {
  return t.total === 0 ? 1 : t.pass / t.total;
}

/* ── Tolerances ──
   Geometry tolerances are the frozen metric contract (§10.6 harness spec).
   pub2xhtml prints 4 decimals in points (±0.00007in quantization) and the
   mapper rounds to 4-decimal inches, so the contract values are generous
   against print precision — no tolerance below is precision-driven slack. */
const PAGE_TOL_IN = 0.01;
const POS_TOL_IN = 0.02;
const ANCHOR_INFLATE_IN = 0.05;
const ROT_CENTER_TOL_IN = 0.05;
const SIZE_TOL_PT = 0.5;
const EPS = 1e-9;

/* ── Doc-side element views ── */

type DocText = { id: string; x: number; y: number; w: number; h: number; text: TextProps };
type DocShape = { id: string; bbox: BBox; fill: string | null; stroke: string | null };
type DocPicture = { id: string; bbox: BBox; assetId?: string };

function splitDocObjects(objects: LayoutObject[]): {
  texts: DocText[];
  shapes: DocShape[];
  pictures: DocPicture[];
} {
  const texts: DocText[] = [];
  const shapes: DocShape[] = [];
  const pictures: DocPicture[] = [];
  for (const o of objects) {
    if (o.type === "line") {
      shapes.push({
        id: o.id,
        bbox: {
          x: Math.min(o.x1, o.x2),
          y: Math.min(o.y1, o.y2),
          w: Math.abs(o.x2 - o.x1),
          h: Math.abs(o.y2 - o.y1),
        },
        fill: null,
        stroke: o.stroke.color.toLowerCase(),
      });
    } else if (o.type === "text" && o.text) {
      texts.push({ id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, text: o.text });
    } else if (o.type === "picture") {
      pictures.push({
        id: o.id,
        bbox: { x: o.x, y: o.y, w: o.w, h: o.h },
        ...(o.assetId ? { assetId: o.assetId } : {}),
      });
    } else {
      // rect / ellipse / path (and a degenerate textless text frame, which
      // this corpus doesn't produce) — scored as a plain shape.
      shapes.push({
        id: o.id,
        bbox: { x: o.x, y: o.y, w: o.w, h: o.h },
        fill: o.fill ? o.fill.toLowerCase() : null,
        stroke: o.stroke ? o.stroke.color.toLowerCase() : null,
      });
    }
  }
  return { texts, shapes, pictures };
}

/* ── Matching (deterministic greedy bipartite) ── */

type Pair = { r: number; d: number; dist: number };

/** Greedy accept in (distance, refIdx, docIdx) order — deterministic, no
    double-matching. Returns refIdx → docIdx. */
function greedyMatch(pairs: Pair[], taken: { ref: Set<number>; doc: Set<number> }): Map<number, number> {
  const out = new Map<number, number>();
  const sorted = [...pairs].sort((a, b) => a.dist - b.dist || a.r - b.r || a.d - b.d);
  for (const p of sorted) {
    if (taken.ref.has(p.r) || taken.doc.has(p.d)) continue;
    taken.ref.add(p.r);
    taken.doc.add(p.d);
    out.set(p.r, p.d);
  }
  return out;
}

const center = (b: BBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** The reference point a text element is matched by: the rotate center when
    rotated (≈ frame center), else the anchor. */
const refTextPoint = (t: RefText) => (t.rotate ? { x: t.rotate.cx, y: t.rotate.cy } : { x: t.x, y: t.y });

/* ── Text comparison ── */

/**
 * Reference tspan → its comparison token. Two importer transforms are mirrored
 * onto the reference side so the harness measures the pipeline, not a
 * documented substitution:
 *   - Dingbat tspans compare post-translation: the importer maps Wingdings
 *     glyph bytes to Unicode symbols (font-remap.ts) — the SAME table runs here.
 *   - Page-number fields: when `pageNumber` is supplied (the caller decides
 *     per frame — see scoreMatchedText), each STANDALONE '#' is replaced with
 *     the page number via the SAME page-number.ts rule the mapper applies, so
 *     the substituted footer ("Page | 12") reconciles instead of failing flow.
 * The page-number swap runs on the raw text (whose whitespace delimits the '#'
 * token) before whitespace is normalized.
 */
function tspanToken(t: RefTspan, pageNumber?: number): string {
  const translated = isDingbat(t.family) ? translateDingbats(t.text).text : t.text;
  const text = pageNumber !== undefined ? substitutePageTokens(translated, pageNumber).text : translated;
  return normalizeText(text);
}

/** Whitespace-free content key for match-by-content (scoring stays strict —
    see alignTspans; this only decides WHICH frame a reference text pairs
    with, before proximity breaks ties). `pageNumber` mirrors the mapper's
    page-number substitution so a substituted footer's key matches its doc
    frame's — supplied per candidate doc frame by the caller. */
function refContentKey(t: RefText, pageNumber?: number): string {
  return t.tspans.map((s) => tspanToken(s, pageNumber)).join("").replace(/\s+/g, "");
}
function docContentKey(t: TextProps): string {
  return normalizeText(textContent(t)).replace(/\s+/g, "");
}

type DocChar = { ch: string; run: TextRun | null };

function docChars(text: TextProps): DocChar[] {
  const out: DocChar[] = [];
  text.paragraphs.forEach((p, i) => {
    if (i) out.push({ ch: "\n", run: null }); // paragraph separator, unstyled
    for (const r of p.runs) for (const ch of r.text) out.push({ ch, run: r });
  });
  return out;
}

/**
 * Walk the frame's characters against the tspan tokens. tspan boundaries
 * match any amount of doc whitespace INCLUDING NONE (the serializer newline
 * problem — see the header comment); whitespace inside a token requires at
 * least one doc whitespace char. Success = the text flow reconciles; the
 * returned map carries each tspan's aligned runs for the per-tspan
 * font/textAttrs/color checks. null = flow mismatch.
 */
function alignTspans(
  tspans: RefTspan[],
  chars: DocChar[],
  pageNumber?: number,
): Map<number, TextRun[]> | null {
  const isWs = (c: string) => /\s/.test(c);
  let pos = 0;
  const skipWs = () => {
    while (pos < chars.length && isWs(chars[pos].ch)) pos++;
  };
  const out = new Map<number, TextRun[]>();
  for (let i = 0; i < tspans.length; i++) {
    const token = tspanToken(tspans[i], pageNumber);
    if (!token) continue; // empty/whitespace-only tspan (paragraph terminator)
    skipWs();
    const runs: TextRun[] = [];
    for (const ch of token) {
      if (ch === " ") {
        if (pos >= chars.length || !isWs(chars[pos].ch)) return null;
        skipWs();
      } else {
        if (pos >= chars.length || chars[pos].ch !== ch) return null;
        const run = chars[pos].run;
        if (run) runs.push(run);
        pos++;
      }
    }
    out.set(i, runs);
  }
  skipWs();
  return pos === chars.length ? out : null;
}

/** Remap-aware family equality: ours matches the reference family directly,
    or matches what the remap table maps that family to. */
function familyMatches(docFamily: string, refFamily: string): boolean {
  return docFamily === refFamily || docFamily === resolveFamily(refFamily).family;
}

/* ── Scoring ── */

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

class Tallies {
  categories: Record<Category, Tally>;
  misses: string[] = [];
  constructor() {
    this.categories = Object.fromEntries(
      CATEGORIES.map((c) => [c, { pass: 0, total: 0 }]),
    ) as Record<Category, Tally>;
  }
  check(cat: Category, ok: boolean, miss: string): void {
    this.categories[cat].total++;
    if (ok) this.categories[cat].pass++;
    else this.misses.push(`${cat}: ${miss}`);
  }
}

function scoreMatchedText(
  ref: RefText,
  doc: DocText,
  t: Tallies,
  where: string,
  pageH: number,
  pageNumber: number,
): void {
  // Page-number field: the mapper substitutes '#' → page number in frames whose
  // CENTER sits in the header/footer band. Mirror it here under the SAME
  // frame-center test — using the matched DOC frame's center (which the harness
  // has), NOT the reference anchor. That distinction matters: pub2xhtml anchors
  // a whole text frame at its last-line baseline, so a tall body frame carrying
  // an incidental '#' ("Total # of Cuts") anchors deep in the bottom band even
  // though its center is mid-page — gating on the doc center keeps that '#'
  // literal on both sides, exactly as the mapper leaves it. When the frame is
  // banded, the reference '#' becomes the page number so textFlow reconciles.
  const pn = inPageNumberBand(doc.y + doc.h / 2, pageH) ? pageNumber : undefined;
  if (ref.rotate) {
    const d = dist({ x: ref.rotate.cx, y: ref.rotate.cy }, { x: doc.x + doc.w / 2, y: doc.y + doc.h / 2 });
    t.check(
      "position",
      d <= ROT_CENTER_TOL_IN + EPS,
      `${where} rotated text ${doc.id}: rotate center off frame center by ${d.toFixed(4)}in`,
    );
  } else {
    const inX = ref.x >= doc.x - ANCHOR_INFLATE_IN && ref.x <= doc.x + doc.w + ANCHOR_INFLATE_IN;
    const inY = ref.y >= doc.y - ANCHOR_INFLATE_IN && ref.y <= doc.y + doc.h + ANCHOR_INFLATE_IN;
    t.check(
      "position",
      inX && inY,
      `${where} text ${doc.id}: anchor (${ref.x.toFixed(3)}, ${ref.y.toFixed(3)}) outside inflated frame`,
    );
  }

  const aligned = alignTspans(ref.tspans, docChars(doc.text), pn);
  t.check(
    "textFlow",
    aligned !== null,
    `${where} text ${doc.id}: flow mismatch — ref "${normalizeText(ref.tspans.map((s) => tspanToken(s, pn)).join(" ")).slice(0, 60)}" vs doc "${normalizeText(textContent(doc.text)).slice(0, 60)}"`,
  );

  ref.tspans.forEach((span, i) => {
    if (!tspanToken(span, pn)) return; // no content to attribute
    const runs = aligned?.get(i) ?? null;
    const label = `${where} text ${doc.id} tspan "${tspanToken(span, pn).slice(0, 30)}"`;
    if (!runs) {
      // flow didn't reconcile — the span's styling can't be attributed
      t.check("font", false, `${label}: unaligned`);
      t.check("textAttrs", false, `${label}: unaligned`);
      t.check("color", false, `${label}: unaligned`);
      return;
    }
    t.check(
      "font",
      runs.every((r) => familyMatches(r.font.family, span.family)),
      `${label}: ref family "${span.family}" vs doc "${runs[0]?.font.family}"`,
    );
    t.check(
      "textAttrs",
      runs.every(
        (r) =>
          Math.abs(r.font.size - span.sizePt) <= SIZE_TOL_PT + EPS &&
          (span.bold === undefined || r.font.bold === span.bold) &&
          (span.italic === undefined || r.font.italic === span.italic),
      ),
      `${label}: ref ${span.sizePt.toFixed(2)}pt b=${span.bold} i=${span.italic} vs doc ${runs[0]?.font.size}pt b=${runs[0]?.font.bold} i=${runs[0]?.font.italic}`,
    );
    t.check(
      "color",
      runs.every((r) => r.color.toLowerCase() === span.color),
      `${label}: ref ${span.color} vs doc ${runs[0]?.color}`,
    );
  });
}

/** An unmatched reference element fails every category applicable to it. No
    page-number substitution: there is no matched doc frame to mirror, and the
    tokens here only build the miss label. */
function failUnmatchedText(ref: RefText, t: Tallies, where: string): void {
  const what = `${where} unmatched ref text "${normalizeText(ref.tspans.map((s) => tspanToken(s)).join(" ")).slice(0, 40)}"`;
  t.check("position", false, what);
  t.check("textFlow", false, what);
  for (const span of ref.tspans) {
    if (!tspanToken(span)) continue;
    t.check("font", false, what);
    t.check("textAttrs", false, what);
    t.check("color", false, what);
  }
}

function bboxWithin(a: BBox, b: BBox, tol: number): boolean {
  return (
    Math.abs(a.x - b.x) <= tol + EPS &&
    Math.abs(a.y - b.y) <= tol + EPS &&
    Math.abs(a.w - b.w) <= tol + EPS &&
    Math.abs(a.h - b.h) <= tol + EPS
  );
}

function scoreMatchedShape(ref: RefShape, doc: DocShape, t: Tallies, where: string): void {
  t.check(
    "position",
    bboxWithin(ref.bbox, doc.bbox, POS_TOL_IN),
    `${where} ${ref.kind} vs ${doc.id}: bbox ref(${ref.bbox.x.toFixed(3)},${ref.bbox.y.toFixed(3)},${ref.bbox.w.toFixed(3)},${ref.bbox.h.toFixed(3)}) doc(${doc.bbox.x.toFixed(3)},${doc.bbox.y.toFixed(3)},${doc.bbox.w.toFixed(3)},${doc.bbox.h.toFixed(3)})`,
  );
  t.check("color", ref.fill === doc.fill, `${where} ${doc.id}: fill ref ${ref.fill} vs doc ${doc.fill}`);
  t.check(
    "color",
    ref.stroke === doc.stroke,
    `${where} ${doc.id}: stroke ref ${ref.stroke} vs doc ${doc.stroke}`,
  );
}

function failUnmatchedShape(ref: RefShape, t: Tallies, where: string): void {
  const what = `${where} unmatched ref ${ref.kind} at (${ref.bbox.x.toFixed(3)}, ${ref.bbox.y.toFixed(3)})`;
  t.check("position", false, what);
  t.check("color", false, what);
  t.check("color", false, what);
}

/** Score one file's reference render against its imported document. */
export function scoreAgainstReference(input: FidelityInput): FileScore {
  const { name, refPages, doc, blobs } = input;
  const t = new Tallies();
  let extras = 0;
  let unmatched = 0;

  // Asset payload digests, for the images category's byte check.
  const assetDigests = new Map<string, { len: number; sha: string }>();
  for (const [id, payload] of Object.entries(blobs)) {
    const bytes = decodeBase64(payload.dataB64);
    assetDigests.set(id, { len: bytes.length, sha: sha256(bytes) });
  }

  const pageCount = Math.max(refPages.length, doc.pages.length);
  for (let p = 0; p < pageCount; p++) {
    const ref = refPages[p];
    const page = doc.pages[p];
    const where = `${name} p${p + 1}`;

    // pageSize — per page, honoring per-page overrides.
    const size = page?.sizeOverride ?? doc.size;
    t.check(
      "pageSize",
      !!ref &&
        !!page &&
        Math.abs(ref.w - size.w) <= PAGE_TOL_IN + EPS &&
        Math.abs(ref.h - size.h) <= PAGE_TOL_IN + EPS,
      !ref
        ? `${where}: doc has a page the reference doesn't`
        : !page
          ? `${where}: reference has a page the doc doesn't`
          : `${where}: ref ${ref.w}×${ref.h}in vs doc ${size.w}×${size.h}in`,
    );

    const docEls = splitDocObjects(page?.objects ?? []);
    const refTexts = ref?.texts ?? [];
    const refShapesAll = ref?.shapes ?? [];
    const refPlain = refShapesAll.filter((s) => !s.patternId);
    const refPattern = refShapesAll.filter((s) => s.patternId);
    const refImagesById = new Map((ref?.images ?? []).map((i) => [i.id, i]));

    /* Texts: content-equality first (tie-break nearest), then proximity. The
       page-number substitution is keyed on the CANDIDATE doc frame's band (the
       mapper's criterion): a ref key is built with the page number only when
       compared against a banded doc frame, so a substituted footer's key
       ("…Page | 12") matches its doc frame while an incidental body '#' still
       matches its (out-of-band) frame literally. */
    const textTaken = { ref: new Set<number>(), doc: new Set<number>() };
    const docKeys = docEls.texts.map((d) => docContentKey(d.text));
    const contentPairs: Pair[] = [];
    const anyPairs: Pair[] = [];
    refTexts.forEach((r, ri) => {
      docEls.texts.forEach((d, di) => {
        const dd = dist(refTextPoint(r), { x: d.x + d.w / 2, y: d.y + d.h / 2 });
        const pn = inPageNumberBand(d.y + d.h / 2, size.h) ? p + 1 : undefined;
        const refKey = refContentKey(r, pn);
        if (refKey && refKey === docKeys[di]) contentPairs.push({ r: ri, d: di, dist: dd });
        anyPairs.push({ r: ri, d: di, dist: dd });
      });
    });
    const textMatch = greedyMatch(contentPairs, textTaken);
    for (const [ri, di] of greedyMatch(anyPairs, textTaken)) textMatch.set(ri, di);
    refTexts.forEach((r, ri) => {
      const di = textMatch.get(ri);
      if (di === undefined) {
        unmatched++;
        failUnmatchedText(r, t, where);
      } else {
        scoreMatchedText(r, docEls.texts[di], t, where, size.h, p + 1);
      }
    });
    extras += docEls.texts.filter((_, di) => !textTaken.doc.has(di)).length;
    for (const [di, d] of docEls.texts.entries())
      if (!textTaken.doc.has(di)) t.misses.push(`extra: ${where} doc text ${d.id} unmatched`);

    /* Plain shapes ↔ rect/ellipse/path/line objects, by bbox-center proximity. */
    const shapeTaken = { ref: new Set<number>(), doc: new Set<number>() };
    const shapePairs: Pair[] = [];
    refPlain.forEach((r, ri) => {
      docEls.shapes.forEach((d, di) => {
        shapePairs.push({ r: ri, d: di, dist: dist(center(r.bbox), center(d.bbox)) });
      });
    });
    const shapeMatch = greedyMatch(shapePairs, shapeTaken);
    refPlain.forEach((r, ri) => {
      const di = shapeMatch.get(ri);
      if (di === undefined) {
        unmatched++;
        failUnmatchedShape(r, t, where);
      } else {
        scoreMatchedShape(r, docEls.shapes[di], t, where);
      }
    });
    extras += docEls.shapes.filter((_, di) => !shapeTaken.doc.has(di)).length;
    for (const [di, d] of docEls.shapes.entries())
      if (!shapeTaken.doc.has(di)) t.misses.push(`extra: ${where} doc shape ${d.id} unmatched`);

    /* Pattern-filled shapes ↔ picture frames: position (like any shape), then
       the images category = geometry + bytes. Pattern fills carry no hex
       paint, so they contribute no color checks. */
    const picTaken = { ref: new Set<number>(), doc: new Set<number>() };
    const picPairs: Pair[] = [];
    refPattern.forEach((r, ri) => {
      docEls.pictures.forEach((d, di) => {
        picPairs.push({ r: ri, d: di, dist: dist(center(r.bbox), center(d.bbox)) });
      });
    });
    const picMatch = greedyMatch(picPairs, picTaken);
    refPattern.forEach((r, ri) => {
      const di = picMatch.get(ri);
      const img = r.patternId ? refImagesById.get(r.patternId) : undefined;
      if (di === undefined) {
        unmatched++;
        t.check("position", false, `${where} unmatched ref pattern ${r.patternId}`);
        t.check("images", false, `${where} unmatched ref pattern ${r.patternId}`);
        return;
      }
      const pic = docEls.pictures[di];
      const geomOk = bboxWithin(r.bbox, pic.bbox, POS_TOL_IN);
      t.check(
        "position",
        geomOk,
        `${where} pattern ${r.patternId} vs ${pic.id}: bbox off by more than ${POS_TOL_IN}in`,
      );
      let bytesOk = false;
      if (img && pic.assetId) {
        const got = assetDigests.get(pic.assetId);
        const refBytes = decodeBase64(img.dataB64);
        bytesOk = !!got && got.len === refBytes.length && got.sha === sha256(refBytes);
      }
      t.check(
        "images",
        geomOk && bytesOk,
        `${where} pattern ${r.patternId} vs ${pic.id}: ${geomOk ? "" : "geometry off; "}${bytesOk ? "" : "bytes/asset mismatch"}`,
      );
    });
    extras += docEls.pictures.filter((_, di) => !picTaken.doc.has(di)).length;
    for (const [di, d] of docEls.pictures.entries())
      if (!picTaken.doc.has(di)) t.misses.push(`extra: ${where} doc picture ${d.id} unmatched`);

    // Count parity, both ways, per page: every reference bitmap fill became a
    // picture frame and no picture frame appeared from nowhere.
    t.check(
      "images",
      refPattern.length === docEls.pictures.length,
      `${where}: ${refPattern.length} ref pattern fills vs ${docEls.pictures.length} doc picture frames`,
    );
  }

  return { name, categories: t.categories, extras, unmatched, misses: t.misses };
}

/** Score a corpus: per-file scorecards plus the combined per-category tally
    the ≥90% gate asserts on. */
export function computeFidelity(inputs: FidelityInput[]): Scorecard {
  const files = inputs.map(scoreAgainstReference);
  const combined = Object.fromEntries(
    CATEGORIES.map((c) => [c, { pass: 0, total: 0 }]),
  ) as Record<Category, Tally>;
  for (const f of files) {
    for (const c of CATEGORIES) {
      combined[c].pass += f.categories[c].pass;
      combined[c].total += f.categories[c].total;
    }
  }
  return { files, combined };
}

/** Render the scorecard as a readable fixed-width table (counts AND
    percentages — the numbers, not just a verdict), misses appended. */
export function formatScorecard(card: Scorecard): string {
  const nameW = Math.max(8, ...card.files.map((f) => f.name.length), "combined".length) + 2;
  const colW = 16; // fits "NNN/NNN 100.0%"
  const header =
    "".padEnd(nameW) + CATEGORIES.map((c) => c.padEnd(colW)).join("") + "extras".padEnd(8) + "unmatched";
  const cell = (t: Tally) => `${t.pass}/${t.total}`.padEnd(colW);
  const rows = card.files.map(
    (f) =>
      f.name.padEnd(nameW) +
      CATEGORIES.map((c) => cell(f.categories[c])).join("") +
      String(f.extras).padEnd(8) +
      String(f.unmatched),
  );
  const combinedRow =
    "combined".padEnd(nameW) +
    CATEGORIES.map((c) => {
      const t = card.combined[c];
      return `${t.pass}/${t.total} ${(categoryRatio(t) * 100).toFixed(1)}%`.padEnd(colW);
    }).join("");
  const misses = card.files.flatMap((f) => f.misses.map((m) => `  MISS ${m}`));
  return [header, ...rows, combinedRow, ...(misses.length ? ["misses:", ...misses] : [])].join("\n");
}
