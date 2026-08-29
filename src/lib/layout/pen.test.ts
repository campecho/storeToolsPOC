import { describe, expect, it } from "vitest";
import { FrameObjectSchema } from "@/schema";
import { mirrorPoint, penDraftSegments, penObjectFromDraft, type PenAnchor } from "./pen";

/**
 * Pen draft → committed path object (merged from the publisher prototype's
 * pen.ts): straight anchors chain as L segments, curve anchors as cubics
 * with mirrored handles, and the committed object normalizes every
 * coordinate — control points included — into the control hull's box.
 */

const straight = (x: number, y: number): PenAnchor => ({ point: { x, y } });

const curved = (x: number, y: number, ox: number, oy: number): PenAnchor => ({
  point: { x, y },
  handleOut: { x: ox, y: oy },
  handleIn: mirrorPoint({ x: ox, y: oy }, { x, y }),
});

describe("mirrorPoint", () => {
  it("reflects a handle about its anchor", () => {
    expect(mirrorPoint({ x: 3, y: 1 }, { x: 2, y: 2 })).toEqual({ x: 1, y: 3 });
  });
});

describe("penDraftSegments", () => {
  it("renders nothing for an empty draft and just the M for one anchor", () => {
    expect(penDraftSegments([])).toEqual([]);
    expect(penDraftSegments([straight(1, 1)])).toEqual([{ c: "M", x: 1, y: 1 }]);
  });

  it("chains straight anchors as L segments", () => {
    expect(penDraftSegments([straight(1, 1), straight(3, 1), straight(3, 2)])).toEqual([
      { c: "M", x: 1, y: 1 },
      { c: "L", x: 3, y: 1 },
      { c: "L", x: 3, y: 2 },
    ]);
  });

  it("draws a cubic into an anchor when either adjoining handle exists", () => {
    const segs = penDraftSegments([curved(1, 1, 2, 0), straight(3, 1)]);
    // from's handleOut exists, to has no handleIn — the missing control
    // degenerates to its endpoint
    expect(segs[1]).toEqual({ c: "C", x1: 2, y1: 0, x2: 3, y2: 1, x: 3, y: 1 });
  });
});

describe("penObjectFromDraft", () => {
  it("returns null under 2 anchors open / 3 closed, and for a degenerate box", () => {
    expect(penObjectFromDraft([straight(1, 1)], false)).toBeNull();
    expect(penObjectFromDraft([straight(1, 1), straight(2, 2)], true)).toBeNull();
    // axis-collinear: zero height — the line tool's job
    expect(penObjectFromDraft([straight(1, 1), straight(3, 1)], false)).toBeNull();
  });

  it("frames the object on the control hull's bounding box, segments normalized 0–1", () => {
    const obj = penObjectFromDraft([straight(1, 1), straight(3, 1), straight(3, 2)], false);
    expect(obj).not.toBeNull();
    expect(obj).toMatchObject({ type: "path", x: 1, y: 1, w: 2, h: 1 });
    expect(obj?.d).toEqual([
      { c: "M", x: 0, y: 0 },
      { c: "L", x: 1, y: 0 },
      { c: "L", x: 1, y: 1 },
    ]);
  });

  it("closes a ring with the closing segment and Z", () => {
    const obj = penObjectFromDraft([straight(1, 1), straight(3, 1), straight(3, 2)], true);
    expect(obj?.d?.slice(-2)).toEqual([{ c: "L", x: 0, y: 0 }, { c: "Z" }]);
  });

  it("takes curve control points into the box, so normalized coords stay within 0–1", () => {
    const obj = penObjectFromDraft([curved(1, 1, 2, 0), straight(3, 1), straight(2, 2)], false);
    expect(obj).not.toBeNull();
    for (const seg of obj?.d ?? []) {
      if (seg.c === "Z") continue;
      const coords = seg.c === "C" ? [seg.x1, seg.y1, seg.x2, seg.y2, seg.x, seg.y] : [seg.x, seg.y];
      for (const v of coords) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("emits an object the document schema accepts", () => {
    const obj = penObjectFromDraft([straight(1, 1), straight(3, 1), straight(3, 2)], true);
    expect(FrameObjectSchema.safeParse(obj).success).toBe(true);
  });
});
