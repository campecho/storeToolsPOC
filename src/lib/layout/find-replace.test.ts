import { describe, it, expect } from "vitest";
import type { FrameObject, LayoutDocument, Paragraph } from "@/lib/schema";
import { BASE_LAYER_ID, baseLayerDef } from "@/lib/schema";
import { findMatches, replaceInDoc } from "./find-replace";

const font = { family: "Motiva Sans", size: 11, bold: false, italic: false, underline: false };
const para = (texts: string[]): Paragraph => ({
  align: "left",
  lineSpacing: 1.2,
  runs: texts.map((text) => ({ text, font, color: "#111" })),
});
const frame = (id: string, paragraphs: Paragraph[]): FrameObject => ({
  id,
  type: "text",
  x: 1,
  y: 1,
  w: 3,
  h: 1,
  rotation: 0,
  locked: false,
  fill: null,
  stroke: null,
  text: { paragraphs },
});

function doc(frames: FrameObject[], masterFrames: FrameObject[] = []): LayoutDocument {
  return {
    version: 3,
    name: "t",
    product: null,
    size: { w: 8.5, h: 11 },
    orientation: "portrait",
    bleed: 0,
    margin: 0.5,
    columns: 1,
    layers: [baseLayerDef()],
    pages: [{ id: "p1", masterId: null, layers: [{ layerId: BASE_LAYER_ID, objects: frames }] }],
    masters: masterFrames.length ? [{ id: "m1", label: "A", objects: masterFrames }] : [],
    assets: {},
    guides: { v: [], h: [] },
  };
}

describe("findMatches", () => {
  it("counts hits per frame, case-insensitively by default, with a snippet", () => {
    const d = doc([frame("a", [para(["John met john at the John desk"])])]);
    const r = findMatches(d, "john");
    expect(r.total).toBe(3);
    expect(r.matches[0]).toMatchObject({ objectId: "a", where: "Page 1 - Text Frame", count: 3 });
    expect(r.matches[0].snippet).toContain("John");
  });

  it("match case narrows; GREP mode uses real regex; invalid patterns report", () => {
    const d = doc([frame("a", [para(["John john JOHN"])])]);
    expect(findMatches(d, "John", { matchCase: true }).total).toBe(1);
    expect(findMatches(d, "Jo(h)n", { regex: true }).total).toBe(3);
    const bad = findMatches(d, "Jo(hn", { regex: true });
    expect(bad.error).toBeTruthy();
    expect(bad.total).toBe(0);
  });

  it("covers masters and reports their label", () => {
    const d = doc([], [frame("m", [para(["Helvetica forever"])])]);
    const r = findMatches(d, "Helvetica");
    expect(r.matches[0].where).toBe("Master A");
  });
});

describe("replaceInDoc", () => {
  it("replaces inside runs, keeping run boundaries and styles", () => {
    const d = doc([frame("a", [para(["John ", "and John"])])]);
    const { doc: next, replaced } = replaceInDoc(d, "John", "Doe");
    expect(replaced).toBe(2);
    const t = (next.pages[0].layers[0].objects[0] as FrameObject).text!;
    expect(t.paragraphs[0].runs.map((r) => r.text)).toEqual(["Doe ", "and Doe"]);
  });

  it("GREP capture groups substitute", () => {
    const d = doc([frame("a", [para(["order 123 and order 456"])])]);
    const { doc: next, replaced } = replaceInDoc(d, "order (\\d+)", "job #$1", { regex: true });
    expect(replaced).toBe(2);
    const t = (next.pages[0].layers[0].objects[0] as FrameObject).text!;
    expect(t.paragraphs[0].runs[0].text).toBe("job #123 and job #456");
  });

  it("no hits returns the same document object", () => {
    const d = doc([frame("a", [para(["nothing here"])])]);
    expect(replaceInDoc(d, "absent", "x").doc).toBe(d);
  });
});
