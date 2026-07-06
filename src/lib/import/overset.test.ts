import { describe, expect, it } from "vitest";
import type { FrameObject, TextProps } from "@/schema";
import { createDefaultDocument } from "@/store";
import { isOverflowing, ptToPx } from "@/lib/layout/text";
import { collectOversetIds, contentBoxPx, importedTextFrames, isEmptyText } from "./overset";

/**
 * Unit coverage for the overset check's PURE pieces (overset.ts) — inset math,
 * the px content-box budget, the overflow threshold, and frame selection. The
 * DOM measurement itself (measureFrameOverflow's scrollHeight read) needs a
 * browser, so it's exercised at runtime, not here; the node env only asserts
 * the logic that decides what to measure and how the verdict is framed.
 */

const RUN = { family: "Arial", size: 12, bold: false, italic: false, underline: false };
const para = (text: string) => ({ align: "left" as const, lineSpacing: 1.2, runs: [{ text, font: RUN, color: "#111111" }] });
const textOf = (...lines: string[]): TextProps => ({ paragraphs: lines.map(para) });

const frame = (id: string, over: Partial<FrameObject> = {}): FrameObject => ({
  id,
  type: "text",
  x: 0,
  y: 0,
  w: 4,
  h: 1,
  rotation: 0,
  locked: false,
  fill: null,
  stroke: null,
  text: textOf("hello"),
  ...over,
});

describe("contentBoxPx (inset subtraction + in→px)", () => {
  it("converts the frame size at 96dpi with no insets", () => {
    // 4in × 1in at zoom 1 → 384 × 96 px
    expect(contentBoxPx({ w: 4, h: 1 }, 1)).toEqual({ width: 384, height: 96 });
  });

  it("subtracts left/right insets from width and top/bottom from height", () => {
    const box = contentBoxPx(
      { w: 4, h: 1, text: { paragraphs: [para("x")], inset: { l: 0.04, r: 0.04, t: 0.04, b: 0.04 } } },
      1,
    );
    // 0.04in inset = 3.84px per side
    expect(box.width).toBeCloseTo(384 - 3.84 - 3.84, 5);
    expect(box.height).toBeCloseTo(96 - 3.84 - 3.84, 5);
  });

  it("treats absent insets as zero, per side", () => {
    const box = contentBoxPx(
      { w: 4, h: 1, text: { paragraphs: [para("x")], inset: { l: 0.5, r: 0, t: 0, b: 0.25 } } },
      1,
    );
    expect(box.width).toBeCloseTo(384 - 48, 5); // only the left inset
    expect(box.height).toBeCloseTo(96 - 24, 5); // only the bottom inset
  });
});

describe("pt→px content sizing", () => {
  it("maps point sizes to px via the shared 96/72 convention", () => {
    // runs are sized in points; 72pt = 1in = 96px at zoom 1
    expect(ptToPx(72, 1)).toBe(96);
    expect(ptToPx(12, 1)).toBe(16);
  });
});

describe("the overflow threshold the verdict uses (isOverflowing)", () => {
  it("only overflows past the subpixel cushion (content taller than budget + 1)", () => {
    const budget = 88.32; // a 1in frame's inset height budget in px
    expect(isOverflowing(budget, budget)).toBe(false); // exactly fits
    expect(isOverflowing(budget + 1, budget)).toBe(false); // within the cushion
    expect(isOverflowing(budget + 1.5, budget)).toBe(true); // genuinely taller
  });
});

describe("isEmptyText (the empty-text short-circuit)", () => {
  it("is empty when every run in every paragraph is blank", () => {
    expect(isEmptyText(textOf(""))).toBe(true);
    expect(isEmptyText({ paragraphs: [para(""), para("")] })).toBe(true);
  });

  it("is not empty once any run carries text", () => {
    expect(isEmptyText(textOf("hi"))).toBe(false);
    expect(isEmptyText({ paragraphs: [para(""), para("second line")] })).toBe(false);
  });
});

describe("importedTextFrames + collectOversetIds (no text / no frames → empty ids)", () => {
  it("picks only text frames, across all pages", () => {
    const doc = {
      pages: [
        { objects: [frame("t1"), { ...frame("r1"), type: "rect" as const, text: undefined }] },
        { objects: [frame("t2")] },
      ],
    };
    expect(importedTextFrames(doc).map((f) => f.id)).toEqual(["t1", "t2"]);
  });

  it("finds no frames in a document without text", () => {
    const doc = {
      pages: [
        { objects: [{ ...frame("r1"), type: "rect" as const, text: undefined }] },
        { objects: [] },
      ],
    };
    expect(importedTextFrames(doc)).toEqual([]);
  });

  it("collects no ids when there are no text frames to measure", () => {
    // a pristine document has no text frames → returns before touching the DOM
    expect(collectOversetIds(createDefaultDocument())).toEqual([]);
  });
});
