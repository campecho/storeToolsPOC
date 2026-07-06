import type {
  LayoutDocument,
  LayoutObject,
  LayoutPage,
  Paragraph,
  PathSeg,
  TextProps,
  TextRun,
} from "@/schema";
import { DEFAULT_TEXT_COLOR } from "@/lib/layout/text";
import { isDingbat, resolveFamily, translateDingbats } from "./font-remap";
import type { IRDoc, IRPage, IRParagraph, IRPathSeg, IRSpan, IRStyle } from "./model";
import type { FontRemap, ImportNote } from "./report";

/**
 * Intermediate model → `LayoutDocument` mapper (plan §10.3) — P2 scope:
 * geometry AND content fidelity. Text maps run-for-run (family, size, weight,
 * style, ink color) with fonts resolved through the §10.5 remap table;
 * paragraph alignment, line spacing, indents, frame insets, and vertical
 * alignment are all carried. Polygons/polylines/paths convert to real vector
 * paths (normalized segments). What still degrades — images (P3), tables,
 * gradient fills, rounded corners, exotic path verbs — degrades with a
 * report note. Nothing is dropped silently.
 */

export type MapResult = {
  doc: LayoutDocument;
  fidelity: { converted: number; degraded: number; flagged: number };
  fonts: FontRemap[];
  notes: ImportNote[];
};

/**
 * Publisher's "single" line spacing is ~1.19× the point size (its `1sp`
 * unit), not 1.0 — plan §10.5. Used when the trace carries no fo:line-height.
 */
export const PUBLISHER_DEFAULT_LINE_SPACING = 1.19;

const round = (n: number, places = 4) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/**
 * libmspub's `librevenge:rotate` maps to the editor's rotation DIRECTLY —
 * both are clockwise-positive about the frame center. Verified against the
 * corpus: pub2xhtml (the libmspub authors' reference render) emits
 * `rotate(θ, cx, cy)` for the same callbacks with θ passed through unchanged
 * and (cx, cy) = the frame center (3up_tabs.pub, 90° tab labels).
 */
function mapRotation(deg: number | undefined): number {
  if (!deg) return 0;
  return round(((deg % 360) + 360) % 360, 2);
}

function mapStroke(style: IRStyle): { color: string; width: number } | null {
  if (!style.stroke) return null;
  // Schema stroke width is CSS px at zoom 1 (ObjectNode: width × zoom).
  return { color: style.stroke.color, width: round(style.stroke.widthIn * 96, 2) };
}

/* ── Text: spans → runs, per-family font disposition (plan §10.5) ── */

type FontCtx = {
  fonts: Map<string, FontRemap>;
  /** Dingbat translation happened somewhere in the doc (one doc-level note). */
  sawDingbats: boolean;
  /** …and some dingbat characters had no Unicode equivalent. */
  sawUnmappedDingbats: boolean;
};

/** Resolve a source family once per document, recording the report row. */
function disposeFamily(source: string | undefined, ctx: FontCtx): string {
  if (!source) return resolveFamily("").family; // editor default, unrecorded
  const resolved = resolveFamily(source);
  if (!ctx.fonts.has(source)) {
    ctx.fonts.set(source, { source, mappedTo: resolved.family, reason: resolved.reason });
  }
  return resolved.family;
}

function mapSpan(span: IRSpan, ctx: FontCtx): TextRun {
  let text = span.text;
  if (span.fontName && isDingbat(span.fontName)) {
    const t = translateDingbats(text);
    text = t.text;
    ctx.sawDingbats = true;
    if (t.unmapped) ctx.sawUnmappedDingbats = true;
  }
  return {
    text,
    font: {
      family: disposeFamily(span.fontName, ctx),
      size: round(span.sizePt ?? 11, 1),
      bold: !!span.bold,
      italic: !!span.italic,
      underline: !!span.underline,
    },
    color: span.color ?? DEFAULT_TEXT_COLOR,
  };
}

const runStyleKey = (r: TextRun) => JSON.stringify([r.font, r.color]);

function mapParagraph(p: IRParagraph, ctx: FontCtx): Paragraph {
  // Merge adjacent same-style runs (libmspub splits spans liberally —
  // insertSpace callbacks, per-word spans in justified text).
  const runs: TextRun[] = [];
  for (const span of p.spans) {
    const run = mapSpan(span, ctx);
    const prev = runs[runs.length - 1];
    if (prev && runStyleKey(prev) === runStyleKey(run)) prev.text += run.text;
    else runs.push(run);
  }
  // Publisher ends each paragraph with a terminator (\r, normalized to \n by
  // the model) — redundant with the paragraph structure; strip it. Interior
  // \n (insertLineBreak) stay: they're soft breaks.
  const last = runs[runs.length - 1];
  if (last) {
    last.text = last.text.replace(/\n+$/, "");
    if (last.text === "" && runs.length > 1) runs.pop();
  }
  if (!runs.length) {
    runs.push({
      text: "",
      font: { family: disposeFamily(undefined, ctx), size: 11, bold: false, italic: false, underline: false },
      color: DEFAULT_TEXT_COLOR,
    });
  }
  return {
    align: p.align ?? "left",
    lineSpacing: round(p.lineSpacing ?? PUBLISHER_DEFAULT_LINE_SPACING, 3),
    ...(p.marginLeftIn ? { indent: round(p.marginLeftIn) } : {}),
    ...(p.textIndentIn ? { firstLineIndent: round(p.textIndentIn) } : {}),
    runs,
  };
}

function mapText(shape: { paragraphs: IRParagraph[]; style: IRStyle }, ctx: FontCtx): TextProps {
  const paragraphs = shape.paragraphs.length
    ? shape.paragraphs.map((p) => mapParagraph(p, ctx))
    : [mapParagraph({ spans: [] }, ctx)];
  const v = shape.style.textVAlign;
  const vAlign = v === "middle" || v === "center" ? "middle" : v === "bottom" ? "bottom" : undefined;
  const pad = shape.style.paddingIn;
  const inset =
    pad && Object.values(pad).some((n) => n > 0)
      ? { l: round(pad.l), r: round(pad.r), t: round(pad.t), b: round(pad.b) }
      : undefined;
  return {
    paragraphs,
    ...(vAlign ? { vAlign } : {}),
    ...(inset ? { inset } : {}),
  };
}

/* ── Vector paths: absolute-inch segments → normalized (0–1) frame space ── */

type AbsSeg = Exclude<IRPathSeg, { a: "?" }>;

function polyToSegs(points: { x: number; y: number }[], close: boolean): AbsSeg[] {
  const segs: AbsSeg[] = points.map((p, i) => ({ a: i === 0 ? "M" : "L", x: p.x, y: p.y }));
  if (close) segs.push({ a: "Z" });
  return segs;
}

/**
 * Normalize into the bbox (0–1 each axis) and lower quadratics to cubics so
 * the schema stays M/L/C/Z. Returns null when an unmodeled verb appears —
 * the caller degrades that shape to its bounding box with a note.
 */
function normalizeSegs(segs: IRPathSeg[], bbox: { x: number; y: number; w: number; h: number }): PathSeg[] | null {
  const nx = (v: number) => round(bbox.w > 0 ? (v - bbox.x) / bbox.w : 0);
  const ny = (v: number) => round(bbox.h > 0 ? (v - bbox.y) / bbox.h : 0);
  const out: PathSeg[] = [];
  let cur: { x: number; y: number } | null = null;
  for (const s of segs) {
    switch (s.a) {
      case "M":
      case "L":
        out.push({ c: s.a, x: nx(s.x), y: ny(s.y) });
        cur = { x: nx(s.x), y: ny(s.y) };
        break;
      case "C":
        out.push({ c: "C", x1: nx(s.x1), y1: ny(s.y1), x2: nx(s.x2), y2: ny(s.y2), x: nx(s.x), y: ny(s.y) });
        cur = { x: nx(s.x), y: ny(s.y) };
        break;
      case "Q": {
        // exact degree elevation: C1 = P0 + 2/3(Q−P0), C2 = P + 2/3(Q−P)
        if (!cur) return null;
        const qx = nx(s.x1);
        const qy = ny(s.y1);
        const x = nx(s.x);
        const y = ny(s.y);
        out.push({
          c: "C",
          x1: round(cur.x + (2 / 3) * (qx - cur.x)),
          y1: round(cur.y + (2 / 3) * (qy - cur.y)),
          x2: round(x + (2 / 3) * (qx - x)),
          y2: round(y + (2 / 3) * (qy - y)),
          x,
          y,
        });
        cur = { x, y };
        break;
      }
      case "Z":
        out.push({ c: "Z" });
        break;
      default:
        return null; // "?" — arc or other unmodeled verb
    }
  }
  return out;
}

/* ── Pages ── */

function mapPage(
  ir: IRPage,
  pageIndex: number,
  ctx: {
    fidelity: MapResult["fidelity"];
    notes: ImportNote[];
    fontCtx: FontCtx;
  },
): LayoutPage {
  const pageId = `imp-p${pageIndex + 1}`;
  const objects: LayoutObject[] = [];
  const note = (objectId: string, tier: 2 | 3, message: string) =>
    ctx.notes.push({ objectId, pageId, tier, message });

  ir.shapes.forEach((shape, i) => {
    const id = `${pageId}-o${i + 1}`;
    const degradations: string[] = [];
    const flag = (m: string) => degradations.push(m);
    const base = {
      id,
      x: round(shape.bbox.x),
      y: round(shape.bbox.y),
      w: round(shape.bbox.w),
      h: round(shape.bbox.h),
      rotation: mapRotation(shape.rotationDeg),
      locked: false,
      fill: shape.style.fill,
      stroke: mapStroke(shape.style),
    };
    if (shape.style.fillKind) {
      flag(`${shape.style.fillKind} fill flattened to the nearest flat color`);
    }

    switch (shape.kind) {
      case "rect": {
        if (shape.rxIn) flag("rounded corners dropped (no corner radius in the editor yet)");
        objects.push({ ...base, type: "rect" });
        break;
      }
      case "ellipse": {
        objects.push({ ...base, type: "ellipse" });
        break;
      }
      case "line": {
        objects.push({
          id,
          type: "line",
          x1: round(shape.x1),
          y1: round(shape.y1),
          x2: round(shape.x2),
          y2: round(shape.y2),
          stroke: mapStroke(shape.style) ?? { color: "#111111", width: 1 },
        });
        break;
      }
      case "polygon":
      case "polyline": {
        const d = normalizeSegs(polyToSegs(shape.pointsIn, shape.kind === "polygon"), shape.bbox);
        // polyToSegs emits only M/L/Z, so d is always non-null here
        objects.push({ ...base, type: "path", d: d ?? [] });
        break;
      }
      case "path": {
        const d = normalizeSegs(shape.segs, shape.bbox);
        if (d) {
          objects.push({ ...base, type: "path", d });
        } else {
          flag("path uses segments the editor can't model yet (arc) — converted to its bounding box");
          objects.push({ ...base, type: "rect" });
        }
        break;
      }
      case "image": {
        flag(
          `embedded image${shape.mime ? ` (${shape.mime})` : ""} shown as a placeholder frame — extraction arrives in P3`,
        );
        objects.push({ ...base, type: "picture", fill: base.fill ?? null });
        break;
      }
      case "table": {
        // Tier 3: flag-only placeholder (plan §10.3) — visibly not converted.
        ctx.fidelity.flagged++;
        note(id, 3, "table not converted — placeholder frame marks its position (tables tranche)");
        objects.push({ ...base, type: "rect", fill: null, stroke: { color: "#b58686", width: 1 } });
        return; // counted as flagged, not converted/degraded
      }
      case "textbox": {
        const text = mapText(shape, ctx.fontCtx);
        objects.push({ ...base, type: "text", fill: base.fill, text });
        break;
      }
    }

    if (degradations.length) {
      ctx.fidelity.degraded++;
      for (const m of degradations) note(id, 2, m);
    } else {
      ctx.fidelity.converted++;
    }
  });

  return { id: pageId, masterId: null, objects };
}

/** Map a parsed intermediate document to the editor's document model. */
export function mapToLayoutDocument(ir: IRDoc, name: string): MapResult {
  const fidelity = { converted: 0, degraded: 0, flagged: 0 };
  const notes: ImportNote[] = [];
  const fontCtx: FontCtx = { fonts: new Map(), sawDingbats: false, sawUnmappedDingbats: false };
  const ctx = { fidelity, notes, fontCtx };

  const first = ir.pages[0] ?? { wIn: 8.5, hIn: 11, shapes: [] };
  const size = { w: round(first.wIn), h: round(first.hIn) };

  const pages = ir.pages.length
    ? ir.pages.map((p, i) => {
        const mapped = mapPage(p, i, ctx);
        // Publisher allows per-page sizes; deviations from page 1 become
        // sizeOverride (§10.3's startPage row).
        if (round(p.wIn) !== size.w || round(p.hIn) !== size.h) {
          mapped.sizeOverride = { w: round(p.wIn), h: round(p.hIn) };
        }
        return mapped;
      })
    : [{ id: "imp-p1", masterId: null, objects: [] }];

  if (fontCtx.sawDingbats)
    notes.push({
      tier: 2,
      message: fontCtx.sawUnmappedDingbats
        ? "dingbat font (Wingdings) glyphs translated to Unicode symbols where known (✔ ✘ ☑ ■) — unmapped characters kept as their raw letters, review them"
        : "dingbat font (Wingdings) glyphs translated to Unicode symbols (✔ ✘ ☑ ■)",
    });
  if (ir.sawLayers) notes.push({ tier: 2, message: "source layers flattened into the page z-order" });
  if (ir.sawGroups) notes.push({ tier: 2, message: "grouped objects imported ungrouped (grouping is backlog)" });
  if (!ir.pages.length) {
    // Corpus finding (business_card_template_10up.pub): publications whose
    // content lives entirely on master pages convert empty — libmspub doesn't
    // expose master pages. Flag it; never present an empty doc as a clean win.
    notes.push({
      tier: 3,
      message:
        "no drawable page content found — this publication's content may live on master pages, which the Publisher parser doesn't expose yet",
    });
  }

  const doc: LayoutDocument = {
    version: 2,
    name,
    product: null,
    size,
    orientation: size.w > size.h ? "landscape" : "portrait",
    // Editor defaults for page setup: libmspub's trace exposes NO page-level
    // margin / guide / column / bleed data — corpus-verified, startPage carries
    // only width/height (plan §10.3). Page size is the one page-setup value we
    // import; margins/bleed/safe-area belong to the product spec on catalog
    // binding ("born correct", plan §6), not the customer's .pub.
    bleed: 0,
    margin: 0.5,
    columns: 1,
    pages,
    masters: [],
    assets: {},
    guides: { v: [], h: [] },
  };

  return { doc, fidelity, fonts: [...fontCtx.fonts.values()], notes };
}
