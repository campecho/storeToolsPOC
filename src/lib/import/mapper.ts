import type { LayoutDocument, LayoutObject, LayoutPage, TextProps } from "@/schema";
import { FONT_FAMILIES, DEFAULT_FAMILY } from "@/lib/layout/text";
import type { IRDoc, IRPage, IRParagraph, IRSpan, IRStyle } from "./model";
import type { FontRemap, ImportNote } from "./report";

/**
 * Intermediate model → `LayoutDocument` mapper (plan §10.3) — P1 scope:
 * geometry-first with honest tiering. Every frame lands correctly sized and
 * placed; polygons/paths degrade to bounding boxes, images to placeholder
 * picture frames, tables to flagged placeholders — each with a report note.
 * Text content maps into the v1 per-frame model where that is faithful
 * (single-style frames); multi-run styling flattens with a note until the
 * schema-v2 run model lands (P2). Nothing is dropped silently.
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

const KNOWN_FAMILIES = new Set(FONT_FAMILIES.map((f) => f.name));

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

/** Dominant value in a list (first-seen wins ties) — for flattening runs. */
function dominant<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

type TextMapping = { text: TextProps; distinctSpanStyles: number; distinctAligns: number };

function mapText(paragraphs: IRParagraph[], fonts: Map<string, FontRemap>): TextMapping {
  // Whitespace-only spans (insertSpace/insertLineBreak markers, Publisher's
  // empty trailing spans) don't count toward styling — corpus files carry
  // many and they'd inflate the flatten detection.
  const spans: IRSpan[] = paragraphs.flatMap((p) => p.spans).filter((s) => s.text.trim() !== "");
  const styleKey = (s: IRSpan) =>
    JSON.stringify([s.fontName, s.sizePt, !!s.bold, !!s.italic, !!s.underline, s.color]);
  const distinctSpanStyles = new Set(spans.map(styleKey)).size;
  const aligns = paragraphs.map((p) => p.align ?? "left");
  const distinctAligns = new Set(aligns).size;

  const sourceFamily = dominant(spans.map((s) => s.fontName).filter((f): f is string => !!f));
  let family = DEFAULT_FAMILY;
  if (sourceFamily) {
    if (KNOWN_FAMILIES.has(sourceFamily)) {
      family = sourceFamily;
      if (!fonts.has(sourceFamily)) {
        fonts.set(sourceFamily, {
          source: sourceFamily,
          mappedTo: sourceFamily,
          reason: "in the editor's font list",
        });
      }
    } else {
      if (!fonts.has(sourceFamily)) {
        fonts.set(sourceFamily, {
          source: sourceFamily,
          mappedTo: DEFAULT_FAMILY,
          reason: "not in the POC font list — the remap library lands in P2 (plan §10.5)",
        });
      }
    }
  }

  // Publisher ends each paragraph with a terminator (\r, normalized to \n by
  // the model) — redundant with the paragraph structure, so strip trailing
  // newlines per paragraph; mid-paragraph breaks stay.
  const content = paragraphs
    .map((p) => p.spans.map((s) => s.text).join("").replace(/\n+$/, ""))
    .join("\n");

  const text: TextProps = {
    content,
    font: {
      family,
      size: round(dominant(spans.map((s) => s.sizePt).filter((n): n is number => n !== undefined)) ?? 11, 1),
      bold: dominant(spans.map((s) => !!s.bold)) ?? false,
      italic: dominant(spans.map((s) => !!s.italic)) ?? false,
      underline: dominant(spans.map((s) => !!s.underline)) ?? false,
    },
    align: dominant(aligns) ?? "left",
    lineSpacing: round(
      dominant(paragraphs.map((p) => p.lineSpacing).filter((n): n is number => n !== undefined)) ??
        PUBLISHER_DEFAULT_LINE_SPACING,
      3
    ),
  };
  return { text, distinctSpanStyles, distinctAligns };
}

/** Map one page's shapes; ids are deterministic (`imp-p1-o3`) for testability. */
/** Publisher's universal text-box default — 0.04 in on all sides. */
function isDefaultInsets(p: { l: number; r: number; t: number; b: number }): boolean {
  return [p.l, p.r, p.t, p.b].every((v) => Math.abs(v - 0.04) < 0.001);
}

function mapPage(
  ir: IRPage,
  pageIndex: number,
  ctx: {
    fidelity: MapResult["fidelity"];
    notes: ImportNote[];
    fonts: Map<string, FontRemap>;
    sawDefaultInsets: boolean;
  }
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
      case "polyline":
      case "path": {
        const label = shape.kind === "path" ? "freeform path" : shape.kind;
        flag(`${label} (${shape.pointCount} points) converted to its bounding box — faithful paths arrive in P2`);
        objects.push({ ...base, type: "rect" });
        break;
      }
      case "image": {
        flag(
          `embedded image${shape.mime ? ` (${shape.mime})` : ""} shown as a placeholder frame — extraction arrives in P3`
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
        const { text, distinctSpanStyles, distinctAligns } = mapText(shape.paragraphs, ctx.fonts);
        if (distinctSpanStyles > 1)
          flag(`${distinctSpanStyles} character styles flattened to one — per-run styling arrives in P2`);
        if (distinctAligns > 1) flag("mixed paragraph alignment flattened to the dominant alignment");
        if (shape.style.textVAlign && shape.style.textVAlign !== "top")
          flag(`vertical alignment '${shape.style.textVAlign}' rendered as top-aligned`);
        // Every Publisher text frame carries the 0.04 in default insets —
        // per-frame notes for a universal default would drown the report
        // (corpus finding: 100% of real frames flagged). Default insets get
        // one document-level note; only non-default insets flag the frame.
        if (shape.style.paddingIn && Object.values(shape.style.paddingIn).some((v) => v > 0)) {
          if (isDefaultInsets(shape.style.paddingIn)) ctx.sawDefaultInsets = true;
          else flag("non-default text-box insets dropped — text starts at the frame edge (schema v2)");
        }
        if (shape.paragraphs.some((p) => p.hasIndent))
          flag("paragraph indents dropped — per-paragraph layout arrives in P2");
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
  const fonts = new Map<string, FontRemap>();
  const ctx = { fidelity, notes, fonts, sawDefaultInsets: false };

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

  if (ctx.sawDefaultInsets)
    notes.push({
      tier: 2,
      message:
        "Publisher's default text-box insets (0.04 in) aren't modeled yet — text sits at the frame edge (schema v2 adds insets)",
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
    version: 1,
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

  return { doc, fidelity, fonts: [...fonts.values()], notes };
}
