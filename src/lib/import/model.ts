import { arcToCubics } from "./arc";
import type { PropMap, PropValue, TraceEvent } from "./trace-parser";
import { toInches, toMultiplier, toNumber, toPoints } from "./trace-parser";
import { flattenFillColor } from "./gradient";

/**
 * Intermediate layout model (plan §10.2) — the research doc's parse-side hub,
 * built from the pub2raw callback stream. Deliberately closer to librevenge's
 * vocabulary than to `LayoutDocument`: the mapper (mapper.ts) owns every
 * lossy decision, so parse and generate stay independently testable.
 * All geometry is inches, origin top-left, y down (librevenge convention —
 * same axes as the editor's canonical model).
 */

export type IRStyle = {
  /** hex color; null = none. Gradients carry their flattened color here
      (gradient.ts) alongside fillKind — the mapper notes the degradation. */
  fill: string | null;
  fillKind?: string; // raw draw:fill value when not solid/none (gradient…)
  /** draw:fill: bitmap WITH an embedded payload — the corpus's dominant image
      path. Carries the base64, its declared mime, and style:repeat. When a
      bitmap fill has no payload it degrades via fillKind instead (mapper). */
  fillImage?: { dataB64: string; mime?: string; repeat?: string };
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
  /** fo:margin-left, inches — the paragraph's left indent (schema v2). */
  marginLeftIn?: number;
  /** fo:text-indent, inches — extra first-line indent, negative = hanging. */
  textIndentIn?: number;
  spans: IRSpan[];
};

export type IRBBox = { x: number; y: number; w: number; h: number };

/** Path segments in ABSOLUTE page inches (mapper normalizes into the bbox).
    Arcs (A) are lowered to cubics at this boundary (arc.ts) — downstream only
    ever sees M/L/C/Q/Z. "?" marks a genuinely unknown verb — mapper degrades
    the shape to its bbox. */
export type IRPathSeg =
  | { a: "M" | "L"; x: number; y: number }
  | { a: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { a: "Q"; x1: number; y1: number; x: number; y: number }
  | { a: "Z" }
  | { a: "?"; raw: string };

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
  | (IRShapeBase & { kind: "polygon" | "polyline"; pointsIn: { x: number; y: number }[] })
  | (IRShapeBase & { kind: "path"; segs: IRPathSeg[] })
  | (IRShapeBase & { kind: "image"; mime?: string; dataB64?: string })
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
    const c = props["draw:fill-color"];
    // libmspub puts a gradient's colors on svg:linearGradient stop vectors,
    // NOT draw:fill-color (corpus: New_Rack_Card's full-page background) —
    // without the fallback the fill imports null while the mapper's note
    // still claims it was flattened.
    style.fill = typeof c === "string" ? c : flattenFillColor(props);
    const image = fill === "bitmap" ? props["draw:fill-image"] : undefined;
    if (typeof image === "string") {
      // draw:fill: bitmap with a payload — the mapper extracts it to an asset
      // (the corpus applies this to the NEXT rectangle/rect-polygon shape).
      const mime = props["librevenge:mime-type"];
      const repeat = props["style:repeat"];
      style.fillImage = {
        dataB64: image,
        ...(typeof mime === "string" ? { mime } : {}),
        ...(typeof repeat === "string" ? { repeat } : {}),
      };
    } else {
      style.fillKind = fill; // gradient / pattern / payload-less bitmap — mapper degrades
    }
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

/** svg:points vector → absolute-inch points (order preserved). */
function vectorPoints(v: PropValue | undefined): { x: number; y: number }[] {
  if (!Array.isArray(v)) return [];
  const points: { x: number; y: number }[] = [];
  for (const g of v) {
    const x = toInches(g["svg:x"]);
    const y = toInches(g["svg:y"]);
    if (x !== undefined && y !== undefined) points.push({ x, y });
  }
  return points;
}

/** Arc flag property → boolean. librevenge prints bools as "true"/"false"
    (tolerate "1"/"0"); ABSENT defaults TRUE — ground-truthed against
    pub2xhtml, which renders the corpus's flagless trace arcs as
    `A… 1,1 …` (large-arc=1, sweep=1) in its SVG output. */
function toFlag(v: PropValue | undefined): boolean {
  if (typeof v !== "string") return true;
  return v !== "false" && v !== "0";
}

/** svg:d vector → typed segments (absolute inches); arcs lowered to cubics
    (arc.ts), genuinely unknown verbs marked "?". */
function vectorSegs(v: PropValue | undefined): { segs: IRPathSeg[]; hadArc: boolean } {
  const segs: IRPathSeg[] = [];
  let hadArc = false;
  if (!Array.isArray(v)) return { segs, hadArc };
  let cur: { x: number; y: number } | null = null; // current point, for arcs
  for (const g of v) {
    const a = g["librevenge:path-action"];
    const x = toInches(g["svg:x"]);
    const y = toInches(g["svg:y"]);
    const x1 = toInches(g["svg:x1"]);
    const y1 = toInches(g["svg:y1"]);
    const x2 = toInches(g["svg:x2"]);
    const y2 = toInches(g["svg:y2"]);
    if (a === "Z") segs.push({ a: "Z" });
    else if ((a === "M" || a === "L") && x !== undefined && y !== undefined) {
      segs.push({ a, x, y });
      cur = { x, y };
    } else if (
      a === "C" &&
      [x, y, x1, y1, x2, y2].every((n) => n !== undefined)
    ) {
      segs.push({ a: "C", x1: x1!, y1: y1!, x2: x2!, y2: y2!, x: x!, y: y! });
      cur = { x: x!, y: y! };
    } else if (a === "Q" && [x, y, x1, y1].every((n) => n !== undefined)) {
      segs.push({ a: "Q", x1: x1!, y1: y1!, x: x!, y: y! });
      cur = { x: x!, y: y! };
    } else if (a === "A" && x !== undefined && y !== undefined) {
      hadArc = true;
      if (!cur) {
        // an arc with no current point is malformed SVG; keep its endpoint
        segs.push({ a: "M", x, y });
      } else {
        for (const c of arcToCubics(cur, {
          rx: toInches(g["svg:rx"]) ?? 0,
          ry: toInches(g["svg:ry"]) ?? 0,
          // degrees with librevenge's bogus `in` suffix, like the shape-level prop
          rotDeg: toNumber(g["librevenge:rotate"]) ?? 0,
          largeArc: toFlag(g["librevenge:large-arc"]),
          sweep: toFlag(g["librevenge:sweep"]),
          x,
          y,
        }))
          segs.push({ a: "C", ...c });
      }
      cur = { x, y };
    } else segs.push({ a: "?", raw: String(a) });
  }
  return { segs, hadArc };
}

/** Coordinate hull of converted segments (control points included — the same
    overestimating-hull convention vectorCoords uses on the raw props). */
function segCoords(segs: IRPathSeg[]): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of segs) {
    if (s.a === "Z" || s.a === "?") continue;
    xs.push(s.x);
    ys.push(s.y);
    if (s.a === "C" || s.a === "Q") {
      xs.push(s.x1);
      ys.push(s.y1);
    }
    if (s.a === "C") {
      xs.push(s.x2);
      ys.push(s.y2);
    }
  }
  return { xs, ys };
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
      // insertText — the one payload-carrying callback. Corpus finding:
      // Publisher's \r paragraph terminators leak into the text; normalize
      // to \n here (the mapper strips redundant trailing ones per paragraph).
      if (paragraph && !tableDepth) {
        paragraph.spans.push({ ...(inSpan ? spanStyle : {}), text: ev.text.replace(/\r\n?/g, "\n") });
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
        const points = vectorPoints(props["svg:points"]);
        const bbox = bboxOf(points.map((p) => p.x), points.map((p) => p.y));
        if (!bbox) break;
        if (ev.name === "drawPolyline" && points.length === 2) {
          push({ kind: "line", bbox, style, x1: points[0].x, y1: points[0].y, x2: points[1].x, y2: points[1].y });
        } else {
          push({
            kind: ev.name === "drawPolygon" ? "polygon" : "polyline",
            bbox,
            style,
            pointsIn: points,
            rotationDeg: toNumber(props["librevenge:rotate"]),
          });
        }
        break;
      }
      case "drawPath": {
        const { segs, hadArc } = vectorSegs(props["svg:d"]);
        // Arc paths: hull the CONVERTED segments (cubic control points and
        // all) — raw arc props only carry endpoints, and the corpus's
        // dominant case (a circle as two diametric 180° arcs sharing a y)
        // hulls those endpoints to a height-0 box. Non-arc paths keep the
        // raw-prop hull: identical coordinates, byte-identical bboxes
        // (corpus-pinned), and it tolerates "?" verbs that still carry x/y.
        const { xs, ys } = hadArc ? segCoords(segs) : vectorCoords(props["svg:d"]);
        const bbox = bboxOf(xs, ys);
        if (!bbox) break;
        push({
          kind: "path",
          bbox,
          style,
          segs,
          rotationDeg: toNumber(props["librevenge:rotate"]),
        });
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
          dataB64: typeof props["office:binary-data"] === "string" ? (props["office:binary-data"] as string) : undefined,
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
        // Corpus finding (3up_tabs.pub): real libmspub puts the text-frame
        // style — vertical alignment, insets, sometimes fill — on the
        // startTextObject callback itself, not on the preceding setStyle.
        // Merge: callback props win where present, setStyle fills the rest.
        const own = readStyle(props);
        const merged: IRStyle = {
          fill: "draw:fill" in props ? own.fill : style.fill,
          fillKind: "draw:fill" in props ? own.fillKind : style.fillKind,
          fillImage: "draw:fill" in props ? own.fillImage : style.fillImage,
          stroke: "draw:stroke" in props ? own.stroke : style.stroke,
          textVAlign: own.textVAlign ?? style.textVAlign,
          paddingIn: own.paddingIn ?? style.paddingIn,
        };
        textbox = {
          kind: "textbox",
          bbox,
          style: merged,
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
        const marginLeft = toInches(props["fo:margin-left"]);
        const indent = toInches(props["fo:text-indent"]);
        paragraph = {
          align: readAlign(props["fo:text-align"]),
          lineSpacing: toMultiplier(props["fo:line-height"]),
          ...(marginLeft ? { marginLeftIn: marginLeft } : {}),
          ...(indent ? { textIndentIn: indent } : {}),
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
      case "insertSpace":
        // Corpus finding (production_checkpoint_labels.pub): libmspub emits
        // explicit insertSpace callbacks — dropping them loses word spacing.
        if (paragraph)
          paragraph.spans.push({
            ...spanStyle,
            text: ev.name === "insertTab" ? "\t" : ev.name === "insertSpace" ? " " : "\n",
          });
        break;
      default:
        // startDocument/endDocument/metadata/embedded fonts/… — structural
        // or out-of-scope callbacks; ignored without error by design.
        break;
    }
  }
  return doc;
}
