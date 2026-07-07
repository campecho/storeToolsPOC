import type {
  Asset,
  LayoutDocument,
  LayoutObject,
  LayoutPage,
  Paragraph,
  PathSeg,
  TextProps,
  TextRun,
} from "@/schema";
import { DEFAULT_TEXT_COLOR, textContent } from "@/lib/layout/text";
import { isDingbat, resolveFamily, translateDingbats } from "./font-remap";
import { assetIdFor, decodeBase64, imageDimensions, isRenderableImage, sniffImageMime } from "./image-meta";
import type { IRDoc, IRPage, IRParagraph, IRPathSeg, IRShape, IRSpan, IRStyle } from "./model";
import type { FontRemap, ImportAssetsPayload, ImportNote } from "./report";

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
  /** Extracted image bytes (P3), keyed by asset id — the API response's
      `assets` half (report.ts's frozen contract). Seeds the client blob store
      before the document opens; `doc.assets` holds the matching metadata. */
  blobs: ImportAssetsPayload;
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

/* ── Images: bitmap fills + graphic objects → deduped asset registry (P3) ── */

/**
 * Distinct-payload asset store built as the mapper walks the shapes. Both
 * image paths — `drawGraphicObject` (office:binary-data) and bitmap fills
 * (draw:fill-image) — funnel through here; identical bytes collapse to one
 * asset (the labels corpus applies one bitmap to 16 sibling frames).
 */
type AssetRegistry = {
  /** doc.assets metadata, keyed by content id. */
  assets: Record<string, Asset>;
  /** API-response blob payloads, same keys. */
  blobs: ImportAssetsPayload;
  /** First-seen counter for `imported-<n>.<ext>` names. */
  count: number;
};

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/webp": "webp",
};

/** Sniff a payload's true type (never trust the declared mime) once. */
function inspectImage(dataB64: string, declaredMime: string | undefined): {
  bytes: Uint8Array;
  mime: string;
  renderable: boolean;
} {
  const bytes = decodeBase64(dataB64);
  const mime = sniffImageMime(bytes) ?? declaredMime ?? "application/octet-stream";
  return { bytes, mime, renderable: isRenderableImage(mime) };
}

/** Human format label for a mime, for the degradation notes ("WMF", "TIFF"). */
function formatName(mime: string): string {
  const slash = mime.indexOf("/");
  const sub = slash === -1 ? mime : mime.slice(slash + 1);
  return sub.replace(/^x-/, "").toUpperCase();
}

/** Register a renderable payload (dedup by content id), returning its asset id. */
function registerImage(reg: AssetRegistry, dataB64: string, bytes: Uint8Array, mime: string): string {
  const id = assetIdFor(dataB64);
  if (!reg.blobs[id]) {
    reg.blobs[id] = { mime, dataB64 };
    const n = ++reg.count;
    const dims = imageDimensions(bytes, mime);
    reg.assets[id] = {
      id,
      name: `imported-${n}.${EXT_BY_MIME[mime] ?? "img"}`,
      kind: "image",
      mime,
      ...(dims ? { width: dims.width, height: dims.height } : {}),
      bytes: bytes.length,
    };
  }
  return id;
}

/**
 * A bitmap fill lands on a shape whose geometry is an axis-aligned rectangle
 * (a rect frame, or a polygon Publisher emits as one) → we can honestly show
 * the image stretched into the frame. The corpus ships rectangles as 4- or
 * 5-point polygons (the 5th repeats the first); tolerance is 0.002in.
 */
function isAxisAlignedRect(points: { x: number; y: number }[]): boolean {
  if (points.length !== 4 && points.length !== 5) return false;
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.002;
  const distinct = (vals: number[]): number[] => {
    const out: number[] = [];
    for (const v of vals) if (!out.some((u) => near(u, v))) out.push(v);
    return out;
  };
  return distinct(points.map((p) => p.x)).length === 2 && distinct(points.map((p) => p.y)).length === 2;
}

function fillImageIsRectangular(shape: IRShape): boolean {
  return shape.kind === "rect" || (shape.kind === "polygon" && isAxisAlignedRect(shape.pointsIn));
}

/* ── Post-layout honest-reporting passes (plan §10.4) ── */

/**
 * Wrap-overlap gate (ecl_workbook corpus). Publisher wraps body copy around
 * inline pictures, but libmspub emits NO wrap data at all (verified against
 * the library binary), so imported text lays out through the full frame
 * rectangle and any higher-z picture paints over it. A text frame is flagged
 * when a picture drawn ABOVE it (later in z-order) covers at least this
 * fraction of the text frame's area.
 *
 * Tuned against all five corpus traces. The four verified-correct files
 * (3up_tabs, bcim_double_cut, production_checkpoint_labels,
 * business_card_template_10up) have NO picture-above-text overlap whatsoever,
 * so they stay at zero notes for any positive threshold — it's the z-order
 * rule, not the magnitude, that spares bcim_double_cut's full-card background
 * JPEG (which sits BELOW its text). The threshold's real job is sensitivity on
 * ecl_workbook: 0.20 flags 21 body frames — including the page-37 case, a
 * 7.25×8.0in body frame whose lower screenshot covers ~34% of it — while
 * ignoring incidental clips of small callouts. Loosening to 0.15 adds 5
 * marginal frames; tightening to 0.30 drops to 9 and misses genuinely-covered
 * copy. 0.20 is the plan's stated "≥ 20% of the text frame's area" bar and it
 * lands cleanly, so no deviation was needed.
 */
const WRAP_OVERLAP_MIN = 0.2;

/**
 * Page-number-placeholder band (ecl_workbook corpus). The trace carries
 * Publisher's page-number FIELD as literal `insertText (#)` — zero insertField
 * callbacks in 43MB — so footers import reading "Page | #". We treat a '#' in
 * a text frame as that placeholder ONLY when the frame's vertical center sits
 * in the top or bottom band of its page, where headers/footers live. Scoping
 * to the band is what keeps body-copy '#' from false-triggering: e.g.
 * production_checkpoint_labels has one body frame ("…5mil: #…") at mid-page
 * (center ≈ 4.5in of 11in) that must NOT be flagged. 0.15 (top/bottom 15%)
 * clears it with margin while catching every ecl_workbook footer (center
 * ≈ 10.75in of 11in).
 */
const PAGE_NUMBER_BAND = 0.15;

/** Fraction of frame `a`'s area covered by its intersection with frame `b`. */
function coverFraction(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const area = a.w * a.h;
  return area > 0 ? (ix * iy) / area : 0;
}

/* ── Pages ── */

function mapPage(
  ir: IRPage,
  pageIndex: number,
  ctx: {
    fidelity: MapResult["fidelity"];
    notes: ImportNote[];
    fontCtx: FontCtx;
    assets: AssetRegistry;
    /** Header/footer frames carrying Publisher's '#' page-number placeholder —
        collected across all pages, reported as ONE aggregate note by the
        caller (this file has dozens of identical footers). */
    pageNumberFrames: { objectId: string; pageId: string }[];
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

    // Bitmap fills (P3) — the corpus's dominant image path: setStyle applies an
    // embedded image to the following shape. On an axis-aligned rectangle it
    // becomes a stretched picture frame; on other geometry (or a textbox) we
    // keep the shape and drop the fill, since image-clipping is backlog.
    const fillImage = shape.style.fillImage;
    if (fillImage) {
      const { bytes, mime, renderable } = inspectImage(fillImage.dataB64, fillImage.mime);
      const rectangular = fillImageIsRectangular(shape);
      if (rectangular) {
        if (renderable) {
          const assetId = registerImage(ctx.assets, fillImage.dataB64, bytes, mime);
          if (fillImage.repeat && fillImage.repeat !== "stretch") {
            flag(`bitmap fill repeat mode "${fillImage.repeat}" isn't supported — image stretched to fill instead`);
          }
          objects.push({ ...base, type: "picture", fill: null, assetId, fit: "stretch" });
        } else {
          flag(
            `embedded ${formatName(mime)} vector image can't be displayed — placeholder frame (rasterization is backlog)`,
          );
          objects.push({ ...base, type: "picture", fill: null });
        }
        if (degradations.length) {
          ctx.fidelity.degraded++;
          for (const m of degradations) note(id, 2, m);
        } else {
          ctx.fidelity.converted++;
        }
        return;
      }
      // Non-rectangular geometry (or a textbox): keep it, drop the fill. Fall
      // through to the normal switch with the fill forced null (no corpus
      // bitmap carries a draw:fill-color, but a stray preview color would
      // contradict the "shown unfilled" note) — and add the honest note.
      base.fill = null;
      flag(
        renderable
          ? "bitmap fill on a non-rectangular shape dropped — shown unfilled (image-clip is backlog)"
          : `embedded ${formatName(mime)} vector image can't be displayed — shown unfilled (rasterization is backlog)`,
      );
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
        if (shape.dataB64) {
          const { bytes, mime, renderable } = inspectImage(shape.dataB64, shape.mime);
          if (renderable) {
            // Extracted (P3): real bytes, browser-renderable → a stretched
            // picture frame referencing the deduped asset. Converts clean.
            const assetId = registerImage(ctx.assets, shape.dataB64, bytes, mime);
            objects.push({ ...base, type: "picture", fill: base.fill ?? null, assetId, fit: "stretch" });
            break;
          }
          // Real bytes, but a format no <img> renders (WMF/EMF/TIFF) — no asset.
          flag(
            `embedded ${formatName(mime)} vector image can't be displayed — placeholder frame (rasterization is backlog)`,
          );
          objects.push({ ...base, type: "picture", fill: base.fill ?? null });
          break;
        }
        // No payload on the callback — a placeholder is the honest best.
        flag(
          `embedded image${shape.mime ? ` (${shape.mime})` : ""} shown as a placeholder frame — no extractable bytes`,
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

  // Post-layout passes over the finished object list (plan §10.4): two honest-
  // reporting gaps this slice can't fix at the data level, announced instead of
  // left for the associate to discover by scrolling.
  for (let i = 0; i < objects.length; i++) {
    const t = objects[i];
    if (t.type !== "text" || !t.text) continue;
    const plain = textContent(t.text);
    if (!plain.trim()) continue; // empty frame — nothing to hide, nothing to number

    // (1) Wrap-overlap: a picture drawn ABOVE this text (later in the array)
    // that covers enough of it will paint over the copy. ONE note per text
    // frame, however many pictures pile on top.
    for (let j = i + 1; j < objects.length; j++) {
      const p = objects[j];
      if (p.type === "picture" && coverFraction(t, p) >= WRAP_OVERLAP_MIN) {
        note(
          t.id,
          2,
          "Text may be hidden behind an image here — Publisher wraps text around pictures; text wrap isn't imported yet.",
        );
        break;
      }
    }

    // (2) Page-number placeholder: a '#' in a header/footer band is Publisher's
    // page-number field imported as literal text. Collected here; the caller
    // emits a single aggregate note for the whole document.
    if (plain.includes("#")) {
      const cy = t.y + t.h / 2;
      if (cy <= PAGE_NUMBER_BAND * ir.hIn || cy >= (1 - PAGE_NUMBER_BAND) * ir.hIn) {
        ctx.pageNumberFrames.push({ objectId: t.id, pageId });
      }
    }
  }

  return { id: pageId, masterId: null, objects };
}

/** Map a parsed intermediate document to the editor's document model. */
export function mapToLayoutDocument(ir: IRDoc, name: string): MapResult {
  const fidelity = { converted: 0, degraded: 0, flagged: 0 };
  const notes: ImportNote[] = [];
  const fontCtx: FontCtx = { fonts: new Map(), sawDingbats: false, sawUnmappedDingbats: false };
  const assets: AssetRegistry = { assets: {}, blobs: {}, count: 0 };
  const pageNumberFrames: { objectId: string; pageId: string }[] = [];
  const ctx = { fidelity, notes, fontCtx, assets, pageNumberFrames };

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
  if (ctx.pageNumberFrames.length) {
    // Publisher's page-number field imported as a literal '#' (the trace has no
    // insertField callbacks). One aggregate note anchored to the first such
    // frame — dozens of identical footers would drown the report otherwise.
    const [{ objectId, pageId }] = ctx.pageNumberFrames;
    notes.push({
      tier: 2,
      objectId,
      pageId,
      message: `Page numbers aren't imported — ${ctx.pageNumberFrames.length} footer/header frames show Publisher's '#' placeholder where the page number would print.`,
    });
  }
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
    assets: assets.assets,
    guides: { v: [], h: [] },
  };

  return { doc, fidelity, fonts: [...fontCtx.fonts.values()], notes, blobs: assets.blobs };
}
