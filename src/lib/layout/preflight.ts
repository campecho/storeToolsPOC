import type { LayoutDocument, LayoutObject } from "@/lib/schema";
import { FONT_FAMILIES } from "./font-catalog";
import { effectivePageSize } from "./geometry";
import { textContent } from "./text";

/**
 * Preflight rule engine (redesign plan Phase 6 — figma "Preflight" panel).
 * Pure and framework-free: every rule reads the document alone, except text
 * overflow, whose DOM-measured ids are injected by the caller (the headless
 * PreflightCheck component runs collectOversetIds and passes them in).
 * Objects on hidden or non-print layers are out of scope — they don't print.
 */

export type PreflightSeverity = "error" | "warning";
export type PreflightRule =
  | "missing-font"
  | "low-res-image"
  | "text-overflow"
  | "safe-zone"
  | "bleed-short"
  | "hairline";

export type PreflightIssue = {
  /** Stable per rule+target — the panel keys and dedupes on it. */
  id: string;
  rule: PreflightRule;
  severity: PreflightSeverity;
  title: string;
  detail: string;
  location: string;
  pageId?: string;
  objectId?: string;
};

/** Print-shop thresholds (docs/UI_LAYOUT_REDESIGN_PLAN.md §2: the figma cards
    name 300 DPI and a 0.25 in safe zone; the POC tiers them so common store
    photos warn before they block). */
export const MIN_DPI_ERROR = 150;
export const MIN_DPI_WARN = 300;
export const SAFE_ZONE_IN = 0.125;
/** 0.5 pt at 96 dpi — thinner strokes may drop out on offset stock. */
export const HAIRLINE_MIN_PX = 0.67;

function objectLabel(o: LayoutObject, doc: LayoutDocument): string {
  if (o.type === "text" && o.text) {
    const t = textContent(o.text).trim();
    if (t) return t.length > 24 ? `${t.slice(0, 24)}…` : t;
    return "Text frame";
  }
  if (o.type === "picture") return (o.assetId && doc.assets[o.assetId]?.name) || "Picture frame";
  if (o.type === "line") return o.headStart || o.headEnd ? "Arrow" : "Line";
  const labels: Partial<Record<LayoutObject["type"], string>> = {
    rect: "Rectangle",
    roundedRect: "Rounded rectangle",
    ellipse: "Ellipse",
    starPolygon: "Star",
    callout: "Callout",
    banner: "Banner",
  };
  return labels[o.type] ?? "Path";
}

type Target = { o: LayoutObject; pageId: string; pageNo: number; pageW: number; pageH: number };

/** Every printable object with its page context — hidden/non-print layers skipped. */
function printableObjects(doc: LayoutDocument): Target[] {
  const printable = new Set(
    doc.layers.filter((l) => l.visible && !l.nonPrint).map((l) => l.id),
  );
  const out: Target[] = [];
  doc.pages.forEach((page, i) => {
    const size = effectivePageSize(doc, page);
    for (const layer of page.layers) {
      if (!printable.has(layer.layerId)) continue;
      for (const o of layer.objects) {
        out.push({ o, pageId: page.id, pageNo: i + 1, pageW: size.w, pageH: size.h });
      }
    }
  });
  return out;
}

function frameBox(o: LayoutObject): { x: number; y: number; w: number; h: number } {
  if (o.type === "line") {
    return {
      x: Math.min(o.x1, o.x2),
      y: Math.min(o.y1, o.y2),
      w: Math.abs(o.x2 - o.x1),
      h: Math.abs(o.y2 - o.y1),
    };
  }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

export function runPreflight(
  doc: LayoutDocument,
  opts: { oversetIds?: readonly string[] } = {},
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const targets = printableObjects(doc);
  const loc = (t: Target) => `Page ${t.pageNo} · ${objectLabel(t.o, doc)}`;

  // Missing fonts — families the catalog can't stand in for render as
  // fallbacks, so the print won't match the screen. One issue per family.
  const known = new Set(FONT_FAMILIES.map((f) => f.name));
  const flagged = new Set<string>();
  for (const t of targets) {
    if (t.o.type !== "text" || !t.o.text) continue;
    for (const p of t.o.text.paragraphs) {
      for (const r of p.runs) {
        if (known.has(r.font.family) || flagged.has(r.font.family)) continue;
        flagged.add(r.font.family);
        issues.push({
          id: `missing-font:${r.font.family}`,
          rule: "missing-font",
          severity: "error",
          title: `Missing Font: ${r.font.family}`,
          detail:
            "This font is not installed or available locally. Text may render with fallback styles.",
          location: loc(t),
          pageId: t.pageId,
          objectId: t.o.id,
        });
      }
    }
  }

  for (const t of targets) {
    const { o } = t;

    // Low-resolution image — effective DPI at the placed size.
    if (o.type === "picture" && o.assetId) {
      const asset = doc.assets[o.assetId];
      if (asset?.width && asset?.height && o.w > 0 && o.h > 0) {
        const dpi = Math.round(Math.min(asset.width / o.w, asset.height / o.h));
        if (dpi < MIN_DPI_WARN) {
          const isError = dpi < MIN_DPI_ERROR;
          issues.push({
            id: `low-res-image:${o.id}`,
            rule: "low-res-image",
            severity: isError ? "error" : "warning",
            title: "Low-Resolution Image",
            detail: `${asset.name} is ${dpi} DPI at its placed size. ${MIN_DPI_WARN} DPI is required for high-quality production print.`,
            location: loc(t),
            pageId: t.pageId,
            objectId: o.id,
          });
        }
      }
    }

    // Hairline rule — below the minimum reproducible stroke.
    const stroke = o.stroke;
    if (stroke && stroke.width > 0 && stroke.width < HAIRLINE_MIN_PX) {
      issues.push({
        id: `hairline:${o.id}`,
        rule: "hairline",
        severity: "warning",
        title: "Hairline Rule Below Minimum",
        detail: `Line weight is ${stroke.width.toFixed(2)} px. The minimum reproducible thickness is 0.5 pt (${HAIRLINE_MIN_PX} px) for offset stock.`,
        location: loc(t),
        pageId: t.pageId,
        objectId: o.id,
      });
    }

    // Trim geometry — objects near the trim warn; objects crossing the trim
    // without reaching the full bleed extent warn (thin white edges).
    const b = frameBox(o);
    const crosses =
      b.x < 0 || b.y < 0 || b.x + b.w > t.pageW || b.y + b.h > t.pageH;
    if (crosses) {
      if (doc.bleed > 0) {
        const short =
          (b.x < 0 && b.x > -doc.bleed) ||
          (b.y < 0 && b.y > -doc.bleed) ||
          (b.x + b.w > t.pageW && b.x + b.w < t.pageW + doc.bleed) ||
          (b.y + b.h > t.pageH && b.y + b.h < t.pageH + doc.bleed);
        if (short) {
          issues.push({
            id: `bleed-short:${o.id}`,
            rule: "bleed-short",
            severity: "warning",
            title: "Bleed Not Extended",
            detail: `The object crosses the trim edge but stops short of the ${doc.bleed} in bleed boundary. Thin white edges may show after trimming.`,
            location: loc(t),
            pageId: t.pageId,
            objectId: o.id,
          });
        }
      }
    } else if (b.w > 0 || b.h > 0) {
      const gap = Math.min(b.x, b.y, t.pageW - (b.x + b.w), t.pageH - (b.y + b.h));
      if (gap < SAFE_ZONE_IN) {
        issues.push({
          id: `safe-zone:${o.id}`,
          rule: "safe-zone",
          severity: "warning",
          title: "Object Too Close to Trim",
          detail: `The object sits ${gap.toFixed(2)} in from the trim edge. The safe zone requires at least ${SAFE_ZONE_IN} in, or a full bleed past the edge.`,
          location: loc(t),
          pageId: t.pageId,
          objectId: o.id,
        });
      }
    }
  }

  // Text overflow — DOM-measured ids injected by the caller.
  const overset = new Set(opts.oversetIds ?? []);
  for (const t of targets) {
    if (!overset.has(t.o.id)) continue;
    issues.push({
      id: `text-overflow:${t.o.id}`,
      rule: "text-overflow",
      severity: "warning",
      title: "Text Overflow",
      detail:
        "Text extends beyond the visual boundaries of its container box. Copy will be clipped in output.",
      location: loc(t),
      pageId: t.pageId,
      objectId: t.o.id,
    });
  }

  // errors first, then warnings, stable within severity
  return issues.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1,
  );
}
