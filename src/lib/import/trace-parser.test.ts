import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePropList, parseTrace, toInches, toMultiplier, toNumber, toPoints } from "./trace-parser";

const golden = readFileSync(join(process.cwd(), "fixtures/pub-traces/demo-flyer.trace"), "utf8");

describe("parseTrace against the librevenge golden (plan P1)", () => {
  const events = parseTrace(golden);

  it("reads the full callback sequence", () => {
    expect(events[0]).toEqual({ name: "startDocument", props: {} });
    expect(events.at(-1)).toEqual({ name: "endDocument", props: {} });
    expect(events.filter((e) => e.name === "startPage")).toHaveLength(2);
    expect(events.filter((e) => e.name === "drawRectangle")).toHaveLength(4);
    expect(events.filter((e) => e.name === "startTextObject")).toHaveLength(3);
  });

  it("tolerates both spacing forms (`drawRectangle (` and `setStyle(`)", () => {
    const rect = events.find((e) => e.name === "drawRectangle");
    const style = events.find((e) => e.name === "setStyle");
    expect(rect && "props" in rect && rect.props["svg:x"]).toBe("0.5000in");
    expect(style && "props" in style && style.props["draw:fill"]).toBe("solid");
  });

  it("parses page geometry with units", () => {
    const page = events.find((e) => e.name === "startPage");
    if (!page || !("props" in page)) throw new Error("no startPage");
    expect(toInches(page.props["svg:width"])).toBe(8.5);
    expect(toInches(page.props["svg:height"])).toBe(11);
  });

  it("parses nested vectors (svg:points, svg:d)", () => {
    const poly = events.find((e) => e.name === "drawPolygon");
    if (!poly || !("props" in poly)) throw new Error("no drawPolygon");
    const pts = poly.props["svg:points"];
    expect(Array.isArray(pts) && pts).toHaveLength(10);
    if (!Array.isArray(pts)) throw new Error("points not a vector");
    expect(toInches(pts[0]["svg:x"])).toBe(6);

    const path = events.find((e) => e.name === "drawPath");
    if (!path || !("props" in path)) throw new Error("no drawPath");
    const segs = path.props["svg:d"];
    if (!Array.isArray(segs)) throw new Error("d not a vector");
    expect(segs.map((s) => s["librevenge:path-action"])).toEqual(["M", "C", "Z"]);
    expect(toInches(segs[1]["svg:x1"])).toBe(1.5);
  });

  it("keeps insertText payloads verbatim, including commas", () => {
    const texts = events.filter((e) => e.name === "insertText").map((e) => ("text" in e ? e.text : ""));
    expect(texts).toContain("GRAND OPENING");
    expect(texts).toContain("Anytown, USA 01234");
    expect(texts).toContain("Join us Saturday for our ");
  });

  it("parses insertText payloads containing parentheses", () => {
    const [ev] = parseTrace("insertText (Sale (today only), 50% off)");
    expect(ev).toEqual({ name: "insertText", text: "Sale (today only), 50% off" });
  });

  it("reads bare callbacks (closeSpan, insertLineBreak)", () => {
    expect(events.some((e) => e.name === "closeSpan")).toBe(true);
    expect(events.some((e) => e.name === "insertLineBreak")).toBe(true);
  });

  it("scalar values may contain spaces (font names)", () => {
    const span = events.find(
      (e) => e.name === "openSpan" && "props" in e && e.props["style:font-name"] === "Times New Roman"
    );
    expect(span).toBeDefined();
  });

  it("reads binary data without choking (base64 scalar)", () => {
    const img = events.find((e) => e.name === "drawGraphicObject");
    if (!img || !("props" in img)) throw new Error("no drawGraphicObject");
    expect(img.props["librevenge:mime-type"]).toBe("image/png");
    expect(typeof img.props["office:binary-data"]).toBe("string");
  });
});

describe("numeric coercions (librevenge print formats)", () => {
  it("toInches converts units", () => {
    expect(toInches("8.5000in")).toBe(8.5);
    expect(toInches("72.0000pt")).toBe(1);
    expect(toInches("25.4000mm")).toBeCloseTo(1, 10);
    expect(toInches("2.5400cm")).toBeCloseTo(1, 10);
    expect(toInches("96.0000px")).toBe(1);
    expect(toInches("nonsense")).toBeUndefined();
    expect(toInches(undefined)).toBeUndefined();
  });

  it("toNumber ignores the bogus unit on librevenge:rotate", () => {
    expect(toNumber("15.0000in")).toBe(15);
    expect(toNumber("-90.0000in")).toBe(-90);
  });

  it("toMultiplier reads percents", () => {
    expect(toMultiplier("119.0000%")).toBeCloseTo(1.19, 10);
    expect(toMultiplier("12.0000pt")).toBeUndefined();
  });

  it("toPoints reads font sizes", () => {
    expect(toPoints("48.0000pt")).toBe(48);
  });
});

describe("parsePropList edge cases", () => {
  it("handles empty input", () => {
    expect(parsePropList("")).toEqual({});
  });

  it("does not split scalars on commas that don't start a key", () => {
    const props = parsePropList("style:font-name: Foo, draw:fill: solid");
    expect(props["style:font-name"]).toBe("Foo");
    expect(props["draw:fill"]).toBe("solid");
  });
});
