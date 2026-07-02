import { describe, it, expect } from "vitest";
import {
  MIN_OBJECT_IN,
  NUDGE_IN,
  bboxOf,
  createFrame,
  createLine,
  createTextFrame,
  resizeBBox,
  translated,
  withBBox,
} from "./objects";

describe("factories", () => {
  it("frames get wireframe-language defaults and respect the minimum size", () => {
    const r = createFrame("rect", 1, 2, 3, 4);
    expect(r).toMatchObject({ type: "rect", x: 1, y: 2, w: 3, h: 4, rotation: 0, locked: false });
    expect(r.fill).toBe("#f2f2f2");
    expect(r.stroke).toEqual({ color: "#8f8f8f", width: 1 });
    expect(createFrame("rect", 0, 0, 0.001, 0.001).w).toBe(MIN_OBJECT_IN);
  });

  it("pictures are the gray placeholder frame", () => {
    expect(createFrame("picture", 0, 0, 2, 2).fill).toBe("#e8e8e8");
  });

  it("lines keep endpoint geometry", () => {
    const l = createLine(1, 1, 4, 3);
    expect(l).toMatchObject({ type: "line", x1: 1, y1: 1, x2: 4, y2: 3 });
  });

  it("text frames are transparent with the wire's typographic defaults", () => {
    const t = createTextFrame(1, 2, 3, 1);
    expect(t).toMatchObject({ type: "text", fill: null, stroke: null });
    expect(t.text).toEqual({
      content: "",
      font: { family: "Motiva Sans", size: 11, bold: false, italic: false, underline: false },
      align: "left",
      lineSpacing: 1.2,
    });
  });

  it("every object gets a unique id", () => {
    expect(createFrame("rect", 0, 0, 1, 1).id).not.toBe(createFrame("rect", 0, 0, 1, 1).id);
  });
});

describe("bbox math", () => {
  it("a line's bbox spans its endpoints regardless of direction", () => {
    expect(bboxOf(createLine(4, 3, 1, 1))).toEqual({ x: 1, y: 1, w: 3, h: 2 });
  });

  it("withBBox round-trips a frame", () => {
    const r = createFrame("rect", 1, 1, 2, 2);
    const moved = withBBox(r, { x: 3, y: 4, w: 5, h: 6 });
    expect(bboxOf(moved)).toEqual({ x: 3, y: 4, w: 5, h: 6 });
  });

  it("withBBox maps line endpoints proportionally", () => {
    const l = createLine(1, 1, 3, 2); // bbox 1,1 2×1
    const next = withBBox(l, { x: 1, y: 1, w: 4, h: 2 });
    expect(next.type === "line" && next.x2).toBe(5);
    expect(next.type === "line" && next.y2).toBe(3);
  });

  it("translated shifts frames and both line endpoints", () => {
    expect(translated(createFrame("rect", 1, 1, 2, 2), NUDGE_IN, 0).x).toBeCloseTo(1 + 1 / 32, 10);
    const l = translated(createLine(0, 0, 1, 1), 0.5, 0.25);
    expect([l.x1, l.y1, l.x2, l.y2]).toEqual([0.5, 0.25, 1.5, 1.25]);
  });
});

describe("resizeBBox", () => {
  const start = { x: 1, y: 1, w: 2, h: 1 };

  it("drags the se corner freely", () => {
    expect(resizeBBox(start, "se", 1, 0.5)).toEqual({ x: 1, y: 1, w: 3, h: 1.5 });
  });

  it("anchors the opposite edge when dragging nw", () => {
    const b = resizeBBox(start, "nw", 0.5, 0.25);
    expect(b).toEqual({ x: 1.5, y: 1.25, w: 1.5, h: 0.75 });
    // the se corner stayed put
    expect(b.x + b.w).toBeCloseTo(start.x + start.w, 10);
    expect(b.y + b.h).toBeCloseTo(start.y + start.h, 10);
  });

  it("edge handles move one axis only", () => {
    expect(resizeBBox(start, "e", 1, 99)).toEqual({ x: 1, y: 1, w: 3, h: 1 });
    expect(resizeBBox(start, "n", 99, -0.5)).toEqual({ x: 1, y: 0.5, w: 2, h: 1.5 });
  });

  it("clamps at the minimum without drifting the anchor", () => {
    const b = resizeBBox(start, "w", 5, 0); // drag right edge past collapse
    expect(b.w).toBe(MIN_OBJECT_IN);
    expect(b.x + b.w).toBeCloseTo(start.x + start.w, 10);
  });

  it("Shift on a corner preserves the aspect ratio via the dominant axis", () => {
    const b = resizeBBox(start, "se", 2, 0, true); // w doubles → h follows
    expect(b.w / b.h).toBeCloseTo(start.w / start.h, 10);
    expect(b.w).toBe(4);
    expect(b.h).toBe(2);
  });

  it("Shift-nw re-anchors so the se corner stays fixed", () => {
    const b = resizeBBox(start, "nw", -2, 0, true);
    expect(b.w / b.h).toBeCloseTo(2, 10);
    expect(b.x + b.w).toBeCloseTo(start.x + start.w, 10);
    expect(b.y + b.h).toBeCloseTo(start.y + start.h, 10);
  });
});
