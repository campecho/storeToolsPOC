import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ObjectType } from "../registry/types";
import { LayoutObjectSchema, type LayoutObject, type PictureFrame, type TableFrame, type TextFrame } from "./objects";
import { parseDocument } from "./parse";
import {
  LayoutDocumentSchema,
  effectiveMargins,
  pageSide,
  spreadOfPage,
  spreadsOf,
  type LayoutDocument,
} from "./document";

function loadFixture(name: string): LayoutDocument {
  const path = fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
  return parseDocument(JSON.parse(readFileSync(path, "utf8")));
}

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`expected ${what} in the fixture`);
  return value;
}

function allObjects(doc: LayoutDocument): LayoutObject[] {
  return [...doc.pages, ...doc.masters].flatMap((p) => p.objects);
}

describe("kitchen-sink fixture exercises every §6.6 delta", () => {
  const doc = loadFixture("kitchen-sink.json");
  const objects = allObjects(doc);

  it("carries non-empty layers, sections, anchors, swatches, groups, and fonts", () => {
    expect(doc.layers.length).toBeGreaterThanOrEqual(2);
    expect(doc.sections.length).toBeGreaterThanOrEqual(2);
    expect(doc.anchors.length).toBeGreaterThanOrEqual(2);
    expect(doc.swatches.length).toBeGreaterThanOrEqual(3);
    expect(doc.groups.length).toBeGreaterThan(0);
    expect(doc.fonts.length).toBeGreaterThan(0);
  });

  it("has swatches in all three spaces, the spot one named", () => {
    const spaces = new Set(doc.swatches.map((s) => s.space));
    expect(spaces).toEqual(new Set(["rgb", "cmyk", "spot"]));
    const spot = must(
      doc.swatches.find((s) => s.space === "spot"),
      "a spot swatch",
    );
    expect(spot.spotName.length).toBeGreaterThan(0);
  });

  it("uses both swatch-referenced and literal paints", () => {
    const fills = objects.flatMap((o) => (o.type === "line" ? [] : o.fill ? [o.fill] : []));
    expect(fills.some((f) => f.kind === "swatch")).toBe(true);
    expect(fills.some((f) => f.kind === "color")).toBe(true);
  });

  it("contains a table frame with a spanned cell", () => {
    const table = must(
      objects.find((o): o is TableFrame => o.type === "table"),
      "a table frame",
    );
    expect(table.columns.length).toBeGreaterThanOrEqual(2);
    const cells = table.rows.flatMap((r) => r.cells);
    expect(cells.some((c) => (c.colSpan ?? 1) > 1 || (c.rowSpan ?? 1) > 1)).toBe(true);
  });

  it("contains a threaded pair of text frames sharing a storyId", () => {
    const frames = objects.filter((o): o is TextFrame => o.type === "textFrame");
    const first = must(
      frames.find((f) => f.nextFrameId !== undefined),
      "a text frame with a nextFrameId",
    );
    const second = must(
      frames.find((f) => f.id === first.nextFrameId),
      "the frame first.nextFrameId points at",
    );
    expect(second.prevFrameId).toBe(first.id);
    expect(first.storyId).toBeDefined();
    expect(second.storyId).toBe(first.storyId);
  });

  it("contains a picture frame with a non-empty adjust recipe, a crop transform, and text wrap", () => {
    const pic = must(
      objects.find((o): o is PictureFrame => o.type === "pictureFrame"),
      "a picture frame",
    );
    expect(pic.adjust.length).toBeGreaterThan(0);
    expect(pic.crop).toBeDefined();
    expect(pic.wrap).toBeDefined();
    expect(pic.wrap?.mode).not.toBe("none");
  });

  it("has a run carrying a styleId plus an explicit override", () => {
    const runs = objects
      .filter((o): o is TextFrame => o.type === "textFrame")
      .flatMap((f) => f.text.paragraphs)
      .flatMap((p) => p.runs);
    const styled = runs.filter((r) => r.styleId !== undefined);
    expect(styled.length).toBeGreaterThan(0);
    const overridden = must(
      styled.find((r) => r.font.bold),
      "a styled run whose explicit bold overrides its character style",
    );
    const style = must(
      doc.characterStyles.find((s) => s.id === overridden.styleId),
      "the character style the run references",
    );
    expect(style.props.bold ?? false).toBe(false);
  });

  it("carries styles with basedOn and nextStyle", () => {
    expect(doc.paragraphStyles.some((s) => s.basedOn !== undefined)).toBe(true);
    expect(doc.paragraphStyles.some((s) => s.nextStyle !== undefined)).toBe(true);
    expect(doc.characterStyles.length).toBeGreaterThan(0);
  });

  it("exercises paragraph typography: tabs, dropCap, hyphenation, justification, list, keep, rules, shading", () => {
    const paragraphs = objects
      .filter((o): o is TextFrame => o.type === "textFrame")
      .flatMap((f) => f.text.paragraphs);
    expect(paragraphs.some((p) => (p.tabs?.length ?? 0) > 0)).toBe(true);
    expect(paragraphs.some((p) => p.dropCap !== undefined)).toBe(true);
    expect(paragraphs.some((p) => p.hyphenation?.enabled)).toBe(true);
    expect(paragraphs.some((p) => p.justification !== undefined)).toBe(true);
    expect(paragraphs.some((p) => p.list !== undefined)).toBe(true);
    expect(paragraphs.some((p) => p.keep !== undefined)).toBe(true);
    expect(paragraphs.some((p) => p.ruleBelow !== undefined)).toBe(true);
    expect(paragraphs.some((p) => p.shading !== undefined)).toBe(true);
    expect(paragraphs.some((p) => p.baselineGridLock === true)).toBe(true);
  });

  it("exercises run typography: tracking, baselineShift, kerning, features, variations, language, scaling", () => {
    const run = must(
      objects
        .filter((o): o is TextFrame => o.type === "textFrame")
        .flatMap((f) => f.text.paragraphs)
        .flatMap((p) => p.runs)
        .find((r) => r.tracking !== undefined),
      "a run with tracking",
    );
    expect(run.baselineShift).toBeDefined();
    expect(run.kerning).toBeDefined();
    expect(run.features).toBeDefined();
    expect(run.variations).toBeDefined();
    expect(run.language).toBeDefined();
    expect(run.horizontalScale).toBeDefined();
  });

  it("carries document setup: slug, baseline grid, per-page overrides, and per-page guides", () => {
    expect(doc.slug).toBeGreaterThan(0);
    expect(doc.baselineGrid).toBeDefined();
    const overriddenPage = must(
      doc.pages.find((p) => p.sizeOverride !== undefined),
      "a page with a size override",
    );
    expect(overriddenPage.bleedOverride).toBeDefined();
    expect(overriddenPage.guides).toBeDefined();
    expect(overriddenPage.layerOverrides).toBeDefined();
    expect(doc.guides.v.length + doc.guides.h.length).toBeGreaterThan(0);
  });

  it("uses a master page, a group, a mergeField, a vector path, and a rotated locked object", () => {
    expect(doc.masters.length).toBeGreaterThan(0);
    expect(doc.pages.some((p) => p.masterId !== null)).toBe(true);
    expect(objects.some((o) => o.groupId !== undefined)).toBe(true);
    expect(objects.some((o) => o.type === "mergeField")).toBe(true);
    const path = must(
      objects.find((o) => o.type === "shape" && o.shape === "path"),
      "a vector path shape",
    );
    expect(path.type === "shape" && (path.d?.length ?? 0) > 0).toBe(true);
    expect(objects.some((o) => o.type !== "line" && o.rotation !== 0 && o.locked)).toBe(true);
  });

  it("carries object opacity, blend, and effects", () => {
    expect(objects.some((o) => o.opacity !== undefined && o.opacity < 1)).toBe(true);
    expect(objects.some((o) => o.blend !== undefined && o.blend !== "normal")).toBe(true);
    expect(objects.some((o) => o.effects?.shadow !== undefined)).toBe(true);
  });
});

describe("single-image document", () => {
  it("photo-single-image.json is kind 'image' with one page holding one picture frame", () => {
    const doc = loadFixture("photo-single-image.json");
    expect(doc.kind).toBe("image");
    expect(doc.pages).toHaveLength(1);
    const objects = must(doc.pages[0], "the single page").objects;
    expect(objects).toHaveLength(1);
    const pic = must(objects[0], "the picture frame");
    expect(pic.type).toBe("pictureFrame");
    expect(pic.type === "pictureFrame" && pic.adjust.length > 0).toBe(true);
  });

  it("kind defaults to 'layout' when absent", () => {
    const doc = loadFixture("kitchen-sink.json");
    expect(doc.kind).toBe("layout");
  });
});

describe("registry cross-check", () => {
  /** Every registry ObjectType that maps to a document object. "guide" is
      doc/page-level setup, not an object; "buildingBlock" instantiates
      ordinary objects — both excluded by design (see objects.ts). */
  type CreatableObjectType = Exclude<ObjectType, "guide" | "buildingBlock">;

  const schemaTypeFor: Record<CreatableObjectType, LayoutObject["type"]> = {
    textFrame: "textFrame",
    pictureFrame: "pictureFrame",
    table: "table",
    shape: "shape",
    line: "line",
    mergeField: "mergeField",
  };

  const blackInk = { kind: "color", color: { space: "rgb", values: [0, 0, 0] } };
  const minimalText = {
    paragraphs: [
      {
        align: "left",
        lineSpacing: 1.2,
        runs: [
          {
            text: "",
            font: { family: "Inter", size: 11, bold: false, italic: false, underline: false },
            color: blackInk,
          },
        ],
      },
    ],
  };
  const frameBase = {
    id: "obj-1",
    x: 1,
    y: 1,
    w: 2,
    h: 1,
    rotation: 0,
    locked: false,
    fill: null,
    stroke: null,
  };

  const minimalByType: Record<CreatableObjectType, unknown> = {
    textFrame: { ...frameBase, type: "textFrame", text: minimalText },
    pictureFrame: { ...frameBase, type: "pictureFrame" },
    table: {
      ...frameBase,
      type: "table",
      columns: [{ width: 2 }],
      rows: [{ cells: [{ paragraphs: minimalText.paragraphs }] }],
    },
    shape: { ...frameBase, type: "shape", shape: "rect" },
    line: {
      id: "obj-1",
      type: "line",
      locked: false,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      stroke: { paint: blackInk, width: 1 },
    },
    mergeField: { ...frameBase, type: "mergeField", field: "firstName" },
  };

  for (const [objectType, schemaType] of Object.entries(schemaTypeFor)) {
    it(`registry ObjectType "${objectType}" is constructible as a document object`, () => {
      const candidate = minimalByType[objectType as CreatableObjectType];
      const parsed = LayoutObjectSchema.parse(candidate);
      expect(parsed.type).toBe(schemaType);
    });
  }

  it("a rounded rect requires `cornerRadius`, and every other kind rejects it", () => {
    expect(() =>
      LayoutObjectSchema.parse({ ...frameBase, type: "shape", shape: "roundedRect" }),
    ).toThrow();
    expect(() =>
      LayoutObjectSchema.parse({ ...frameBase, type: "shape", shape: "rect", cornerRadius: 0.2 }),
    ).toThrow();
    // A radius above the frame's own bound still PARSES — the bound belongs
    // to drawing, so a resize that shrinks the frame cannot invalidate a
    // stored document (ShapeObjectSchema's note).
    const parsed = LayoutObjectSchema.parse({
      ...frameBase,
      type: "shape",
      shape: "roundedRect",
      cornerRadius: 99,
    });
    expect(parsed).toMatchObject({ shape: "roundedRect", cornerRadius: 99 });
    expect(() =>
      LayoutObjectSchema.parse({
        ...frameBase,
        type: "shape",
        shape: "roundedRect",
        cornerRadius: -1,
      }),
    ).toThrow();
  });

  it("a path shape requires non-empty `d` and rect/ellipse reject it", () => {
    expect(() => LayoutObjectSchema.parse({ ...frameBase, type: "shape", shape: "path" })).toThrow();
    expect(() =>
      LayoutObjectSchema.parse({
        ...frameBase,
        type: "shape",
        shape: "rect",
        d: [{ c: "M", x: 0, y: 0 }],
      }),
    ).toThrow();
    const parsed = LayoutObjectSchema.parse({
      ...frameBase,
      type: "shape",
      shape: "path",
      d: [
        { c: "M", x: 0, y: 0 },
        { c: "L", x: 1, y: 1 },
        { c: "Z" },
      ],
    });
    expect(parsed.type).toBe("shape");
  });
});

describe("spreads and mirrored margins (PLAN.md §6.8)", () => {
  function docWith(
    pages: Array<{ keepWithPrevious?: boolean; marginsOverride?: unknown; marginOverride?: number }>,
    extra: Record<string, unknown> = {},
  ): LayoutDocument {
    return LayoutDocumentSchema.parse({
      version: 3,
      name: "Spreads",
      size: { w: 8.5, h: 11 },
      orientation: "portrait",
      bleed: 0.125,
      margin: 0.5,
      columns: 1,
      pages: pages.map((p, i) => ({ id: `page-${i + 1}`, masterId: null, objects: [], ...p })),
      masters: [],
      ...extra,
    });
  }

  const plain = (n: number): Array<Record<string, never>> => Array.from({ length: n }, () => ({}));
  const members = (doc: LayoutDocument): number[][] => spreadsOf(doc).map((s) => s.pageIndices);

  describe("membership derives from page order", () => {
    it("defaults to single binding, one page per spread", () => {
      const doc = docWith(plain(4));
      expect(doc.binding).toBe("single");
      expect(members(doc)).toEqual([[0], [1], [2], [3]]);
    });

    it("pairs facing pages after a solo opening recto", () => {
      expect(members(docWith(plain(5), { binding: "facing" }))).toEqual([[0], [1, 2], [3, 4]]);
    });

    it("keepWithPrevious extends a spread past two pages for gatefolds", () => {
      const doc = docWith([{}, {}, {}, { keepWithPrevious: true }, {}], { binding: "facing" });
      expect(members(doc)).toEqual([[0], [1, 2, 3], [4]]);
    });

    it("ignores keepWithPrevious under single binding", () => {
      expect(members(docWith([{}, { keepWithPrevious: true }]))).toEqual([[0], [1]]);
    });

    it("re-derives after a reorder with no reconciliation step", () => {
      const doc = docWith([{}, {}, {}, { keepWithPrevious: true }], { binding: "facing" });
      expect(members(doc)).toEqual([[0], [1, 2, 3]]);
      // The flagged page moves to the front, where it has no previous spread
      // to join. Nothing is stored, so membership simply follows page order.
      const moved = must(doc.pages[3], "fourth page");
      const reordered: LayoutDocument = { ...doc, pages: [moved, ...doc.pages.slice(0, 3)] };
      expect(members(reordered)).toEqual([[0], [1, 2], [3]]);
    });

    it("finds a page's spread, and misses an out-of-range index", () => {
      const doc = docWith(plain(3), { binding: "facing" });
      expect(spreadOfPage(doc, 2)?.pageIndices).toEqual([1, 2]);
      expect(spreadOfPage(doc, 9)).toBeUndefined();
    });
  });

  describe("page sides and margin resolution", () => {
    const edges = { top: 0.5, bottom: 0.5, inside: 1, outside: 0.25 };

    it("alternates sides from the opening recto under facing binding", () => {
      const doc = docWith(plain(4), { binding: "facing" });
      expect([0, 1, 2, 3].map((i) => pageSide(doc, i))).toEqual([
        "recto",
        "verso",
        "recto",
        "verso",
      ]);
    });

    it("reads every page as recto under single binding — no spine", () => {
      const doc = docWith(plain(2));
      expect([0, 1].map((i) => pageSide(doc, i))).toEqual(["recto", "recto"]);
    });

    it("falls back to the uniform scalar when no per-edge margins exist", () => {
      const doc = docWith(plain(2), { binding: "facing" });
      expect(effectiveMargins(doc, 0)).toEqual({ top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 });
    });

    it("mirrors inside/outside by the page's side of the spine", () => {
      const doc = docWith(plain(2), { binding: "facing", margins: edges });
      // Recto: spine at the left, so the wide inside margin lands there.
      expect(effectiveMargins(doc, 0)).toEqual({ top: 0.5, bottom: 0.5, left: 1, right: 0.25 });
      // Verso: mirrored.
      expect(effectiveMargins(doc, 1)).toEqual({ top: 0.5, bottom: 0.5, left: 0.25, right: 1 });
    });

    it("resolves inside to the left edge under single binding", () => {
      const doc = docWith(plain(1), { margins: edges });
      expect(effectiveMargins(doc, 0)).toEqual({ top: 0.5, bottom: 0.5, left: 1, right: 0.25 });
    });

    it("prefers a per-page marginsOverride over the document per-edge value", () => {
      const override = { top: 0.1, bottom: 0.2, inside: 0.3, outside: 0.4 };
      const doc = docWith([{}, { marginsOverride: override }], {
        binding: "facing",
        margins: edges,
      });
      expect(effectiveMargins(doc, 1)).toEqual({ top: 0.1, bottom: 0.2, left: 0.4, right: 0.3 });
    });

    it("prefers per-edge over the scalar override on the same page", () => {
      const doc = docWith([{ marginOverride: 2, marginsOverride: edges }]);
      expect(effectiveMargins(doc, 0)).toEqual({ top: 0.5, bottom: 0.5, left: 1, right: 0.25 });
    });

    it("lets a page's scalar override beat document-level per-edge margins", () => {
      // Page level resolves before document level; the page's uniform 2in is
      // its stated intent and must not be masked by doc.margins.
      const doc = docWith([{ marginOverride: 2 }], { binding: "facing", margins: edges });
      expect(effectiveMargins(doc, 0)).toEqual({ top: 2, bottom: 2, left: 2, right: 2 });
    });

    it("resolves an out-of-range page index to document-level values", () => {
      const doc = docWith(plain(1), { margin: 0.75 });
      expect(effectiveMargins(doc, 9)).toEqual({
        top: 0.75,
        bottom: 0.75,
        left: 0.75,
        right: 0.75,
      });
    });
  });
});
