import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LayoutDocumentSchema, type LayoutObject } from "@/schema";
import { textContent } from "@/lib/layout/text";
import { decodeBase64 } from "./image-meta";
import { buildModel } from "./model";
import { mapToLayoutDocument, PUBLISHER_DEFAULT_LINE_SPACING } from "./mapper";
import type { ImportNote } from "./report";
import { parseTrace } from "./trace-parser";

const golden = readFileSync(join(process.cwd(), "fixtures/pub-traces/demo-flyer.trace"), "utf8");
const ir = buildModel(parseTrace(golden));
const { doc, fidelity, fonts, notes, blobs } = mapToLayoutDocument(ir, "Demo flyer");

describe("buildModel (plan §10.2 intermediate model)", () => {
  it("captures pages and shape counts", () => {
    expect(ir.pages).toHaveLength(2);
    expect(ir.pages[0].wIn).toBe(8.5);
    expect(ir.pages[0].hIn).toBe(11);
    // banner rect, headline text, body text, rotated rect, rounded rect,
    // divider line, polygon, path, image = 9 shapes on page 1
    expect(ir.pages[0].shapes).toHaveLength(9);
    // page 2: gray backer rect, address text, bitmap-fill rect = 3 shapes
    expect(ir.pages[1].shapes).toHaveLength(3);
  });

  it("applies setStyle statefully to subsequent draws", () => {
    const banner = ir.pages[0].shapes[0];
    expect(banner.kind).toBe("rect");
    expect(banner.style.fill).toBe("#cc0000");
    expect(banner.style.stroke).toBeNull();
  });

  it("captures text runs, breaks, and paragraph props", () => {
    const headline = ir.pages[0].shapes[1];
    if (headline.kind !== "textbox") throw new Error("expected textbox");
    expect(headline.paragraphs).toHaveLength(1);
    expect(headline.paragraphs[0].spans[0]).toMatchObject({
      text: "GRAND OPENING",
      fontName: "Impact",
      sizePt: 48,
      color: "#ffffff",
    });
    expect(headline.paragraphs[0].lineSpacing).toBeCloseTo(1.19, 5);
    expect(headline.style.textVAlign).toBe("middle");
    expect(headline.style.paddingIn?.l).toBeCloseTo(0.04, 5);

    const addr = ir.pages[1].shapes[1];
    if (addr.kind !== "textbox") throw new Error("expected textbox");
    // two spans + the line break between them
    expect(addr.paragraphs[0].spans.map((s) => s.text)).toEqual([
      "123 Main Street",
      "\n",
      "Anytown, USA 01234",
    ]);
  });

  it("reads a 2-point polyline as a line", () => {
    const line = ir.pages[0].shapes.find((s) => s.kind === "line");
    if (!line || line.kind !== "line") throw new Error("expected line");
    expect(line.x1).toBe(0.75);
    expect(line.y2).toBe(8.5);
  });
});

describe("mapToLayoutDocument (plan §10.3, P2 content bar)", () => {
  it("produces a schema-valid v2 document", () => {
    const parsed = LayoutDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    expect(doc.version).toBe(2);
  });

  it("sets document size, orientation, and name from the source", () => {
    expect(doc.size).toEqual({ w: 8.5, h: 11 });
    expect(doc.orientation).toBe("portrait");
    expect(doc.name).toBe("Demo flyer");
    expect(doc.pages).toHaveLength(2);
    expect(doc.bleed).toBe(0);
  });

  it("places the banner exactly (the Milestone-1 accuracy bar)", () => {
    const banner = doc.pages[0].objects[0];
    expect(banner).toMatchObject({
      type: "rect",
      x: 0.5,
      y: 0.5,
      w: 7.5,
      h: 1.75,
      fill: "#cc0000",
      rotation: 0,
    });
  });

  it("maps text frames with per-run family, size, ink color, and line spacing", () => {
    const headline = doc.pages[0].objects[1];
    if (headline.type !== "text" || !headline.text) throw new Error("expected text frame");
    const para = headline.text.paragraphs[0];
    expect(para.runs).toHaveLength(1);
    expect(para.runs[0]).toMatchObject({
      text: "GRAND OPENING",
      color: "#ffffff", // the corpus's white-on-dark labels made this a P2 must
    });
    expect(para.runs[0].font).toMatchObject({ family: "Impact", size: 48, bold: false });
    expect(para.align).toBe("center");
    expect(para.lineSpacing).toBeCloseTo(1.19, 5);
  });

  it("keeps multi-style paragraphs as real runs (P2) — merging same-style neighbors", () => {
    const body = doc.pages[0].objects[2];
    if (body.type !== "text" || !body.text) throw new Error("expected text frame");
    expect(textContent(body.text)).toBe(
      "Join us Saturday for our grand opening celebration with door prizes and demos.\nDoors open at 9 AM."
    );
    // regular / bold / regular — three runs, bold carried per-run
    const runs = body.text.paragraphs[0].runs;
    expect(runs.map((r) => [r.text, r.font.bold])).toEqual([
      ["Join us Saturday for our ", false],
      ["grand opening celebration", true],
      [" with door prizes and demos.", false],
    ]);
    expect(runs.every((r) => r.font.family === "Times New Roman")).toBe(true);
    // no flatten note anymore — this is faithful now
    expect(notes.some((n) => n.objectId === body.id)).toBe(false);
  });

  it("passes rotation through unchanged (both conventions are CW about the center)", () => {
    // Verified against pub2xhtml's reference render of the corpus (3up_tabs):
    // librevenge:rotate θ → SVG rotate(θ, cx, cy) with no negation.
    const rotated = doc.pages[0].objects[3];
    expect(rotated.type).toBe("rect");
    if (rotated.type === "line") throw new Error("unexpected line");
    expect(rotated.rotation).toBe(15);
  });

  it("still degrades rounded corners with a note — never silently", () => {
    const ids = new Set(notes.filter((n) => n.tier === 2).map((n) => n.objectId));
    const rounded = doc.pages[0].objects[4];
    expect(ids.has(rounded.id)).toBe(true);
  });

  it("extracts the drawGraphicObject image to a stretched picture frame (P3) — no note", () => {
    const picture = doc.pages[0].objects[8];
    if (picture.type !== "picture") throw new Error("expected picture frame");
    expect(picture.assetId).toBeDefined();
    expect(picture.fit).toBe("stretch");
    // the extracted image is faithful now — no degradation note
    expect(notes.some((n) => n.objectId === picture.id)).toBe(false);
    // asset metadata carries the sniffed mime + real 8×8 dimensions
    const asset = doc.assets[picture.assetId!];
    expect(asset).toMatchObject({ kind: "image", mime: "image/png", width: 8, height: 8, name: "imported-1.png" });
    expect(asset.bytes).toBe(74);
    // and the bytes ride the blobs payload keyed by the same id
    expect(blobs[picture.assetId!]).toBeDefined();
    expect(blobs[picture.assetId!].mime).toBe("image/png");
    expect(decodeBase64(blobs[picture.assetId!].dataB64).length).toBe(74);
  });

  it("converts a page-2 bitmap-fill rect to a picture sharing the deduped asset", () => {
    const picture = doc.pages[1].objects[2];
    if (picture.type !== "picture") throw new Error("expected picture frame");
    expect(picture.fit).toBe("stretch");
    // same PNG payload as the page-1 graphic → one shared asset, not two
    const graphic = doc.pages[0].objects[8];
    if (graphic.type !== "picture") throw new Error("expected picture frame");
    expect(picture.assetId).toBe(graphic.assetId);
    expect(Object.keys(doc.assets)).toHaveLength(1);
    expect(Object.keys(blobs)).toHaveLength(1);
    expect(notes.some((n) => n.objectId === picture.id)).toBe(false);
  });

  it("converts polygons to real closed paths with normalized (0–1) points (P2)", () => {
    const polygon = doc.pages[0].objects[6];
    if (polygon.type !== "path" || !polygon.d) throw new Error("expected path");
    // bbox exact, as before
    expect(polygon.x).toBe(4.6);
    expect(polygon.y).toBe(8.9);
    expect(polygon.w).toBeCloseTo(2.8, 5);
    expect(polygon.h).toBeCloseTo(2.1, 5);
    // 10 star points + close, first vertex (6.0, 8.9) normalizes into the box
    expect(polygon.d).toHaveLength(11);
    expect(polygon.d[0]).toEqual({ c: "M", x: 0.5, y: 0 });
    expect(polygon.d[10]).toEqual({ c: "Z" });
    for (const seg of polygon.d) {
      if (seg.c === "Z") continue;
      expect(seg.x).toBeGreaterThanOrEqual(0);
      expect(seg.x).toBeLessThanOrEqual(1);
    }
    // faithful now — no degradation note
    expect(notes.some((n) => n.objectId === polygon.id)).toBe(false);
  });

  it("converts bezier paths to real paths, keeping cubic control points (P2)", () => {
    const path = doc.pages[0].objects[7];
    if (path.type !== "path" || !path.d) throw new Error("expected path");
    expect(path.d[0]).toEqual({ c: "M", x: 0, y: 0.5 });
    const c = path.d[1];
    if (c.c !== "C") throw new Error("expected cubic");
    expect(c.x).toBe(1); // end point at the right edge of the bbox
    expect(path.d[2]).toEqual({ c: "Z" });
    expect(notes.some((n) => n.objectId === path.id)).toBe(false);
  });

  it("maps the divider polyline to a line object with px stroke width", () => {
    const line = doc.pages[0].objects[5];
    if (line.type !== "line") throw new Error("expected line");
    expect(line.x1).toBe(0.75);
    expect(line.x2).toBe(7.75);
    expect(line.stroke.width).toBeCloseTo(0.96, 3); // 0.01in × 96
  });

  it("defaults unspecified line spacing to Publisher single (1.19)", () => {
    const addr = doc.pages[1].objects[1];
    if (addr.type !== "text" || !addr.text) throw new Error("expected text frame");
    expect(addr.text.paragraphs[0].lineSpacing).toBe(PUBLISHER_DEFAULT_LINE_SPACING);
  });

  it("reports font dispositions (known kept, unknown → default with reason)", () => {
    const impact = fonts.find((f) => f.source === "Impact");
    expect(impact?.mappedTo).toBe("Impact");
    const arial = fonts.find((f) => f.source === "Arial");
    expect(arial?.mappedTo).toBe("Arial");
  });

  it("carries vertical alignment and text insets faithfully (P2) — no notes needed", () => {
    const headline = doc.pages[0].objects[1];
    if (headline.type !== "text" || !headline.text) throw new Error("expected text frame");
    expect(headline.text.vAlign).toBe("middle");
    expect(headline.text.inset).toEqual({ l: 0.04, r: 0.04, t: 0.04, b: 0.04 });
    expect(notes.some((n) => n.objectId === headline.id)).toBe(false);
  });

  it("tallies fidelity so the report adds up (P3: the image now extracts clean)", () => {
    // 9 page-1 shapes + 3 page-2 shapes (the added bitmap rect) = 12
    expect(fidelity.converted + fidelity.degraded + fidelity.flagged).toBe(12);
    expect(fidelity.flagged).toBe(0); // no tables in the demo trace
    // only the rounded rect still degrades — the image + bitmap rect convert
    expect(fidelity.degraded).toBe(1);
    expect(fidelity.converted).toBe(11);
  });
});

describe("mapper edge cases", () => {
  it("unknown fonts fall to the default with a report entry", () => {
    const trace = [
      "startDocument()",
      "  startPage(svg:height: 11.0000in, svg:width: 8.5000in)",
      "    startTextObject (svg:height: 1.0000in, svg:width: 4.0000in, svg:x: 1.0000in, svg:y: 1.0000in)",
      "      openParagraph (fo:text-align: left)",
      "        openSpan(fo:font-size: 12.0000pt, style:font-name: Papyrus)",
      "          insertText (hello)",
      "        closeSpan",
      "      closeParagraph",
      "    endTextObject",
      "  endPage",
      "endDocument()",
    ].join("\n");
    const result = mapToLayoutDocument(buildModel(parseTrace(trace)), "x");
    const remap = result.fonts.find((f) => f.source === "Papyrus");
    expect(remap?.mappedTo).toBe("Motiva Sans");
    expect(remap?.reason).toContain("no libre equivalent");
  });

  it("remaps corpus families through the §10.5 table with honest tiers", () => {
    const trace = [
      "startDocument()",
      "  startPage(svg:height: 11.0000in, svg:width: 8.5000in)",
      "    startTextObject (svg:height: 1.0000in, svg:width: 4.0000in, svg:x: 1.0000in, svg:y: 1.0000in)",
      "      openParagraph (fo:text-align: left)",
      "        openSpan(fo:font-size: 12.0000pt, style:font-name: Calibri)",
      "          insertText (tab label)",
      "        closeSpan",
      "        openSpan(fo:font-size: 12.0000pt, style:font-name: HelveticaNeueLT Pro 65 Md)",
      "          insertText (checkpoint)",
      "        closeSpan",
      "        openSpan(fo:font-size: 12.0000pt, style:font-name: Goudy Old Style)",
      "          insertText (card)",
      "        closeSpan",
      "      closeParagraph",
      "    endTextObject",
      "  endPage",
      "endDocument()",
    ].join("\n");
    const result = mapToLayoutDocument(buildModel(parseTrace(trace)), "x");
    const by = (s: string) => result.fonts.find((f) => f.source === s);
    // tier 1: Calibri keeps its name — Carlito is the webfont stand-in
    expect(by("Calibri")?.mappedTo).toBe("Calibri");
    expect(by("Calibri")?.reason).toContain("Carlito");
    // tier 2: commercial HelveticaNeue LT → class match
    expect(by("HelveticaNeueLT Pro 65 Md")?.mappedTo).toBe("Libre Franklin");
    // tier 2: Goudy Old Style keeps its name via the Sorts Mill Goudy revival
    expect(by("Goudy Old Style")?.mappedTo).toBe("Goudy Old Style");
    const runs = (() => {
      const o = result.doc.pages[0].objects[0];
      return o.type === "text" && o.text ? o.text.paragraphs[0].runs : [];
    })();
    expect(runs.map((r) => r.font.family)).toEqual(["Calibri", "Libre Franklin", "Goudy Old Style"]);
  });

  it("translates Wingdings checkbox glyphs to Unicode symbols with a doc-level note", () => {
    const trace = [
      "startDocument()",
      "  startPage(svg:height: 11.0000in, svg:width: 8.5000in)",
      "    startTextObject (svg:height: 1.0000in, svg:width: 4.0000in, svg:x: 1.0000in, svg:y: 1.0000in)",
      "      openParagraph (fo:text-align: center)",
      "        openSpan(fo:color: #ffffff, fo:font-size: 0.2500in, fo:font-weight: bold, style:font-name: Wingdings)",
      "          insertText (ü)",
      "        closeSpan",
      "      closeParagraph",
      "    endTextObject",
      "  endPage",
      "endDocument()",
    ].join("\n");
    const result = mapToLayoutDocument(buildModel(parseTrace(trace)), "x");
    const o = result.doc.pages[0].objects[0];
    if (o.type !== "text" || !o.text) throw new Error("expected text frame");
    const run = o.text.paragraphs[0].runs[0];
    expect(run.text).toBe("✔"); // 0xFC — the corpus checkpoint checkmark
    expect(run.color).toBe("#ffffff");
    expect(run.font.size).toBe(18); // 0.25in = 18pt
    expect(result.notes.some((n) => !n.objectId && n.message.includes("Wingdings"))).toBe(true);
  });

  it("carries paragraph indents into the run model (P2)", () => {
    const trace = [
      "startDocument()",
      "  startPage(svg:height: 11.0000in, svg:width: 8.5000in)",
      "    startTextObject (svg:height: 1.0000in, svg:width: 4.0000in, svg:x: 1.0000in, svg:y: 1.0000in)",
      "      openParagraph (fo:margin-left: 0.5000in, fo:text-align: left, fo:text-indent: -0.2500in)",
      "        openSpan(fo:font-size: 12.0000pt, style:font-name: Arial)",
      "          insertText (hanging bullet line)",
      "        closeSpan",
      "      closeParagraph",
      "    endTextObject",
      "  endPage",
      "endDocument()",
    ].join("\n");
    const result = mapToLayoutDocument(buildModel(parseTrace(trace)), "x");
    const o = result.doc.pages[0].objects[0];
    if (o.type !== "text" || !o.text) throw new Error("expected text frame");
    expect(o.text.paragraphs[0].indent).toBe(0.5);
    expect(o.text.paragraphs[0].firstLineIndent).toBe(-0.25);
  });

  it("per-page size deviations become sizeOverride", () => {
    const trace = [
      "startDocument()",
      "  startPage(svg:height: 11.0000in, svg:width: 8.5000in)",
      "  endPage",
      "  startPage(svg:height: 8.5000in, svg:width: 11.0000in)",
      "  endPage",
      "endDocument()",
    ].join("\n");
    const result = mapToLayoutDocument(buildModel(parseTrace(trace)), "x");
    expect(result.doc.pages[0].sizeOverride).toBeUndefined();
    expect(result.doc.pages[1].sizeOverride).toEqual({ w: 11, h: 8.5 });
  });

  it("tables flag tier-3 placeholders", () => {
    const trace = [
      "startDocument()",
      "  startPage(svg:height: 11.0000in, svg:width: 8.5000in)",
      "    startTableObject(svg:height: 2.0000in, svg:width: 4.0000in, svg:x: 1.0000in, svg:y: 1.0000in)",
      "    endTableObject",
      "  endPage",
      "endDocument()",
    ].join("\n");
    const result = mapToLayoutDocument(buildModel(parseTrace(trace)), "x");
    expect(result.fidelity.flagged).toBe(1);
    expect(result.notes.some((n) => n.tier === 3 && n.message.includes("table"))).toBe(true);
  });

  it("an empty trace still yields a valid one-page document", () => {
    const result = mapToLayoutDocument(buildModel(parseTrace("startDocument()\nendDocument()")), "empty");
    expect(LayoutDocumentSchema.safeParse(result.doc).success).toBe(true);
    expect(result.doc.pages).toHaveLength(1);
  });

  // A real 8×8 PNG (color type 2), the same payload the golden trace carries.
  const TINY_PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mM4w8CAFTEMLQkAIPQzAWg3IxUAAAAASUVORK5CYII=";

  it("keeps a bitmap fill on a non-rectangular polygon as a path, unfilled, with a note (P3)", () => {
    const trace = [
      "startDocument()",
      "  startPage(svg:height: 11.0000in, svg:width: 8.5000in)",
      `    setStyle(draw:fill: bitmap, draw:fill-image: ${TINY_PNG}, draw:stroke: none, librevenge:mime-type: image/png, style:repeat: stretch)`,
      "    drawPolygon (svg:points: ((svg:x: 1.0000in, svg:y: 1.0000in), (svg:x: 3.0000in, svg:y: 1.0000in), (svg:x: 2.0000in, svg:y: 3.0000in)))",
      "  endPage",
      "endDocument()",
    ].join("\n");
    const result = mapToLayoutDocument(buildModel(parseTrace(trace)), "x");
    const o = result.doc.pages[0].objects[0];
    expect(o.type).toBe("path"); // geometry kept — fidelity over a wrong rectangle
    if (o.type === "line") throw new Error("unexpected line");
    expect(o.fill).toBeNull();
    // no asset — we only extract images we can actually place
    expect(Object.keys(result.doc.assets)).toHaveLength(0);
    expect(Object.keys(result.blobs)).toHaveLength(0);
    expect(result.notes.some((n) => n.tier === 2 && n.message.includes("non-rectangular shape"))).toBe(true);
    expect(result.fidelity.degraded).toBe(1);
  });

  it("degrades a WMF graphic object to a placeholder with a note and no asset (P3)", () => {
    const wmf = "183GmgAAAAAAAAAA"; // placeable-WMF magic D7 CD C6 9A
    const trace = [
      "startDocument()",
      "  startPage(svg:height: 11.0000in, svg:width: 8.5000in)",
      "    setStyle(draw:fill: none, draw:stroke: none)",
      `    drawGraphicObject (librevenge:mime-type: image/wmf, office:binary-data: ${wmf}, svg:height: 1.0000in, svg:width: 1.0000in, svg:x: 1.0000in, svg:y: 1.0000in)`,
      "  endPage",
      "endDocument()",
    ].join("\n");
    const result = mapToLayoutDocument(buildModel(parseTrace(trace)), "x");
    const o = result.doc.pages[0].objects[0];
    expect(o.type).toBe("picture");
    if (o.type !== "picture") throw new Error("expected picture");
    expect(o.assetId).toBeUndefined();
    expect(Object.keys(result.doc.assets)).toHaveLength(0);
    expect(Object.keys(result.blobs)).toHaveLength(0);
    expect(result.notes.some((n) => n.tier === 2 && n.message.includes("WMF"))).toBe(true);
    expect(result.fidelity.degraded).toBe(1);
  });
});

/**
 * Gradient fills (New_Rack_Card regression): libmspub carries a gradient's
 * colors on svg:linearGradient stop vectors, never draw:fill-color, so the
 * flat color must come from the stops — before gradient.ts the background
 * imported with NO fill while the note still claimed it was "flattened".
 */
describe("gradient fill flattening", () => {
  it("fills the shape with the stops' average color and notes the degradation", () => {
    // the rack card's full-page background, verbatim from its pub2raw trace
    const trace = [
      "startDocument()",
      "  startPage(svg:height: 8.5000in, svg:width: 3.6600in)",
      "    setStyle(draw:angle: 0.0000in, draw:fill: gradient, draw:stroke: none, libmspub:shade: normal, " +
        "svg:fill-rule: nonzero, svg:linearGradient: ((svg:offset: 0.0000%, svg:stop-color: #3b618e, " +
        "svg:stop-opacity: 100.0000%), (svg:offset: 100.0000%, svg:stop-color: #7f7f7f, svg:stop-opacity: 100.0000%)))",
      "    drawPolygon (svg:points: ((svg:x: 0.2500in, svg:y: 0.2500in), (svg:x: 3.4100in, svg:y: 0.2500in), " +
        "(svg:x: 3.4100in, svg:y: 8.2500in), (svg:x: 0.2500in, svg:y: 8.2500in), (svg:x: 0.2500in, svg:y: 0.2500in)))",
      "  endPage",
      "endDocument()",
    ].join("\n");
    const result = mapToLayoutDocument(buildModel(parseTrace(trace)), "x");
    const o = result.doc.pages[0].objects[0];
    if (o.type === "line") throw new Error("unexpected line");
    expect(o.fill).toBe("#5d7087"); // per-channel midpoint of the two stops
    expect(result.notes.some((n) => n.tier === 2 && n.message === "gradient fill flattened to the nearest flat color")).toBe(true);
    expect(result.fidelity.degraded).toBe(1);
  });

  it("says a colorless non-solid fill was dropped, not flattened", () => {
    const trace = [
      "startDocument()",
      "  startPage(svg:height: 11.0000in, svg:width: 8.5000in)",
      "    setStyle(draw:fill: pattern, draw:stroke: none)",
      "    drawRectangle (svg:height: 1.0000in, svg:width: 1.0000in, svg:x: 1.0000in, svg:y: 1.0000in)",
      "  endPage",
      "endDocument()",
    ].join("\n");
    const result = mapToLayoutDocument(buildModel(parseTrace(trace)), "x");
    const o = result.doc.pages[0].objects[0];
    if (o.type === "line") throw new Error("unexpected line");
    expect(o.fill).toBeNull();
    expect(result.notes.some((n) => n.message === "pattern fill dropped — the source carried no color to flatten to")).toBe(true);
  });
});

/**
 * Arc paths (ecl_workbook slice): librevenge A segments lower to cubics at
 * the model boundary (arc.ts), the shape bbox derives from the CONVERTED
 * segment hull (raw arc props carry only endpoints — the corpus's two-arc
 * circles hulled those to a height-0 box), and the mapper's bbox degradation
 * no longer fires for arcs — only for genuinely unknown verbs.
 */
describe("arc paths: A → cubics at the model boundary", () => {
  const pathTrace = (groups: string) =>
    [
      "startDocument()",
      "  startPage(svg:height: 11.0000in, svg:width: 8.5000in)",
      "    setStyle(draw:fill: none, draw:stroke: solid, svg:stroke-color: #ff0000, svg:stroke-width: 0.0104in)",
      `    drawPath (svg:d: (${groups}))`,
      "  endPage",
      "endDocument()",
    ].join("\n");
  const M = (x: number, y: number) =>
    `(librevenge:path-action: M, svg:x: ${x.toFixed(4)}in, svg:y: ${y.toFixed(4)}in)`;
  const A = (rx: number, ry: number, x: number, y: number, flags = "") =>
    `(librevenge:path-action: A, librevenge:rotate: 0.0000in, svg:rx: ${rx.toFixed(4)}in, ` +
    `svg:ry: ${ry.toFixed(4)}in, svg:x: ${x.toFixed(4)}in, svg:y: ${y.toFixed(4)}in${flags})`;

  it("converts the two-arc callout circle to real cubics with the ellipse bbox — not h=0", () => {
    // the ecl_workbook page-3 callout circle, verbatim (flagless arcs)
    const groups = [
      M(1.6492, 8.3869),
      A(0.233, 0.2, 1.1832, 8.3869),
      A(0.233, 0.2, 1.6492, 8.3869),
      "(librevenge:path-action: Z)",
      "(librevenge:path-action: Z)",
    ].join(", ");
    const result = mapToLayoutDocument(buildModel(parseTrace(pathTrace(groups))), "x");
    const o = result.doc.pages[0].objects[0];
    if (o.type !== "path" || !o.d) throw new Error("expected path");
    // both endpoints share y=8.3869 — endpoint-only bbox would be h=0
    expect(o.x).toBeCloseTo(1.1832, 4);
    expect(o.y).toBeCloseTo(8.1869, 4);
    expect(o.w).toBeCloseTo(0.466, 4);
    expect(o.h).toBeCloseTo(0.4, 4);
    // M + 2 cubics per 180° arc + the two Zs; everything normalized to [0,1]
    expect(o.d.map((s) => s.c)).toEqual(["M", "C", "C", "C", "C", "Z", "Z"]);
    for (const seg of o.d) {
      if (seg.c === "Z") continue;
      for (const v of [seg.x, seg.y]) {
        expect(v).toBeGreaterThanOrEqual(-0.001);
        expect(v).toBeLessThanOrEqual(1.001);
      }
    }
    // clean conversion: no degradation, no bounding-box note
    expect(result.fidelity).toEqual({ converted: 1, degraded: 0, flagged: 0 });
    expect(result.notes.some((n) => n.message.includes("bounding box"))).toBe(false);
  });

  it("honors explicit librevenge:large-arc / librevenge:sweep props (default is true/true)", () => {
    // (1,1) → (2,2) with r=1: flags decide which of the four arcs is drawn.
    const arc = (flags: string) => [M(1, 1), A(1, 1, 2, 2, flags)].join(", ");
    // default (absent ⇒ true,true — pub2xhtml's reading): the 270° sweep,
    // center (2,1), covering x ∈ [1,3], y ∈ [0,2]
    const big = mapToLayoutDocument(buildModel(parseTrace(pathTrace(arc("")))), "x").doc.pages[0].objects[0];
    if (big.type !== "path") throw new Error("expected path");
    expect(big.w).toBeCloseTo(2, 3);
    expect(big.h).toBeCloseTo(2, 3);
    // explicit false/false: the 90° quarter, same center, x/y ∈ [1,2]
    const small = mapToLayoutDocument(
      buildModel(parseTrace(pathTrace(arc(", librevenge:large-arc: false, librevenge:sweep: false")))),
      "x",
    ).doc.pages[0].objects[0];
    if (small.type !== "path") throw new Error("expected path");
    expect(small.x).toBeCloseTo(1, 3);
    expect(small.y).toBeCloseTo(1, 3);
    expect(small.w).toBeCloseTo(1, 3);
    expect(small.h).toBeCloseTo(1, 3);
  });

  it("still degrades a genuinely unknown verb to its bbox with a note", () => {
    const groups = [
      M(1, 1),
      "(librevenge:path-action: X, svg:x: 2.0000in, svg:y: 2.0000in)",
    ].join(", ");
    const result = mapToLayoutDocument(buildModel(parseTrace(pathTrace(groups))), "x");
    const o = result.doc.pages[0].objects[0];
    expect(o.type).toBe("rect"); // bbox fallback
    expect(result.fidelity.degraded).toBe(1);
    expect(result.notes.some((n) => n.message.includes("converted to its bounding box"))).toBe(true);
  });
});

/**
 * Honest-reporting passes (ecl_workbook slice): text hidden behind a higher-z
 * picture (Publisher wraps text around inline pictures; libmspub emits no wrap
 * data, so text lays out through the full frame and the picture paints over
 * it) — announced, not fixable at the data level here — and page-number FIELDS
 * that arrive as a literal '#', which we SUBSTITUTE: each header/footer-band
 * frame imports with the real page number where the '#' stood, and the
 * aggregate becomes a kind:"corrected" note.
 */
describe("mapper honest-reporting passes: wrap-overlap + page-number substitution", () => {
  // Same real 8×8 PNG the golden trace ships → a renderable picture frame.
  const PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mM4w8CAFTEMLQkAIPQzAWg3IxUAAAAASUVORK5CYII=";
  const inn = (n: number) => `${n.toFixed(4)}in`;

  const textFrame = (x: number, y: number, w: number, h: number, text: string) =>
    [
      `    startTextObject (svg:height: ${inn(h)}, svg:width: ${inn(w)}, svg:x: ${inn(x)}, svg:y: ${inn(y)})`,
      "      openParagraph (fo:text-align: left)",
      "        openSpan(fo:font-size: 12.0000pt, style:font-name: Arial)",
      `          insertText (${text})`,
      "        closeSpan",
      "      closeParagraph",
      "    endTextObject",
    ].join("\n");

  const emptyTextFrame = (x: number, y: number, w: number, h: number) =>
    `    startTextObject (svg:height: ${inn(h)}, svg:width: ${inn(w)}, svg:x: ${inn(x)}, svg:y: ${inn(y)})\n    endTextObject`;

  // A picture frame (drawGraphicObject with real PNG bytes) at the given box.
  const picture = (x: number, y: number, w: number, h: number) =>
    `    setStyle(draw:fill: none, draw:stroke: none)\n    drawGraphicObject (librevenge:mime-type: image/png, office:binary-data: ${PNG}, svg:height: ${inn(h)}, svg:width: ${inn(w)}, svg:x: ${inn(x)}, svg:y: ${inn(y)})`;

  const page = (...body: string[]) =>
    ["  startPage(svg:height: 11.0000in, svg:width: 8.5000in)", ...body, "  endPage"].join("\n");

  const doc = (...pages: string[]) => ["startDocument()", ...pages, "endDocument()"].join("\n");

  const convert = (trace: string) => mapToLayoutDocument(buildModel(parseTrace(trace)), "x");

  const OVERLAP = "hidden behind an image";
  const overlapNotes = (notes: ImportNote[]) => notes.filter((n) => n.message.includes(OVERLAP));
  const pageNumberNotes = (notes: ImportNote[]) =>
    notes.filter((n) => n.message.includes("Page numbers filled in"));
  const textOf = (o: LayoutObject): string => {
    if (o.type !== "text" || !o.text) throw new Error("expected text frame");
    return textContent(o.text);
  };

  it("flags a text frame a higher-z picture covers past the 20% gate", () => {
    // text (idx0) then picture (idx1) → picture ABOVE. 2×2 over a 4×4 frame = 25%.
    const { doc: d, notes } = convert(
      doc(page(textFrame(1, 1, 4, 4, "body copy that a screenshot lands on top of"), picture(1, 1, 2, 2))),
    );
    const text = d.pages[0].objects[0];
    const flagged = overlapNotes(notes);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].objectId).toBe(text.id);
    expect(flagged[0]).toMatchObject({ tier: 2, pageId: "imp-p1" });
    expect(flagged[0].kind).toBeUndefined(); // unkinded → renders in "Simplified"
  });

  it("does NOT flag a picture BELOW the text — the bcim full-card-background case", () => {
    // picture (idx0) then text (idx1) → picture BELOW; 100% coverage, no note.
    const { notes } = convert(
      doc(page(picture(1, 1, 4, 4), textFrame(1, 1, 4, 4, "card copy over its own background"))),
    );
    expect(overlapNotes(notes)).toHaveLength(0);
  });

  it("respects the 20% area threshold at the boundary", () => {
    // page 1: 4.9/25 = 19.6% (just under) → no note.
    // page 2: 5.0/25 = 20.0% (exactly at) → note.
    const { doc: d, notes } = convert(
      doc(
        page(textFrame(1, 1, 5, 5, "under the gate"), picture(1, 1, 2, 2.45)),
        page(textFrame(1, 1, 5, 5, "at the gate"), picture(1, 1, 2, 2.5)),
      ),
    );
    const flagged = overlapNotes(notes);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].objectId).toBe(d.pages[1].objects[0].id); // the page-2 frame
  });

  it("emits exactly ONE note per text frame however many pictures cover it", () => {
    const { notes } = convert(
      doc(
        page(
          textFrame(1, 1, 4, 4, "copy buried under two screenshots"),
          picture(1, 1, 2, 2), // 25% over the top-left
          picture(3, 3, 2, 2), // 25% over the bottom-right
        ),
      ),
    );
    expect(overlapNotes(notes)).toHaveLength(1);
  });

  it("exempts an empty text frame even when a picture fully covers it", () => {
    const { notes } = convert(doc(page(emptyTextFrame(1, 1, 4, 4), picture(1, 1, 4, 4))));
    expect(overlapNotes(notes)).toHaveLength(0);
  });

  it("substitutes the per-page number for a banded footer '#' and reports one corrected note", () => {
    // two pages, each a bottom-band footer carrying Publisher's '#' field →
    // each fills in ITS OWN page number, and the aggregate is a corrected note.
    const { doc: d, notes } = convert(
      doc(
        page(textFrame(0.5, 10.5, 7.5, 0.4, "V. May-12   Page | #")),
        page(textFrame(0.5, 10.5, 7.5, 0.4, "V. May-12   Page | #")),
      ),
    );
    expect(textOf(d.pages[0].objects[0])).toBe("V. May-12   Page | 1");
    expect(textOf(d.pages[1].objects[0])).toBe("V. May-12   Page | 2");
    // no literal '#' survives in the substituted footers
    expect(textOf(d.pages[0].objects[0])).not.toContain("#");

    const flagged = pageNumberNotes(notes);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].message).toContain("2 footer/header frames");
    expect(flagged[0]).toMatchObject({
      kind: "corrected", // renders in the report panel's "Corrected" group
      tier: 2,
      objectId: d.pages[0].objects[0].id, // anchored to the first such frame
      pageId: "imp-p1",
    });
    // the old "aren't imported" wording is gone
    expect(notes.some((n) => n.message.includes("aren't imported"))).toBe(false);
  });

  it("leaves a '#' glued to other glyphs untouched even inside the band", () => {
    // "#1" is a store number, not a page-number field — the '#' isn't a
    // standalone token, so it imports verbatim and yields no corrected note.
    const { doc: d, notes } = convert(doc(page(textFrame(0.5, 10.5, 7.5, 0.4, "Store #1 — Main St"))));
    expect(textOf(d.pages[0].objects[0])).toBe("Store #1 — Main St");
    expect(pageNumberNotes(notes)).toHaveLength(0);
  });

  it("does NOT substitute a standalone body-copy '#' outside the header/footer bands", () => {
    // center at 5.5in of 11in — squarely body copy. The '#' is a standalone
    // token but the frame is out of band, so it stays literal, no note.
    const { doc: d, notes } = convert(doc(page(textFrame(1, 5, 4, 1, "Total # of Cuts per Order"))));
    expect(textOf(d.pages[0].objects[0])).toBe("Total # of Cuts per Order");
    expect(pageNumberNotes(notes)).toHaveLength(0);
  });

  it("emits no page-number note when a banded frame has no '#'", () => {
    const { doc: d, notes } = convert(doc(page(textFrame(0.5, 10.5, 7.5, 0.4, "Confidential — do not copy"))));
    expect(textOf(d.pages[0].objects[0])).toBe("Confidential — do not copy");
    expect(pageNumberNotes(notes)).toHaveLength(0);
  });
});
