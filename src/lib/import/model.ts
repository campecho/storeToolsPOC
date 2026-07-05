import type { PropMap, PropValue, TraceEvent } from "./trace-parser";
import { toInches, toMultiplier, toNumber, toPoints } from "./trace-parser";

/**
 * Intermediate layout model (plan §10.2) — the research doc's parse-side hub,
 * built from the pub2raw callback stream. Deliberately closer to librevenge's
 * vocabulary than to `LayoutDocument`: the mapper (mapper.ts) owns every
 * lossy decision, so parse and generate stay independently testable.
 * All geometry is inches, origin top-left, y down (librevenge convention —
 * same axes as the editor's canonical model).
 */

export type IRStyle = {
  fill: string | null; // hex color; null = none (gradients degrade in mapper)
  fillKind?: string; // raw draw:fill value when not solid/none (gradient…)
  stroke: { color: string; widthIn: number } | null;
  /** draw:textarea-vertical-align — non-"top" degrades with a note. */
  textVAlign?: string;
  /** fo:padding-* — text insets the v1 schema can't hold; noted by mapper. */
  paddingIn?: { l: number; r: number; t: number; b: number };
};

export type IRSpan = {
  text: string;
  fontName?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
};

export type IRParagraph = {
  align?: "left" | "center" | "right" | "justify";
  /** fo:line-height as a multiplier (1.19 = Publisher single spacing). */
  lineSpacing?: number;
  spans: IRSpan[];
};

export type IRBBox = { x: number; y: number; w: number; h: number };

type IRShapeBase = {
  bbox: IRBBox;
  /** librevenge:rotate — degrees, counterclockwise-positive. */
  rotationDeg?: number;
  style: IRStyle;
};

export type IRShape =
  | (IRShapeBase & { kind: "rect"; rxIn?: number })
  | (IRShapeBase & { kind: "ellipse" })
  | (IRShapeBase & { kind: "line"; x1: number; y1: number; x2: number; y2: number })
  | (IRShapeBase & { kind: "polygon" | "polyline" | "path"; pointCount: number })
  | (IRShapeBase & { kind: "image"; mime?: string })
  | (IRShapeBase & { kind: "table" })
  | (IRShapeBase & { kind: "textbox"; paragraphs: IRParagraph[] });

export type IRPage = { wIn: number; hIn: number; shapes: IRShape[] };

export type IRDoc = {
  pages: IRPage[];
  /** Source structure the flat model dropped — mapper reports these once. */
  sawLayers: boolean;
  sawGroups: boolean;
};

const DEFAULT_STYLE: IRStyle = { fill: null, stroke: null };

function readStyle(props: PropMap): IRStyle {
  const style: IRStyle = { fill: null, stroke: null };
  const fill = props["draw:fill"];
  if (fill === "solid") {
    const c = props["draw:fill-color"];
    style.fill = typeof c === "string" ? c : null;
  } else if (typeof fill === "string" && fill !== "none") {
    style.fillKind = fill; // gradient / bitmap / pattern — mapper degrades
    const c = props["draw:fill-color"];
    style.fill = typeof c === "string" ? c : null;
  }
  if (props["draw:stroke"] && props["draw:stroke"] !== "none") {
    const color = typeof props["svg:stroke-color"] === "string" ? (props["svg:stroke-color"] as string) : "#000000";
    style.stroke = { color, widthIn: toInches(props["svg:stroke-width"]) ?? 1 / 96 };
  }
  const vAlign = props["draw:textarea-vertical-align"];
  if (typeof vAlign === "string") style.textVAlign = vAlign;
  const pl = toInches(props["fo:padding-left"]);
  const pr = toInches(props["fo:padding-right"]);
  const pt = toInches(props["fo:padding-top"]);
  const pb = toInches(props["fo:padding-bottom"]);
  if (pl !== undefined || pr !== undefined || pt !== undefined || pb !== undefined) {
    style.paddingIn = { l: pl ?? 0, r: pr ?? 0, t: pt ?? 0, b: pb ?? 0 };
  }
  return style;
}

function readBBox(props: PropMap): IRBBox | undefined {
  const x = toInches(props["svg:x"]);
  const y = toInches(props["svg:y"]);
  const w = toInches(props["svg:width"]);
  const h = toInches(props["svg:height"]);
  if (x === undefined || y === undefined || w === undefined || h === undefined) return undefined;
  return { x, y, w, h };
}

/** Points/segments vector → the coordinates it mentions (incl. bezier x1/x2 control points). */
function vectorCoords(v: PropValue | undefined): { xs: number[]; ys: number[]; count: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  let count = 0;
  if (!Array.isArray(v)) return { xs, ys, count };
  for (const g of v) {
    count++;
    for (const key of ["svg:x", "svg:x1", "svg:x2"]) {
      const n = toInches(g[key]);
      if (n !== undefined) xs.push(n);
    }
    for (const key of ["svg:y", "svg:y1", "svg:y2"]) {
      const n = toInches(g[key]);
      if (n !== undefined) ys.push(n);
    }
  }
  return { xs, ys, count };
}

function bboxOf(xs: number[], ys: number[]): IRBBox | undefined {
  if (!xs.length || !ys.length) return undefined;
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function readAlign(v: PropValue | undefined): IRParagraph["align"] {
  switch (v) {
    case "left":
    case "start":
      return "left";
    case "center":
      return "center";
    case "right":
    case "end":
      return "right";
    case "justify":
      return "justify";
    default:
      return undefined;
  }
}

function readSpanStyle(props: PropMap): Omit<IRSpan, "text"> {
  const s: Omit<IRSpan, "text"> = {};
  if (typeof props["style:font-name"] === "string") s.fontName = props["style:font-name"] as string;
  const size = toPoints(props["fo:font-size"]);
  if (size !== undefined) s.sizePt = size;
  const weight = props["fo:font-weight"];
  if (typeof weight === "string") s.bold = weight === "bold" || (toNumber(weight) ?? 0) >= 600;
  const fstyle = props["fo:font-style"];
  if (typeof fstyle === "string") s.italic = fstyle === "italic" || fstyle === "oblique";
  const underline = props["style:text-underline-type"];
  if (typeof underline === "string") s.underline = underline !== "none";
  if (typeof props["fo:color"] === "string") s.color = props["fo:color"] as string;
  return s;
}

/**
 * Fold the callback stream into the intermediate model.
 * Stateful exactly where librevenge is stateful: `setStyle` applies to every
 * subsequent draw call until the next `setStyle`.
 */
export function buildModel(events: TraceEvent[]): IRDoc {
  const doc: IRDoc = { pages: [], sawLayers: false, sawGroups: false };
  let page: IRPage | null = null;
  let style: IRStyle = DEFAULT_STYLE;
  // open text object state
  let textbox: (IRShape & { kind: "textbox" }) | null = null;
  let paragraph: IRParagraph | null = null;
  let spanStyle: Omit<IRSpan, "text"> = {};
  let inSpan = false;
  // table capture: flag-only (tier 3) — bbox recorded, contents skipped
  let tableDepth = 0;

  const push = (shape: IRShape) => {
    if (page) page.shapes.push(shape);
  };

  for (const ev of events) {
    if ("text" in ev) {
      // insertText — the one payload-carrying callback
      if (paragraph && !tableDepth) {
        paragraph.spans.push({ ...(inSpan ? spanStyle : {}), text: ev.text });
      }
      continue;
    }
    const props = ev.props;
    switch (ev.name) {
      case "startPage": {
        page = {
          wIn: toInches(props["svg:width"]) ?? 8.5,
          hIn: toInches(props["svg:height"]) ?? 11,
          shapes: [],
        };
        doc.pages.push(page);
        break;
      }
      case "endPage":
        page = null;
        break;
      case "startLayer":
        doc.sawLayers = true;
        break;
      case "openGroup":
        doc.sawGroups = true;
        break;
      case "setStyle":
        style = readStyle(props);
        break;
      case "drawRectangle": {
        const bbox = readBBox(props);
        if (!bbox) break;
        push({
          kind: "rect",
          bbox,
          style,
          rotationDeg: toNumber(props["librevenge:rotate"]),
          rxIn: toInches(props["svg:rx"]),
        });
        break;
      }
      case "drawEllipse": {
        // librevenge convention: center + radii; tolerate bbox form too
        const cx = toInches(props["svg:cx"]);
        const cy = toInches(props["svg:cy"]);
        const rx = toInches(props["svg:rx"]);
        const ry = toInches(props["svg:ry"]);
        const bbox =
          cx !== undefined && cy !== undefined && rx !== undefined && ry !== undefined
            ? { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 }
            : readBBox(props);
        if (!bbox) break;
        push({ kind: "ellipse", bbox, style, rotationDeg: toNumber(props["librevenge:rotate"]) });
        break;
      }
      case "drawPolyline":
      case "drawPolygon": {
        const { xs, ys, count } = vectorCoords(props["svg:points"]);
        const bbox = bboxOf(xs, ys);
        if (!bbox) break;
        if (ev.name === "drawPolyline" && count === 2) {
          push({ kind: "line", bbox, style, x1: xs[0], y1: ys[0], x2: xs[1], y2: ys[1] });
        } else {
          push({
            kind: ev.name === "drawPolygon" ? "polygon" : "polyline",
            bbox,
            style,
            pointCount: count,
            rotationDeg: toNumber(props["librevenge:rotate"]),
          });
        }
        break;
      }
      case "drawPath": {
        const { xs, ys, count } = vectorCoords(props["svg:d"]);
        const bbox = bboxOf(xs, ys);
        if (!bbox) break;
        push({ kind: "path", bbox, style, pointCount: count, rotationDeg: toNumber(props["librevenge:rotate"]) });
        break;
      }
      case "drawGraphicObject": {
        const bbox = readBBox(props);
        if (!bbox) break;
        push({
          kind: "image",
          bbox,
          style,
          mime: typeof props["librevenge:mime-type"] === "string" ? (props["librevenge:mime-type"] as string) : undefined,
          rotationDeg: toNumber(props["librevenge:rotate"]),
        });
        break;
      }
      case "startTableObject": {
        tableDepth++;
        const bbox = readBBox(props);
        if (bbox) push({ kind: "table", bbox, style });
        break;
      }
      case "endTableObject":
        tableDepth = Math.max(0, tableDepth - 1);
        break;
      case "startTextObject": {
        if (tableDepth) break; // cell text rides the table flag, not a frame
        const bbox = readBBox(props);
        if (!bbox) break;
        textbox = {
          kind: "textbox",
          bbox,
          style,
          rotationDeg: toNumber(props["librevenge:rotate"]),
          paragraphs: [],
        };
        break;
      }
      case "endTextObject":
        if (textbox) push(textbox);
        textbox = null;
        paragraph = null;
        break;
      case "openParagraph": {
        if (!textbox) break;
        paragraph = {
          align: readAlign(props["fo:text-align"]),
          lineSpacing: toMultiplier(props["fo:line-height"]),
          spans: [],
        };
        textbox.paragraphs.push(paragraph);
        break;
      }
      case "closeParagraph":
        paragraph = null;
        break;
      case "openSpan":
        spanStyle = readSpanStyle(props);
        inSpan = true;
        break;
      case "closeSpan":
        inSpan = false;
        spanStyle = {};
        break;
      case "insertLineBreak":
      case "insertTab":
        if (paragraph) paragraph.spans.push({ ...spanStyle, text: ev.name === "insertTab" ? "\t" : "\n" });
        break;
      default:
        // startDocument/endDocument/metadata/embedded fonts/… — structural
        // or out-of-scope callbacks; ignored without error by design.
        break;
    }
  }
  return doc;
}
