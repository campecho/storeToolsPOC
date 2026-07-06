import { describe, expect, it } from "vitest";
import type { LayoutDocument, LayoutObject, TextRun } from "@/schema";
import {
  categoryRatio,
  computeFidelity,
  formatScorecard,
  normalizeText,
  parseReferencePages,
  scoreAgainstReference,
  type FileScore,
} from "./fidelity";
import type { ImportAssetsPayload } from "./report";

/**
 * Unit tests for the fidelity harness, on small synthetic SVG strings shaped
 * exactly like pub2xhtml's output (pretty-print newlines, style attributes,
 * inch-denominated font sizes, data-URI patterns). Two jobs: pin the
 * reference parser's reading of that grammar, and prove every category can
 * FAIL — a harness whose checks can't go red measures nothing.
 */

/* ── Builders ── */

const svgPage = (body: string, w = 8.5, h = 11) =>
  `<svg:svg version="1.1" xmlns:svg="http://www.w3.org/2000/svg" width="${w.toFixed(4)}in" ` +
  `height="${h.toFixed(4)}in" viewBox="0 0 ${(w * 72).toFixed(4)} ${(h * 72).toFixed(4)}" >\n${body}\n</svg:svg>`;

/** The comment-wrapped doctype pub2xhtml puts before every page. */
const doctypeComment = `<!-- \n<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n -->`;

const tspan = (text: string, attrs = 'font-family="Calibri" font-size="0.1667" fill="#000000"') =>
  `<svg:tspan ${attrs} >\n${text}</svg:tspan>`;

const run = (text: string, over: Partial<TextRun["font"]> & { color?: string; family?: string } = {}): TextRun => ({
  text,
  font: {
    family: over.family ?? "Calibri",
    size: over.size ?? 12,
    bold: over.bold ?? false,
    italic: over.italic ?? false,
    underline: false,
  },
  color: over.color ?? "#000000",
});

const textFrame = (id: string, x: number, y: number, w: number, h: number, runs: TextRun[], rotation = 0): LayoutObject => ({
  id,
  type: "text",
  x,
  y,
  w,
  h,
  rotation,
  locked: false,
  fill: null,
  stroke: null,
  text: { paragraphs: [{ align: "left", lineSpacing: 1.19, runs }] },
});

const pathObj = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string | null,
  stroke: string | null = null,
): LayoutObject => ({
  id,
  type: "path",
  x,
  y,
  w,
  h,
  rotation: 0,
  locked: false,
  fill,
  stroke: stroke ? { color: stroke, width: 1 } : null,
  d: [
    { c: "M", x: 0, y: 0 },
    { c: "L", x: 1, y: 0 },
    { c: "L", x: 1, y: 1 },
    { c: "L", x: 0, y: 1 },
    { c: "Z" },
  ],
});

const picture = (id: string, x: number, y: number, w: number, h: number, assetId?: string): LayoutObject => ({
  id,
  type: "picture",
  x,
  y,
  w,
  h,
  rotation: 0,
  locked: false,
  fill: null,
  stroke: null,
  ...(assetId ? { assetId, fit: "stretch" as const } : {}),
});

const doc = (objects: LayoutObject[], size = { w: 8.5, h: 11 }): LayoutDocument => ({
  version: 2,
  name: "synthetic",
  product: null,
  size,
  orientation: size.w > size.h ? "landscape" : "portrait",
  bleed: 0,
  margin: 0.5,
  columns: 1,
  pages: [{ id: "p1", masterId: null, objects }],
  masters: [],
  assets: {},
  guides: { v: [], h: [] },
});

const score = (xhtml: string, d: LayoutDocument, blobs: ImportAssetsPayload = {}): FileScore =>
  scoreAgainstReference({ name: "synthetic", refPages: parseReferencePages(xhtml), doc: d, blobs });

const b64 = (s: string) => Buffer.from(s).toString("base64");

/* ── Reference parsing ── */

describe("parseReferencePages", () => {
  it("reads page size from the svg attrs and coordinates at viewBox scale", () => {
    const pages = parseReferencePages(svgPage(`<svg:text x="72.0000" y="144.0000">\n${tspan("Hi")}\n</svg:text>`, 9, 11));
    expect(pages).toHaveLength(1);
    expect(pages[0].w).toBe(9);
    expect(pages[0].h).toBe(11);
    expect(pages[0].texts[0].x).toBeCloseTo(1, 6); // 72pt = 1in
    expect(pages[0].texts[0].y).toBeCloseTo(2, 6);
  });

  it("strips comment blocks before scanning (the embedded doctypes)", () => {
    const commented = `<!-- <svg:polygon points="0 0, 72 0, 72 72" style="fill: #ff0000; "/> -->`;
    const pages = parseReferencePages(doctypeComment + svgPage(commented));
    expect(pages[0].shapes).toHaveLength(0);
  });

  it("parses tspans: inch font-size to points, conditional bold, entities", () => {
    const body =
      `<svg:text x="10" y="20">\n` +
      tspan("A &amp; B", 'font-family="Goudy Old Style" font-weight="bold" font-size="0.2500" fill="#112233"') +
      `\n${tspan("plain")}\n</svg:text>`;
    const [page] = parseReferencePages(svgPage(body));
    const [bold, plain] = page.texts[0].tspans;
    expect(bold.text).toBe("\nA & B"); // entities decoded; serializer newline kept raw
    expect(bold.family).toBe("Goudy Old Style");
    expect(bold.sizePt).toBeCloseTo(18, 3); // 0.25in × 72
    expect(bold.bold).toBe(true);
    expect(bold.color).toBe("#112233");
    expect(plain.bold).toBeUndefined(); // no font-weight attr → unchecked
    expect(plain.text).toBe("\nplain");
  });

  it("parses rotate transforms into center coordinates (inches)", () => {
    const body = `<svg:text x="517.3562" y="156.6185" transform="rotate(90.0000, 625.8572, 156.6185)" >\n${tspan("Tab 1")}\n</svg:text>`;
    const [page] = parseReferencePages(svgPage(body, 9, 11));
    expect(page.texts[0].rotate?.deg).toBe(90);
    expect(page.texts[0].rotate?.cx).toBeCloseTo(625.8572 / 72, 6);
    expect(page.texts[0].rotate?.cy).toBeCloseTo(156.6185 / 72, 6);
  });

  it("parses polygons: points hull, style fill/stroke, pattern fills", () => {
    const body =
      `<svg:polygon points="72.0000 72.0000, 144.0000 72.0000, 144.0000 144.0000, 72.0000 144.0000, 72.0000 72.0000"\nstyle="fill-rule: nonzero; fill: #4E87C0; "/>` +
      `\n<svg:polygon points="0 0, 72 0"\nstyle="stroke-width: 0.7500; stroke: #316d35; stroke-dasharray: none; fill: none; "/>` +
      `\n<svg:polygon points="0 0, 72 0, 72 72, 0 72, 0 0"\nstyle="fill: url(#img1); "/>`;
    const [page] = parseReferencePages(svgPage(body));
    expect(page.shapes).toHaveLength(3);
    expect(page.shapes[0].bbox).toEqual({ x: 1, y: 1, w: 1, h: 1 });
    expect(page.shapes[0].fill).toBe("#4e87c0"); // normalized lowercase
    expect(page.shapes[0].stroke).toBeNull();
    expect(page.shapes[1].fill).toBeNull();
    expect(page.shapes[1].stroke).toBe("#316d35");
    expect(page.shapes[2].patternId).toBe("img1");
    expect(page.shapes[2].fill).toBeNull();
  });

  it("parses paths (hull over every coordinate pair) and lines", () => {
    const body =
      `<svg:path d=" \nM72.0000,72.0000\nL144.0000,72.0000\nL108.0000,144.0000\nZ\nZ" \nstyle="fill-rule: nonzero; fill: #fd2826; "/>` +
      `\n<svg:line x1="18.0000"  y1="77.7037" x2="252.0000"  y2="77.7037"\nstyle="stroke-width: 1.0000; stroke: #316d35; stroke-dasharray: none; fill: none; "/>`;
    const [page] = parseReferencePages(svgPage(body));
    expect(page.shapes[0].kind).toBe("path");
    expect(page.shapes[0].bbox).toEqual({ x: 1, y: 1, w: 1, h: 1 });
    expect(page.shapes[1].kind).toBe("line");
    expect(page.shapes[1].bbox.x).toBeCloseTo(0.25, 6);
    expect(page.shapes[1].bbox.h).toBe(0);
    expect(page.shapes[1].stroke).toBe("#316d35");
  });

  it("parses pattern images out of defs (id, mime, payload)", () => {
    const body = `<svg:defs>\n  <svg:pattern id="img1" patternUnits="userSpaceOnUse" width="100" height="100">\n<svg:image x="0" y="0" width="100" height="100" xlink:href="data:image/png;base64,${b64("PNG")}"/>\n  </svg:pattern>\n</svg:defs>`;
    const [page] = parseReferencePages(svgPage(body));
    expect(page.images).toEqual([{ id: "img1", mime: "image/png", dataB64: b64("PNG") }]);
  });

  it("parses a 0-byte render (master-page-only publication) to zero pages", () => {
    expect(parseReferencePages("")).toEqual([]);
  });
});

describe("normalizeText", () => {
  it("collapses whitespace runs and trims", () => {
    expect(normalizeText("\nTab 1\n")).toBe("Tab 1");
    expect(normalizeText("a  b\n\n c")).toBe("a b c");
  });
});

/* ── Scoring: every category must be able to pass AND fail ── */

const cat = (s: FileScore, c: keyof FileScore["categories"]) => s.categories[c];

describe("scoring: pageSize", () => {
  it("passes within 0.01in and fails beyond", () => {
    const ref = svgPage("");
    expect(cat(score(ref, doc([])), "pageSize")).toEqual({ pass: 1, total: 1 });
    expect(cat(score(ref, doc([], { w: 8.53, h: 11 })), "pageSize")).toEqual({ pass: 0, total: 1 });
  });

  it("respects a per-page sizeOverride", () => {
    const d = doc([], { w: 4, h: 4 });
    d.pages[0].sizeOverride = { w: 8.5, h: 11 };
    expect(cat(score(svgPage(""), d), "pageSize")).toEqual({ pass: 1, total: 1 });
  });

  it("fails a page count mismatch on the missing side", () => {
    const twoPages = svgPage("") + "\n<hr/>\n" + svgPage("");
    expect(cat(score(twoPages, doc([])), "pageSize")).toEqual({ pass: 1, total: 2 });
  });
});

describe("scoring: shapes (position + color)", () => {
  const square = (style: string) =>
    svgPage(`<svg:polygon points="72.0000 72.0000, 144.0000 72.0000, 144.0000 144.0000, 72.0000 144.0000, 72.0000 72.0000"\nstyle="${style}"/>`);

  it("passes an exact bbox and paint match", () => {
    const s = score(square("fill-rule: nonzero; fill: #4e87c0; "), doc([pathObj("o1", 1, 1, 1, 1, "#4E87C0")]));
    expect(cat(s, "position")).toEqual({ pass: 1, total: 1 });
    expect(cat(s, "color")).toEqual({ pass: 2, total: 2 }); // fill + stroke
    expect(s.extras).toBe(0);
    expect(s.unmatched).toBe(0);
  });

  it("fails position beyond 0.02in but still scores color", () => {
    const s = score(square("fill: #4e87c0; "), doc([pathObj("o1", 1.05, 1, 1, 1, "#4e87c0")]));
    expect(cat(s, "position")).toEqual({ pass: 0, total: 1 });
    expect(cat(s, "color")).toEqual({ pass: 2, total: 2 });
  });

  it("fails fill and stroke mismatches independently", () => {
    const s = score(
      square("stroke-width: 1.0; stroke: #316d35; fill: #4e87c0; "),
      doc([pathObj("o1", 1, 1, 1, 1, "#ff0000", "#316d35")]),
    );
    expect(cat(s, "color")).toEqual({ pass: 1, total: 2 }); // stroke ok, fill wrong
  });

  it("treats fill:none ↔ null and missing stroke ↔ null as equal", () => {
    const s = score(
      square("stroke-width: 1.0; stroke: #316d35; stroke-dasharray: none; fill: none; "),
      doc([pathObj("o1", 1, 1, 1, 1, null, "#316d35")]),
    );
    expect(cat(s, "color")).toEqual({ pass: 2, total: 2 });
  });

  it("an unmatched reference shape fails position and both color checks", () => {
    const s = score(square("fill: #4e87c0; "), doc([]));
    expect(cat(s, "position")).toEqual({ pass: 0, total: 1 });
    expect(cat(s, "color")).toEqual({ pass: 0, total: 2 });
    expect(s.unmatched).toBe(1);
  });

  it("counts unclaimed doc objects as extras", () => {
    const s = score(svgPage(""), doc([pathObj("stray", 2, 2, 1, 1, "#000000")]));
    expect(s.extras).toBe(1);
    expect(s.misses.some((m) => m.includes("stray"))).toBe(true);
  });
});

describe("scoring: text position", () => {
  const refText = (x: number, y: number, transform = "") =>
    svgPage(`<svg:text x="${x}" y="${y}"${transform} >\n${tspan("Hi")}\n</svg:text>`);

  it("unrotated: anchor inside the 0.05in-inflated frame passes, outside fails", () => {
    const frame = textFrame("t1", 1, 1, 2, 0.5, [run("Hi")]);
    // anchor at frame bottom edge (the render's habit) — inside
    expect(cat(score(refText(72, 108), doc([frame])), "position")).toEqual({ pass: 1, total: 1 });
    // 0.1in below the frame — outside even inflated
    expect(cat(score(refText(72, 115.2), doc([frame])), "position")).toEqual({ pass: 0, total: 1 });
  });

  it("rotated: rotate center within 0.05in of the frame center passes, beyond fails", () => {
    const frame = textFrame("t1", 1, 1, 2, 0.5, [run("Hi")], 90);
    const good = refText(100, 90, ` transform="rotate(90.0000, 144.0000, 90.0000)"`); // center (2, 1.25)
    const bad = refText(100, 90, ` transform="rotate(90.0000, 144.0000, 97.2000)"`); // 0.1in off
    expect(cat(score(good, doc([frame])), "position")).toEqual({ pass: 1, total: 1 });
    expect(cat(score(bad, doc([frame])), "position")).toEqual({ pass: 0, total: 1 });
  });
});

describe("scoring: text flow", () => {
  const refFlow = (spans: string) => svgPage(`<svg:text x="72" y="108">\n${spans}\n</svg:text>`);
  const frameWith = (runs: TextRun[]) => doc([textFrame("t1", 1, 1, 2, 0.5, runs)]);

  it("ignores serializer newlines, empty terminator tspans, and collapsed spaces", () => {
    // "\nTab 1" + "\n" (terminator) vs doc "Tab 1"
    const s = score(refFlow(tspan("Tab 1") + "\n" + tspan("")), frameWith([run("Tab 1")]));
    expect(cat(s, "textFlow")).toEqual({ pass: 1, total: 1 });
  });

  it("reconciles inline tspan boundaries with no doc whitespace (230|º)", () => {
    const s = score(refFlow(tspan("Lamination: 230") + "\n" + tspan("º")), frameWith([run("Lamination: 230º")]));
    expect(cat(s, "textFlow")).toEqual({ pass: 1, total: 1 });
  });

  it("fails on real content differences, either side longer", () => {
    expect(cat(score(refFlow(tspan("Tab 1")), frameWith([run("Tab 2")])), "textFlow")).toEqual({ pass: 0, total: 1 });
    expect(cat(score(refFlow(tspan("Tab")), frameWith([run("Tab 1")])), "textFlow")).toEqual({ pass: 0, total: 1 });
    expect(cat(score(refFlow(tspan("Tab 1")), frameWith([run("Tab")])), "textFlow")).toEqual({ pass: 0, total: 1 });
  });

  it("compares dingbat tspans post-translation (the importer's documented substitution)", () => {
    const wingding = tspan("ü", 'font-family="Wingdings" font-weight="bold" font-size="0.2500" fill="#ffffff"');
    const s = score(refFlow(wingding), frameWith([run("✔", { size: 18, bold: true, color: "#ffffff", family: "Motiva Sans" })]));
    expect(cat(s, "textFlow")).toEqual({ pass: 1, total: 1 });
    expect(cat(s, "font")).toEqual({ pass: 1, total: 1 }); // Wingdings → editor default, remap-aware
  });

  it("a flow mismatch also fails the per-tspan style categories (unattributable)", () => {
    const s = score(refFlow(tspan("Tab 1")), frameWith([run("other")]));
    expect(cat(s, "font")).toEqual({ pass: 0, total: 1 });
    expect(cat(s, "textAttrs")).toEqual({ pass: 0, total: 1 });
    expect(cat(s, "color")).toEqual({ pass: 0, total: 1 });
  });
});

describe("scoring: font + textAttrs + color per tspan", () => {
  const refOne = (attrs: string, text = "Hi") =>
    svgPage(`<svg:text x="72" y="108">\n${tspan(text, attrs)}\n</svg:text>`);
  const frameWith = (runs: TextRun[]) => doc([textFrame("t1", 1, 1, 2, 0.5, runs)]);

  it("matches families remap-aware: direct name or the table's mappedTo", () => {
    const helv = 'font-family="HelveticaNeueLT Pro 55 Roman" font-size="0.1667" fill="#000000"';
    expect(cat(score(refOne(helv), frameWith([run("Hi", { family: "Libre Franklin" })])), "font")).toEqual({ pass: 1, total: 1 });
    expect(cat(score(refOne(helv), frameWith([run("Hi", { family: "Arial" })])), "font")).toEqual({ pass: 0, total: 1 });
  });

  it("checks size within ±0.5pt of the inch-denominated reference size", () => {
    // ref 0.1667in = 12.0024pt
    expect(cat(score(refOne('font-family="Calibri" font-size="0.1667" fill="#000000"'), frameWith([run("Hi", { size: 12 })])), "textAttrs")).toEqual({ pass: 1, total: 1 });
    expect(cat(score(refOne('font-family="Calibri" font-size="0.1667" fill="#000000"'), frameWith([run("Hi", { size: 13 })])), "textAttrs")).toEqual({ pass: 0, total: 1 });
  });

  it("checks bold only when the reference tspan declares font-weight", () => {
    const bold = 'font-family="Calibri" font-weight="bold" font-size="0.1667" fill="#000000"';
    const plain = 'font-family="Calibri" font-size="0.1667" fill="#000000"';
    expect(cat(score(refOne(bold), frameWith([run("Hi", { bold: true })])), "textAttrs")).toEqual({ pass: 1, total: 1 });
    expect(cat(score(refOne(bold), frameWith([run("Hi")])), "textAttrs")).toEqual({ pass: 0, total: 1 });
    // attr absent → bold unchecked either way
    expect(cat(score(refOne(plain), frameWith([run("Hi", { bold: true })])), "textAttrs")).toEqual({ pass: 1, total: 1 });
  });

  it("checks italic when the reference tspan declares font-style", () => {
    const italic = 'font-family="Calibri" font-style="italic" font-size="0.1667" fill="#000000"';
    expect(cat(score(refOne(italic), frameWith([run("Hi", { italic: true })])), "textAttrs")).toEqual({ pass: 1, total: 1 });
    expect(cat(score(refOne(italic), frameWith([run("Hi")])), "textAttrs")).toEqual({ pass: 0, total: 1 });
  });

  it("compares tspan fill against run ink color, case-insensitively", () => {
    const white = 'font-family="Calibri" font-size="0.1667" fill="#FFFFFF"';
    expect(cat(score(refOne(white), frameWith([run("Hi", { color: "#ffffff" })])), "color")).toEqual({ pass: 1, total: 1 });
    expect(cat(score(refOne(white), frameWith([run("Hi", { color: "#000000" })])), "color")).toEqual({ pass: 0, total: 1 });
  });

  it("scores a mixed-style text per tspan against the aligned runs", () => {
    const body =
      `<svg:text x="72" y="108">\n` +
      tspan("light ", 'font-family="Calibri" font-size="0.1667" fill="#000000"') +
      `\n` +
      tspan("dark", 'font-family="Calibri" font-size="0.2500" fill="#ff0000"') +
      `\n</svg:text>`;
    const s = score(
      svgPage(body),
      doc([textFrame("t1", 1, 1, 2, 0.5, [run("light "), run("dark", { size: 18, color: "#ff0000" })])]),
    );
    expect(cat(s, "textAttrs")).toEqual({ pass: 2, total: 2 });
    expect(cat(s, "color")).toEqual({ pass: 2, total: 2 });
    // now break only the second tspan's size
    const s2 = score(
      svgPage(body),
      doc([textFrame("t1", 1, 1, 2, 0.5, [run("light "), run("dark", { size: 12, color: "#ff0000" })])]),
    );
    expect(cat(s2, "textAttrs")).toEqual({ pass: 1, total: 2 });
  });
});

describe("scoring: text matching is content-first", () => {
  it("pairs by content before proximity, so swapped frames still reconcile", () => {
    // ref: "alpha" at the top, "beta" at the bottom; doc frames swapped —
    // proximity alone would cross-match them.
    const body =
      `<svg:text x="72" y="93.6">\n${tspan("alpha")}\n</svg:text>\n` +
      `<svg:text x="72" y="669.6">\n${tspan("beta")}\n</svg:text>`;
    const d = doc([
      textFrame("bottom-alpha", 1, 9, 2, 0.4, [run("alpha")]),
      textFrame("top-beta", 1, 1, 2, 0.4, [run("beta")]),
    ]);
    const s = score(svgPage(body), d);
    expect(cat(s, "textFlow")).toEqual({ pass: 2, total: 2 });
    // …and position honestly reports both anchors landing outside their
    // content-matched frames.
    expect(cat(s, "position")).toEqual({ pass: 0, total: 2 });
  });

  it("an unmatched reference text fails every applicable category", () => {
    const s = score(svgPage(`<svg:text x="72" y="108">\n${tspan("orphan")}\n</svg:text>`), doc([]));
    expect(cat(s, "position")).toEqual({ pass: 0, total: 1 });
    expect(cat(s, "textFlow")).toEqual({ pass: 0, total: 1 });
    expect(cat(s, "font")).toEqual({ pass: 0, total: 1 });
    expect(cat(s, "textAttrs")).toEqual({ pass: 0, total: 1 });
    expect(cat(s, "color")).toEqual({ pass: 0, total: 1 });
    expect(s.unmatched).toBe(1);
  });
});

describe("scoring: images", () => {
  const patternPage = (payloadB64: string) =>
    svgPage(
      `<svg:defs>\n<svg:pattern id="img1" patternUnits="userSpaceOnUse" width="100" height="100">\n` +
        `<svg:image x="0" y="0" width="100" height="100" xlink:href="data:image/png;base64,${payloadB64}"/>\n` +
        `</svg:pattern>\n</svg:defs>\n` +
        `<svg:polygon points="72.0000 72.0000, 144.0000 72.0000, 144.0000 144.0000, 72.0000 144.0000, 72.0000 72.0000"\nstyle="fill: url(#img1); "/>`,
    );
  const blobs: ImportAssetsPayload = { a1: { mime: "image/png", dataB64: b64("PNGBYTES") } };

  it("passes when the pattern bytes match an asset and the frame geometry lands", () => {
    const s = score(patternPage(b64("PNGBYTES")), doc([picture("pic1", 1, 1, 1, 1, "a1")]), blobs);
    expect(cat(s, "images")).toEqual({ pass: 2, total: 2 }); // pattern + page parity
    expect(cat(s, "position")).toEqual({ pass: 1, total: 1 });
  });

  it("fails on byte mismatch even when the geometry lands", () => {
    const s = score(patternPage(b64("OTHERBYTES")), doc([picture("pic1", 1, 1, 1, 1, "a1")]), blobs);
    expect(cat(s, "images")).toEqual({ pass: 1, total: 2 }); // parity still holds
  });

  it("fails on a placeholder frame with no asset behind it", () => {
    const s = score(patternPage(b64("PNGBYTES")), doc([picture("pic1", 1, 1, 1, 1)]), blobs);
    expect(cat(s, "images")).toEqual({ pass: 1, total: 2 });
  });

  it("fails count parity in both directions", () => {
    // ref has a pattern, doc has no picture frame
    const none = score(patternPage(b64("PNGBYTES")), doc([]), blobs);
    expect(cat(none, "images")).toEqual({ pass: 0, total: 2 });
    expect(none.unmatched).toBe(1);
    // doc has a picture frame the reference doesn't
    const stray = score(svgPage(""), doc([picture("pic1", 1, 1, 1, 1, "a1")]), blobs);
    expect(cat(stray, "images")).toEqual({ pass: 0, total: 1 });
    expect(stray.extras).toBe(1);
  });
});

describe("computeFidelity + formatScorecard", () => {
  it("combines per-file tallies and renders counts for every category", () => {
    const inputs = [
      { name: "a", refPages: parseReferencePages(svgPage("")), doc: doc([]), blobs: {} },
      { name: "b", refPages: parseReferencePages(svgPage("")), doc: doc([], { w: 5, h: 5 }), blobs: {} },
    ];
    const card = computeFidelity(inputs);
    expect(card.combined.pageSize).toEqual({ pass: 1, total: 2 });
    expect(categoryRatio(card.combined.pageSize)).toBe(0.5);
    expect(categoryRatio({ pass: 0, total: 0 })).toBe(1); // vacuous = no penalty
    const table = formatScorecard(card);
    expect(table).toContain("pageSize");
    expect(table).toContain("1/2");
    expect(table).toContain("MISS");
  });
});
