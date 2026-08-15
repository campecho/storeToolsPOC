import { describe, expect, it } from "vitest";
import { blankDocument, DEFAULT_LAYER_ID } from "./defaults";
import { AnchorSchema, DocumentSchema } from "./document";
import { TableContentSchema } from "./objects";
import { ColorValueSchema } from "./primitives";
import { ParagraphSchema, RunFormatOverridesSchema, TextRunSchema } from "./text";

/**
 * Schema v3 invariants (PLAN.md §6.6) — the constraints the model enforces
 * itself, as opposed to the soft references it deliberately leaves to the
 * actions that write them.
 */

describe("blankDocument", () => {
  it("is valid, minimal, and current", () => {
    const parsed = DocumentSchema.safeParse(blankDocument());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.version).toBe(3);
    expect(parsed.data.pages).toHaveLength(1);
    expect(parsed.data.layers).toHaveLength(1);
    expect(parsed.data.layers[0]?.id).toBe(DEFAULT_LAYER_ID);
  });

  it("carries complete formatting defaults, so resolution is total", () => {
    // Every key of the complete formats must be present — that is what lets
    // styleless text resolve without a fallback path in the text engine.
    const doc = blankDocument();
    const runKeys = Object.keys(doc.defaults.run);
    for (const key of runKeys) {
      expect(doc.defaults.run[key as keyof typeof doc.defaults.run]).toBeDefined();
    }
    expect(runKeys).toContain("features");
    expect(runKeys).toContain("variations");
    expect(Object.keys(doc.defaults.paragraph)).toContain("justification");
  });

  it("takes a document name", () => {
    expect(blankDocument("Spring Flyer").name).toBe("Spring Flyer");
  });
});

describe("document invariants", () => {
  it("requires at least one page and one layer", () => {
    expect(DocumentSchema.safeParse({ ...blankDocument(), pages: [] }).success).toBe(false);
    expect(DocumentSchema.safeParse({ ...blankDocument(), layers: [] }).success).toBe(false);
  });

  it("pins the version, so a mislabelled document cannot slip through", () => {
    expect(DocumentSchema.safeParse({ ...blankDocument(), version: 2 }).success).toBe(false);
  });

  it("accepts dangling soft references, by design", () => {
    // A missing master/layer/style degrades rather than making the document
    // unopenable — the v2 lineage's position on masterId, kept.
    const doc = blankDocument();
    const withDangling = {
      ...doc,
      pages: [{ ...doc.pages[0]!, masterId: "master-that-does-not-exist" }],
    };
    expect(DocumentSchema.safeParse(withDangling).success).toBe(true);
  });
});

describe("anchors (§4.4)", () => {
  it("are part of the document from the first draft", () => {
    expect(blankDocument().anchors).toEqual([]);
  });

  it("reference a story and a non-negative position", () => {
    expect(AnchorSchema.safeParse({ id: "a", storyId: "s", position: 0 }).success).toBe(true);
    expect(AnchorSchema.safeParse({ id: "a", storyId: "s", position: -1 }).success).toBe(false);
    expect(AnchorSchema.safeParse({ id: "a", storyId: "s", position: 1.5 }).success).toBe(false);
    expect(AnchorSchema.safeParse({ id: "a", position: 0 }).success).toBe(false);
  });
});

describe("colour values (§9.4)", () => {
  it("requires the component count its space implies", () => {
    expect(ColorValueSchema.safeParse({ space: "rgb", values: [0, 0, 0] }).success).toBe(true);
    expect(ColorValueSchema.safeParse({ space: "rgb", values: [0, 0, 0, 0] }).success).toBe(false);
    expect(ColorValueSchema.safeParse({ space: "cmyk", values: [0, 0, 0, 0] }).success).toBe(true);
    expect(ColorValueSchema.safeParse({ space: "cmyk", values: [0, 0, 0] }).success).toBe(false);
  });

  it("bounds components to 0–1", () => {
    expect(ColorValueSchema.safeParse({ space: "rgb", values: [0, 0, 1.2] }).success).toBe(false);
    expect(ColorValueSchema.safeParse({ space: "rgb", values: [0, 0, -0.1] }).success).toBe(false);
  });

  it("requires spot colours to name their ink, and only spot colours", () => {
    expect(
      ColorValueSchema.safeParse({ space: "spot", values: [0, 0, 0, 0.1] }).success,
    ).toBe(false);
    expect(
      ColorValueSchema.safeParse({
        space: "spot",
        values: [0, 0, 0, 0.1],
        spotName: "PANTONE 877 C",
      }).success,
    ).toBe(true);
    expect(
      ColorValueSchema.safeParse({ space: "rgb", values: [0, 0, 0], spotName: "Nope" }).success,
    ).toBe(false);
  });
});

describe("text storage (§3.3, §3.6)", () => {
  it("never allows an empty paragraph — an empty one is a single empty run", () => {
    expect(ParagraphSchema.safeParse({ runs: [] }).success).toBe(false);
    const empty = ParagraphSchema.safeParse({ runs: [{ text: "" }] });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.runs[0]?.text).toBe("");
  });

  it("defaults a run to styleless with no overrides, so the indicator is derivable", () => {
    const run = TextRunSchema.parse({ text: "hello" });
    expect(run.characterStyleId).toBeNull();
    expect(run.overrides).toEqual({});
    expect(run.field).toBeNull();
    expect(Object.keys(run.overrides).length > 0).toBe(false);
  });

  it("keeps overrides partial, so an unset attribute is absent rather than defaulted", () => {
    // If overrides defaulted their fields, every run would read as fully
    // overridden and §3.6's override indicator would be meaningless.
    const overrides = RunFormatOverridesSchema.parse({ bold: true });
    expect(overrides).toEqual({ bold: true });
    expect("sizePt" in overrides).toBe(false);
  });

  it("accepts the §1.5 page-number field on a run", () => {
    expect(TextRunSchema.parse({ text: "1", field: "pageNumber" }).field).toBe("pageNumber");
    expect(TextRunSchema.safeParse({ text: "1", field: "pageCount" }).success).toBe(false);
  });
});

describe("tables (§8.1)", () => {
  const cell = { paragraphs: [{ runs: [{ text: "x" }] }] };

  it("accepts a grid whose cells match its row and column counts", () => {
    const result = TableContentSchema.safeParse({
      rowHeightsIn: [0.3, 0.3],
      colWidthsIn: [1, 1, 1],
      cells: [
        [cell, cell, cell],
        [cell, cell, cell],
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a row count that disagrees with the row heights", () => {
    const result = TableContentSchema.safeParse({
      rowHeightsIn: [0.3, 0.3],
      colWidthsIn: [1],
      cells: [[cell]],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain("2 row heights");
  });

  it("rejects a ragged row", () => {
    const result = TableContentSchema.safeParse({
      rowHeightsIn: [0.3, 0.3],
      colWidthsIn: [1, 1],
      cells: [[cell, cell], [cell]],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain("row 1 has 1 cells");
  });

  it("defaults a cell to unmerged and uncovered", () => {
    const result = TableContentSchema.parse({
      rowHeightsIn: [0.3],
      colWidthsIn: [1],
      cells: [[cell]],
    });
    expect(result.cells[0]?.[0]?.rowSpan).toBe(1);
    expect(result.cells[0]?.[0]?.colSpan).toBe(1);
    expect(result.cells[0]?.[0]?.covered).toBe(false);
  });
});
