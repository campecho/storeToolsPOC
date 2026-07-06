import { describe, expect, it } from "vitest";
import type { FrameObject, LayoutDocument, TextProps } from "@/schema";
import { createDefaultDocument } from "@/store";
import { isOverflowing, ptToPx } from "@/lib/layout/text";
import {
  AUTOFIT_MIN_SCALE,
  collectOversetIds,
  computeAutofit,
  contentBoxPx,
  importedTextFrames,
  isEmptyText,
  type OverflowProbe,
} from "./overset";

/**
 * Unit coverage for the overset check's PURE pieces (overset.ts) — inset math,
 * the px content-box budget, the overflow threshold, frame selection, and the
 * autofit SCAN (driven through an injected overflow probe, so its decision
 * logic is exercised without a browser). The DOM measurement itself
 * (measureFrameOverflow's scrollHeight read) needs a browser, so it runs at
 * runtime, not here; the node env only asserts the logic that decides what to
 * measure and how the verdict is framed.
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

describe("computeAutofit (the shrink-to-fit scan, via an injected probe)", () => {
  // Build a real LayoutDocument (computeAutofit only reads doc.pages) with the
  // given text frames, one page per array.
  const docPages = (...pages: FrameObject[][]): LayoutDocument => {
    const base = createDefaultDocument();
    return {
      ...base,
      pages: pages.map((objects, i) => ({ id: `page-${i + 1}`, masterId: "master-a", objects })),
    };
  };
  const docWith = (...objs: FrameObject[]): LayoutDocument => docPages(objs);

  // A frame carrying a stored autofit scale (the convergence input).
  const scaledFrame = (id: string, scale: number): FrameObject =>
    frame(id, { text: { paragraphs: [para("x")], fontScale: scale } });

  // Overflow probe that fits at scale `at` and anything smaller — i.e. it still
  // overflows while the trial scale is larger than `at`. Independent of the
  // frame, so the scan's absolute grid is what drives the pick.
  const overflowingAbove =
    (at: number): OverflowProbe =>
    (_frame, scale) =>
      scale > at;

  it("picks the largest 1%-quantized scale that fits", () => {
    const { entries, overset } = computeAutofit(docWith(frame("f1")), {
      measure: overflowingAbove(0.93),
    });
    expect(entries).toEqual([{ objectId: "f1", scale: 0.93 }]);
    expect(overset).toEqual([]);
  });

  it("quantizes to the 1% grid — a between-steps fit rounds down to the next fitting step", () => {
    // fits only below 0.925; the grid's next fitting step is 0.92, never 0.925.
    const { entries } = computeAutofit(docWith(frame("f1")), {
      measure: overflowingAbove(0.925),
    });
    expect(entries).toEqual([{ objectId: "f1", scale: 0.92 }]);
  });

  it("fits at declared size with no stored scale → not a candidate, no entry", () => {
    const { entries, overset } = computeAutofit(docWith(frame("f1")), { measure: () => false });
    expect(entries).toEqual([]);
    expect(overset).toEqual([]);
  });

  it("fits at 1 but carried a stale scale → converges back to 1 (clears the scale)", () => {
    const { entries, overset } = computeAutofit(docWith(scaledFrame("f1", 0.9)), {
      measure: () => false,
    });
    expect(entries).toEqual([{ objectId: "f1", scale: 1 }]);
    expect(overset).toEqual([]);
  });

  it("overflows even at the floor → declared size (scale 1) AND badged in overset", () => {
    const { entries, overset } = computeAutofit(docWith(frame("f1")), { measure: () => true });
    expect(entries).toEqual([{ objectId: "f1", scale: 1 }]);
    expect(overset).toEqual(["f1"]);
  });

  it("respects the floor band boundary: fits at 0.88 rescued, needs 0.87 badged", () => {
    const rescued = computeAutofit(docWith(frame("f1")), {
      measure: overflowingAbove(AUTOFIT_MIN_SCALE), // fits exactly at the floor
    });
    expect(rescued.entries).toEqual([{ objectId: "f1", scale: AUTOFIT_MIN_SCALE }]);
    expect(rescued.overset).toEqual([]);

    const badged = computeAutofit(docWith(frame("f1")), {
      measure: overflowingAbove(0.87), // one step past the floor
    });
    expect(badged.entries).toEqual([{ objectId: "f1", scale: 1 }]);
    expect(badged.overset).toEqual(["f1"]);
  });

  it("probes from the declared size down — never compounds a frame's stored scale", () => {
    // A frame stored at 0.9 is re-measured from DECLARED sizes: the scan feeds
    // absolute scales starting at 1.00, so 0.9 never shifts the grid. (The DOM
    // measurer likewise takes the scale as an explicit arg — covered at runtime.)
    const seen: number[] = [];
    computeAutofit(docWith(scaledFrame("f1", 0.9)), {
      measure: (_f, s) => {
        seen.push(s);
        return s > 0.9; // fits at 0.90
      },
    });
    expect(seen[0]).toBe(1); // starts at declared 1.00, not the stored 0.9
    expect(seen).toEqual([1, 0.99, 0.98, 0.97, 0.96, 0.95, 0.94, 0.93, 0.92, 0.91, 0.9]);
  });

  it("a stored scale doesn't shift the pick — two frames, same probe, same result", () => {
    const { entries } = computeAutofit(docWith(scaledFrame("a", 0.9), scaledFrame("b", 0.95)), {
      measure: overflowingAbove(0.94),
    });
    expect(entries).toEqual([
      { objectId: "a", scale: 0.94 },
      { objectId: "b", scale: 0.94 },
    ]);
  });

  it("entries cover exactly the candidates, in document (page then object) order", () => {
    const probe: OverflowProbe = (f, s) => {
      switch (f.id) {
        case "shrink":
          return s > 0.95; // overflows at declared, fits at 0.95
        case "badge":
          return true; // never fits
        default:
          return false; // fit-noscale and carry both fit at declared
      }
    };
    const doc = docPages(
      [frame("fit-noscale"), frame("shrink")],
      [scaledFrame("carry", 0.9), frame("badge")],
    );
    const { entries, overset } = computeAutofit(doc, { measure: probe });
    expect(entries).toEqual([
      { objectId: "shrink", scale: 0.95 },
      { objectId: "carry", scale: 1 }, // carried a scale, now fits → converge
      { objectId: "badge", scale: 1 },
    ]);
    expect(overset).toEqual(["badge"]);
    // the frame that fits at declared and carries no scale is left untouched
    expect(entries.map((e) => e.objectId)).not.toContain("fit-noscale");
  });

  it("is deterministic — same input yields an identical result", () => {
    const doc = docWith(frame("a"), scaledFrame("b", 0.9), frame("c"));
    const probe = overflowingAbove(0.93);
    expect(computeAutofit(doc, { measure: probe })).toEqual(
      computeAutofit(doc, { measure: probe }),
    );
  });

  it("no text frames → empty result (returns before touching the DOM)", () => {
    expect(computeAutofit(createDefaultDocument())).toEqual({ entries: [], overset: [] });
  });

  it("is SSR/node-safe: text frames but no DOM and no injected probe → empty", () => {
    // The node env has no `document`; without an injected probe the default
    // measurer can't run, so autofit yields nothing rather than throwing.
    expect(computeAutofit(docWith(frame("f1")))).toEqual({ entries: [], overset: [] });
  });
});
