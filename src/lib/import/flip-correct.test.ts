import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FrameObject, LayoutDocument, LayoutObject } from "@/schema";
import type { EscherShapeTransform } from "./escher";
import { extractShapeTransforms } from "./escher";
import { applyFlipCorrections } from "./flip-correct";
import type { MapResult } from "./mapper";
import { mapToLayoutDocument } from "./mapper";
import { buildModel } from "./model";
import { parseTrace } from "./trace-parser";

/**
 * Unit + integration proof for flip correction (flip-correct.ts). The unit
 * lane builds synthetic MapResults and Escher shapes to pin every rule:
 * correlate-by-geometry, correct-to-TRUE-rotation, many-frames↔one-master,
 * authored-180 stays, non-text never touched, fidelity counts untouched,
 * honest no-op when there is nothing to correlate. The integration lane runs
 * the real ecl_workbook trace + `.pub` through the exact route path and pins
 * the headline number: all 56 folded frames restored upright, and zero
 * corrections anywhere else in the corpus.
 */

/* ── Synthetic builders ── */

const PAGE_W = 8.5;
const PAGE_H = 11;

const textFrame = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
): FrameObject => ({
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
  text: {
    paragraphs: [
      {
        align: "left",
        lineSpacing: 1.19,
        runs: [
          {
            text: "flip me",
            font: { family: "Arimo", size: 11, bold: false, italic: false, underline: false },
            color: "#111111",
          },
        ],
      },
    ],
  },
});

const rectFrame = (id: string, x: number, y: number, w: number, h: number, rotation: number): FrameObject => ({
  id,
  type: "rect",
  x,
  y,
  w,
  h,
  rotation,
  locked: false,
  fill: "#cccccc",
  stroke: null,
});

const makeResult = (pageObjects: LayoutObject[][]): MapResult => {
  const doc: LayoutDocument = {
    version: 2,
    name: "synthetic",
    product: null,
    size: { w: PAGE_W, h: PAGE_H },
    orientation: "portrait",
    bleed: 0,
    margin: 0.5,
    columns: 1,
    pages: pageObjects.map((objects, i) => ({ id: `imp-p${i + 1}`, masterId: null, objects })),
    masters: [],
    assets: {},
    guides: { v: [], h: [] },
  };
  return {
    doc,
    fidelity: { converted: 5, degraded: 1, flagged: 0 },
    fonts: [],
    notes: [{ tier: 2, message: "pre-existing note" }],
    blobs: {},
  };
};

/** Escher shape whose bbox is the CENTER-RELATIVE image of an absolute frame. */
const escherShape = (
  absX: number,
  absY: number,
  w: number,
  h: number,
  opts: { flipH?: boolean; flipV?: boolean; rotationDeg?: number; spid?: number } = {},
): EscherShapeTransform => ({
  spid: opts.spid ?? 1024,
  flipH: opts.flipH ?? false,
  flipV: opts.flipV ?? false,
  rotationDeg: opts.rotationDeg ?? 0,
  bbox: { x: absX - PAGE_W / 2, y: absY - PAGE_H / 2, w, h },
});

// Flip-restoration notes specifically. kind:"corrected" is now shared with
// other importer corrections (the page-number '#' field substitution also
// emits one), so match the flip message to count only mirrored-box restorations.
const correctedNotes = (r: MapResult) =>
  r.notes.filter((n) => n.kind === "corrected" && n.message.includes("Mirrored text box restored upright"));
const frame = (r: MapResult, pageIdx: number, objIdx: number) => r.doc.pages[pageIdx].objects[objIdx] as FrameObject;

/* ── Unit lane ── */

describe("flip-correct: synthetic corrections", () => {
  it("corrects a correlated HV-flipped frame from 180 to 0 and adds one note", () => {
    const result = makeResult([[textFrame("t1", 2, 3, 4, 1, 180)]]);
    const out = applyFlipCorrections(result, [escherShape(2, 3, 4, 1, { flipH: true, flipV: true })]);

    expect(frame(out, 0, 0).rotation).toBe(0);
    const notes = correctedNotes(out);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({
      kind: "corrected",
      tier: 2,
      objectId: "t1",
      pageId: "imp-p1",
      message: "Mirrored text box restored upright — Publisher renders text in flipped boxes right-side up.",
    });
    // The pre-existing note survives, and fidelity counts are NOT touched —
    // a correction is not a degradation.
    expect(out.notes[0]).toEqual({ tier: 2, message: "pre-existing note" });
    expect(out.fidelity).toEqual(result.fidelity);
  });

  it("restores the shape's TRUE rotation, not blindly zero (V-only flip)", () => {
    const result = makeResult([[textFrame("t1", 1, 1, 2, 0.5, 180)]]);
    const out = applyFlipCorrections(result, [escherShape(1, 1, 2, 0.5, { flipV: true, rotationDeg: 90 })]);
    expect(frame(out, 0, 0).rotation).toBe(90);
    expect(correctedNotes(out)).toHaveLength(1);
  });

  it("normalizes the restored rotation into [0, 360)", () => {
    const result = makeResult([[textFrame("t1", 1, 1, 2, 0.5, 180)]]);
    const out = applyFlipCorrections(result, [escherShape(1, 1, 2, 0.5, { flipH: true, rotationDeg: 450 })]);
    expect(frame(out, 0, 0).rotation).toBe(90);
  });

  it("leaves an uncorrelated 180° frame untouched (authored tent card)", () => {
    const result = makeResult([[textFrame("t1", 2, 3, 4, 1, 180)]]);
    // Flipped shape exists but its geometry is elsewhere on the page.
    const out = applyFlipCorrections(result, [escherShape(6, 9, 1, 1, { flipH: true })]);
    expect(frame(out, 0, 0).rotation).toBe(180);
    expect(correctedNotes(out)).toHaveLength(0);
  });

  it("only frames at the 180° fold signature are candidates", () => {
    const result = makeResult([
      [
        textFrame("t1", 2, 3, 4, 1, 179.9), // near, but not folded
        textFrame("t2", 2, 3, 4, 1, 90),
        textFrame("t3", 2, 3, 4, 1, 0),
      ],
    ]);
    const out = applyFlipCorrections(result, [escherShape(2, 3, 4, 1, { flipH: true })]);
    expect(out.doc.pages[0].objects.map((o) => (o as FrameObject).rotation)).toEqual([179.9, 90, 0]);
    expect(correctedNotes(out)).toHaveLength(0);
  });

  it("correlation tolerance: inside 0.05in matches, outside does not", () => {
    // Binary-exact offsets so the ≤ 0.05 comparison is FP-stable:
    // 0.046875 = 3/64 (inside), 0.0625 = 1/16 (outside).
    const inside = makeResult([[textFrame("t1", 2 + 0.046875, 3, 4, 1, 180)]]);
    const outI = applyFlipCorrections(inside, [escherShape(2, 3, 4, 1, { flipH: true })]);
    expect(correctedNotes(outI)).toHaveLength(1);
    expect(frame(outI, 0, 0).rotation).toBe(0);

    const outside = makeResult([[textFrame("t1", 2 + 0.0625, 3, 4, 1, 180)]]);
    const outO = applyFlipCorrections(outside, [escherShape(2, 3, 4, 1, { flipH: true })]);
    expect(correctedNotes(outO)).toHaveLength(0);
    expect(frame(outO, 0, 0).rotation).toBe(180);
  });

  it("size must match too, not just position", () => {
    const result = makeResult([[textFrame("t1", 2, 3, 4, 1, 180)]]);
    const out = applyFlipCorrections(result, [escherShape(2, 3, 4, 2.5, { flipH: true })]);
    expect(correctedNotes(out)).toHaveLength(0);
  });

  it("many frames across pages correlate to ONE master shape (not consumed)", () => {
    const result = makeResult([
      [textFrame("a", 4.1661, 0.5, 3.875, 0.8333, 180)],
      [textFrame("b", 4.1661, 0.5, 3.875, 0.8333, 180)],
      [textFrame("c", 4.1661, 0.5, 3.875, 0.8333, 180), textFrame("d", 1, 9, 2, 1, 180)],
    ]);
    const out = applyFlipCorrections(result, [escherShape(4.1661, 0.5, 3.875, 0.8333, { flipH: true })]);
    expect(frame(out, 0, 0).rotation).toBe(0);
    expect(frame(out, 1, 0).rotation).toBe(0);
    expect(frame(out, 2, 0).rotation).toBe(0);
    expect(frame(out, 2, 1).rotation).toBe(180); // uncorrelated sibling stays
    const notes = correctedNotes(out);
    expect(notes).toHaveLength(3);
    expect(notes.map((n) => n.objectId)).toEqual(["a", "b", "c"]);
    expect(notes.map((n) => n.pageId)).toEqual(["imp-p1", "imp-p2", "imp-p3"]);
  });

  it("never modifies non-text objects, even at 180 with matching geometry", () => {
    const result = makeResult([[rectFrame("r1", 2, 3, 4, 1, 180)]]);
    const out = applyFlipCorrections(result, [escherShape(2, 3, 4, 1, { flipH: true, flipV: true })]);
    expect(frame(out, 0, 0).rotation).toBe(180);
    expect(correctedNotes(out)).toHaveLength(0);
  });

  it("unflipped shapes never anchor a correction", () => {
    const result = makeResult([[textFrame("t1", 2, 3, 4, 1, 180)]]);
    const out = applyFlipCorrections(result, [escherShape(2, 3, 4, 1, { rotationDeg: 0 })]);
    expect(frame(out, 0, 0).rotation).toBe(180);
    expect(correctedNotes(out)).toHaveLength(0);
  });

  it("a flipped shape without a bbox (undecodable anchor) corrects nothing", () => {
    const result = makeResult([[textFrame("t1", 2, 3, 4, 1, 180)]]);
    const noBbox: EscherShapeTransform = { spid: 1, flipH: true, flipV: false, rotationDeg: 0 };
    expect(applyFlipCorrections(result, [noBbox])).toBe(result);
  });

  it("empty shape list returns the result unchanged (same reference)", () => {
    const result = makeResult([[textFrame("t1", 2, 3, 4, 1, 180)]]);
    expect(applyFlipCorrections(result, [])).toBe(result);
  });
});

/* ── Integration lane: the real corpus through the route's exact path ── */

const CORPUS = ["3up_tabs", "bcim_double_cut", "business_card_template_10up", "ecl_workbook", "production_checkpoint_labels"];

/** Parse + map + extract once per file (the ecl trace is 43 MB). */
const imported = (() => {
  const cache = new Map<string, { mapped: MapResult; corrected: MapResult }>();
  return (name: string) => {
    let entry = cache.get(name);
    if (!entry) {
      const trace = readFileSync(join(process.cwd(), "fixtures", "pub-traces", `${name}.trace`), "utf8");
      const pub = new Uint8Array(readFileSync(join(process.cwd(), "fixtures", "pub-corpus", `${name}.pub`)));
      const mapped = mapToLayoutDocument(buildModel(parseTrace(trace)), name);
      const escher = extractShapeTransforms(pub);
      expect(escher.ok).toBe(true);
      const corrected = escher.ok ? applyFlipCorrections(mapped, escher.shapes) : mapped;
      entry = { mapped, corrected };
      cache.set(name, entry);
    }
    return entry;
  };
})();

const textFramesAt180 = (r: MapResult) =>
  r.doc.pages.flatMap((p) => p.objects.filter((o) => o.type === "text" && Math.abs(o.rotation - 180) < 0.01));

describe("flip-correct: real corpus — ecl_workbook", () => {
  it("all 56 folded text frames are restored upright with 56 corrected notes", () => {
    const { mapped, corrected } = imported("ecl_workbook");

    // The fold signature going in: exactly 56 text frames at 180.
    expect(textFramesAt180(mapped)).toHaveLength(56);

    // …and none coming out: every one correlated to a flipped master shape
    // whose true rotation is 0.
    expect(textFramesAt180(corrected)).toHaveLength(0);
    const notes = correctedNotes(corrected); // flip restorations only
    expect(notes).toHaveLength(56);
    for (const n of notes) {
      expect(n.tier).toBe(2);
      expect(n.objectId).toBeTruthy();
      expect(n.pageId).toBeTruthy();
    }
    // One note per distinct frame — no double-correction.
    expect(new Set(notes.map((n) => `${n.pageId}/${n.objectId}`)).size).toBe(56);

    // Every corrected frame now sits at the master's true rotation (0).
    const byId = new Map(
      corrected.doc.pages.flatMap((p) => p.objects.map((o) => [`${p.id}/${o.id}`, o] as const)),
    );
    for (const n of notes) {
      const obj = byId.get(`${n.pageId}/${n.objectId}`);
      expect(obj).toBeDefined();
      if (obj && obj.type !== "line") expect(obj.rotation).toBe(0);
    }

    // A correction is not a degradation: fidelity unchanged.
    expect(corrected.fidelity).toEqual(mapped.fidelity);
  });

  it("does not disturb the 82 frames imported at rotation 0", () => {
    const { mapped, corrected } = imported("ecl_workbook");
    const zeros = (r: MapResult) =>
      r.doc.pages.flatMap((p) => p.objects.filter((o) => o.type === "text" && o.rotation === 0)).length;
    expect(zeros(corrected)).toBe(zeros(mapped) + 56);
  });
});

describe("flip-correct: real corpus — no false corrections elsewhere", () => {
  for (const name of CORPUS.filter((n) => n !== "ecl_workbook")) {
    it(`${name}: zero corrections`, () => {
      const { mapped, corrected } = imported(name);
      expect(corrected.notes.filter((n) => n.kind === "corrected")).toHaveLength(0);
      // No flipped shapes correlate ⇒ the exact same result object comes back.
      expect(corrected).toBe(mapped);
    });
  }
});
