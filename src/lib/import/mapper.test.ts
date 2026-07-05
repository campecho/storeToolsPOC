import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LayoutDocumentSchema } from "@/schema";
import { buildModel } from "./model";
import { mapToLayoutDocument, PUBLISHER_DEFAULT_LINE_SPACING } from "./mapper";
import { parseTrace } from "./trace-parser";

const golden = readFileSync(join(process.cwd(), "fixtures/pub-traces/demo-flyer.trace"), "utf8");
const ir = buildModel(parseTrace(golden));
const { doc, fidelity, fonts, notes } = mapToLayoutDocument(ir, "Demo flyer");

describe("buildModel (plan §10.2 intermediate model)", () => {
  it("captures pages and shape counts", () => {
    expect(ir.pages).toHaveLength(2);
    expect(ir.pages[0].wIn).toBe(8.5);
    expect(ir.pages[0].hIn).toBe(11);
    // banner rect, headline text, body text, rotated rect, rounded rect,
    // divider line, polygon, path, image = 9 shapes on page 1
    expect(ir.pages[0].shapes).toHaveLength(9);
    expect(ir.pages[1].shapes).toHaveLength(2);
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

describe("mapToLayoutDocument (plan §10.3, P1 geometry bar)", () => {
  it("produces a schema-valid v1 document", () => {
    const parsed = LayoutDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
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

  it("maps text frames with content, family, size, and line spacing", () => {
    const headline = doc.pages[0].objects[1];
    if (headline.type !== "text" || !headline.text) throw new Error("expected text frame");
    expect(headline.text.content).toBe("GRAND OPENING");
    expect(headline.text.font.family).toBe("Impact"); // in the editor list — kept
    expect(headline.text.font.size).toBe(48);
    expect(headline.text.align).toBe("center");
    expect(headline.text.lineSpacing).toBeCloseTo(1.19, 5);
  });

  it("joins paragraphs with newlines and flattens multi-run styling with a note", () => {
    const body = doc.pages[0].objects[2];
    if (body.type !== "text" || !body.text) throw new Error("expected text frame");
    expect(body.text.content).toBe(
      "Join us Saturday for our grand opening celebration with door prizes and demos.\nDoors open at 9 AM."
    );
    expect(body.text.font.family).toBe("Times New Roman");
    expect(notes.some((n) => n.objectId === body.id && n.message.includes("character styles flattened"))).toBe(true);
  });

  it("converts librevenge CCW rotation to the editor's CW convention", () => {
    const rotated = doc.pages[0].objects[3];
    expect(rotated.type).toBe("rect");
    if (rotated.type === "line") throw new Error("unexpected line");
    expect(rotated.rotation).toBe(345); // 15° CCW
  });

  it("degrades rounded corners, polygons, paths, and images with notes — never silently", () => {
    const ids = new Set(notes.filter((n) => n.tier === 2).map((n) => n.objectId));
    const rounded = doc.pages[0].objects[4];
    const polygon = doc.pages[0].objects[6];
    const path = doc.pages[0].objects[7];
    const picture = doc.pages[0].objects[8];
    expect(ids.has(rounded.id)).toBe(true);
    expect(polygon.type).toBe("rect"); // bbox fallback
    expect(ids.has(polygon.id)).toBe(true);
    expect(path.type).toBe("rect");
    expect(ids.has(path.id)).toBe(true);
    expect(picture.type).toBe("picture");
    expect(ids.has(picture.id)).toBe(true);
  });

  it("computes the polygon bounding box from its points", () => {
    const polygon = doc.pages[0].objects[6];
    if (polygon.type === "line") throw new Error("unexpected line");
    expect(polygon.x).toBe(4.6);
    expect(polygon.y).toBe(8.9);
    expect(polygon.w).toBeCloseTo(2.8, 5);
    expect(polygon.h).toBeCloseTo(2.1, 5);
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
    expect(addr.text.lineSpacing).toBe(PUBLISHER_DEFAULT_LINE_SPACING);
  });

  it("reports font dispositions (known kept, unknown → default with reason)", () => {
    const impact = fonts.find((f) => f.source === "Impact");
    expect(impact?.mappedTo).toBe("Impact");
    const arial = fonts.find((f) => f.source === "Arial");
    expect(arial?.mappedTo).toBe("Arial");
  });

  it("notes text insets and vertical alignment the v1 schema can't hold", () => {
    const headline = doc.pages[0].objects[1];
    const msgs = notes.filter((n) => n.objectId === headline.id).map((n) => n.message);
    expect(msgs.some((m) => m.includes("insets"))).toBe(true);
    expect(msgs.some((m) => m.includes("vertical alignment"))).toBe(true);
  });

  it("tallies fidelity so the report adds up", () => {
    expect(fidelity.converted + fidelity.degraded + fidelity.flagged).toBe(11);
    expect(fidelity.flagged).toBe(0); // no tables in the demo trace
    expect(fidelity.degraded).toBeGreaterThanOrEqual(5);
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
    expect(remap?.reason).toContain("P2");
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
});
