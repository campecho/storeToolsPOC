import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { blankDocument } from "./defaults";
import { CURRENT_VERSION, DocumentSchema } from "./document";
import type { Migration } from "./migrate";
import { readDocument, readDocumentOrThrow, serializeDocument } from "./roundTrip";

/**
 * The JSON round trip (PLAN.md §6.6) — "the only proof the schema is
 * complete". Anything the schema cannot express is silently gone after a
 * round trip, so these tests compare whole documents, not spot fields.
 */

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/store-flyer.v3.json",
);

function flyerText(): string {
  return readFileSync(fixturePath, "utf8");
}

describe("round trip", () => {
  it("returns a blank document unchanged", () => {
    const doc = blankDocument("Untitled");
    expect(readDocumentOrThrow(serializeDocument(doc))).toEqual(doc);
  });

  it("returns the authored fixture unchanged", () => {
    const doc = readDocumentOrThrow(flyerText());
    expect(readDocumentOrThrow(serializeDocument(doc))).toEqual(doc);
  });

  it("re-serializes the fixture byte-for-byte", () => {
    // The committed fixture is already in the model's own canonical form, so
    // reading and writing it is a fixed point. This is what lets a fixture be
    // reviewed as a diff rather than re-derived to be compared.
    const text = flyerText();
    expect(serializeDocument(readDocumentOrThrow(text))).toBe(text);
  });

  it("fills defaulted fields rather than dropping them", () => {
    // A document written by an older surface omits fields that have defaults;
    // reading it must produce the complete shape, not the sparse one.
    const sparse = {
      version: CURRENT_VERSION,
      name: "Sparse",
      setup: { trim: { wIn: 8.5, hIn: 11 } },
      pages: [{ id: "page-1" }],
      layers: [
        {
          id: "layer-default",
          name: "Default",
          color: { kind: "literal", value: { space: "rgb", values: [0, 0, 0] } },
        },
      ],
      defaults: blankDocument().defaults,
    };
    const result = readDocument(JSON.stringify(sparse));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.pages[0]?.objects).toEqual([]);
    expect(result.document.setup.bleedIn).toBe(0.125);
    expect(result.document.anchors).toEqual([]);
    expect(result.document.guides).toEqual({ v: [], h: [] });
  });
});

describe("round trip failures", () => {
  it("reports invalid JSON without throwing", () => {
    const result = readDocument("{ not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not valid JSON");
  });

  it("reports a missing version", () => {
    const result = readDocument(JSON.stringify({ name: "No version" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("`version`");
  });

  it("reports a document from a newer build", () => {
    const result = readDocument(JSON.stringify({ version: CURRENT_VERSION + 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("newer version");
  });

  it("reports schema violations with a field path", () => {
    const doc = JSON.parse(flyerText()) as Record<string, unknown>;
    doc.pages = [];
    const result = readDocument(JSON.stringify(doc));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("pages");
  });

  it("throws from the throwing variant", () => {
    expect(() => readDocumentOrThrow("{ not json")).toThrow(/not valid JSON/);
  });

  it("validates migrated output against the schema, not just the migration", () => {
    // A migration that produces something malformed must fail at the schema.
    const migrations: Record<number, Migration> = {
      2: (doc) => ({ ...doc, version: 3, name: 42 }),
    };
    const result = readDocument(JSON.stringify({ version: 2 }), migrations);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("name");
  });
});

describe("authored fixture", () => {
  it("is valid against the schema as committed", () => {
    expect(DocumentSchema.safeParse(JSON.parse(flyerText())).success).toBe(true);
  });

  /**
   * The fixture is the schema's coverage test: every §6.6 delta must be
   * exercised by it, so a delta that regresses out of the schema fails here
   * rather than going unnoticed until a Phase B group needs it.
   */
  it("exercises all fourteen §6.6 deltas plus the §4.4 anchor rule", () => {
    const doc = readDocumentOrThrow(flyerText());
    const objects = doc.pages.flatMap((p) => p.objects);
    const pictures = objects.filter((o) => o.type === "picture");
    const texts = objects.filter((o) => o.type === "text");
    const tables = objects.filter((o) => o.type === "table");
    const bodies = texts.flatMap((t) => (t.body ? [t.body] : []));
    const paragraphs = bodies.flatMap((b) => b.paragraphs);
    const runs = paragraphs.flatMap((p) => p.runs);

    // 1. Layers — document-scoped, with a non-printing layer and a per-page override.
    expect(doc.layers.length).toBeGreaterThan(1);
    expect(doc.layers.some((l) => !l.printing)).toBe(true);
    expect(doc.pages.some((p) => p.hiddenLayerIds.length > 0)).toBe(true);
    expect(objects.every((o) => o.layerId.length > 0)).toBe(true);

    // 2. Object opacity / blend / effects.
    expect(objects.some((o) => o.opacity < 1)).toBe(true);
    expect(objects.some((o) => o.blend !== "normal")).toBe(true);
    expect(objects.some((o) => o.effects.shadow)).toBe(true);
    expect(objects.some((o) => o.effects.glow)).toBe(true);
    expect(objects.some((o) => o.effects.softEdge)).toBe(true);

    // 3. Sections & numbering, and the page-number field that resolves against them.
    expect(doc.sections.length).toBeGreaterThan(1);
    expect(doc.sections.some((s) => s.format !== "arabic" && s.prefix !== "")).toBe(true);
    const masterRuns = doc.masters
      .flatMap((m) => m.objects)
      .filter((o) => o.type === "text")
      .flatMap((o) => (o.body ? o.body.paragraphs : []))
      .flatMap((p) => p.runs);
    expect(masterRuns.some((r) => r.field === "pageNumber")).toBe(true);

    // 4. Styles — basedOn, nextStyle, and derivable overrides.
    expect(doc.paragraphStyles.some((s) => s.basedOn !== null)).toBe(true);
    expect(doc.paragraphStyles.some((s) => s.nextStyle !== null)).toBe(true);
    expect(doc.characterStyles.length).toBeGreaterThan(0);
    expect(runs.some((r) => r.characterStyleId !== null)).toBe(true);
    expect(runs.some((r) => Object.keys(r.overrides).length > 0)).toBe(true);

    // 5. Anchors — present with no consumer tool, per §4.4.
    expect(doc.anchors.length).toBeGreaterThan(0);
    expect(doc.anchors.every((a) => a.storyId.length > 0)).toBe(true);

    // 6. Run typography.
    expect(runs.some((r) => r.overrides.tracking !== undefined)).toBe(true);
    expect(runs.some((r) => r.overrides.kerning !== undefined)).toBe(true);
    expect(runs.some((r) => r.overrides.variations !== undefined)).toBe(true);
    expect(runs.some((r) => r.overrides.hScale !== undefined)).toBe(true);
    expect(runs.some((r) => r.overrides.language !== undefined)).toBe(true);
    expect(doc.characterStyles.some((s) => s.character.features !== undefined)).toBe(true);

    // 7. Paragraph typography.
    expect(paragraphs.some((p) => p.overrides.hyphenation?.on)).toBe(true);
    expect(paragraphs.some((p) => p.overrides.justification !== undefined)).toBe(true);
    expect(paragraphs.some((p) => (p.overrides.tabs?.length ?? 0) > 0)).toBe(true);
    expect(paragraphs.some((p) => p.overrides.bullet)).toBe(true);
    expect(paragraphs.some((p) => p.overrides.dropCap)).toBe(true);
    expect(paragraphs.some((p) => p.overrides.ruleAbove)).toBe(true);
    expect(paragraphs.some((p) => p.overrides.shading)).toBe(true);
    expect(doc.paragraphStyles.some((s) => s.paragraph.alignToBaselineGrid)).toBe(true);
    expect(doc.paragraphStyles.some((s) => s.paragraph.keep !== undefined)).toBe(true);

    // 8. Tables — spans, per-cell paragraphs, borders, shading.
    expect(tables.length).toBeGreaterThan(0);
    const cells = tables.flatMap((t) => t.table.cells.flat());
    expect(cells.some((c) => c.colSpan > 1)).toBe(true);
    expect(cells.some((c) => c.covered)).toBe(true);
    expect(cells.some((c) => c.shading)).toBe(true);
    expect(cells.some((c) => c.borderBottom)).toBe(true);

    // 9. Colour model — all three spaces, referenced rather than inlined.
    expect(new Set(doc.swatches.map((s) => s.value.space))).toEqual(
      new Set(["rgb", "cmyk", "spot"]),
    );
    expect(doc.swatches.some((s) => s.theme)).toBe(true);
    expect(objects.some((o) => o.type === "rect" && o.fill.kind === "gradient")).toBe(true);

    // 10. Text wrap.
    expect(objects.some((o) => o.type !== "line" && o.wrap.mode === "square")).toBe(true);
    expect(objects.some((o) => o.type !== "line" && o.wrap.mode === "tight")).toBe(true);

    // 11. Picture adjust + in-frame crop transform.
    expect(pictures.some((p) => p.adjust.length > 0)).toBe(true);
    expect(pictures.some((p) => p.crop.scale !== 1 || p.crop.offsetIn.yIn !== 0)).toBe(true);

    // 12. Document setup — slug first-class, per-page setup, baseline grid, per-page guides.
    expect(doc.setup.slugIn).toBeGreaterThan(0);
    expect(doc.pages.some((p) => p.setup !== null)).toBe(true);
    expect(doc.pages.some((p) => p.quarterTurns !== 0)).toBe(true);
    expect(doc.baselineGrid.on).toBe(true);
    expect(doc.pages.some((p) => p.guides.h.length > 0 || p.guides.v.length > 0)).toBe(true);

    // 13. Fonts — including a variable face with axes.
    expect(doc.fonts.length).toBeGreaterThan(0);
    expect(doc.fonts.some((f) => f.axes !== undefined)).toBe(true);

    // 14. Threading — a story spanning two frames, body on the first only.
    const chained = texts.filter((t) => t.storyId === "story-main");
    expect(chained.length).toBe(2);
    expect(chained.filter((t) => t.body !== null).length).toBe(1);
    expect(chained.some((t) => t.nextFrameId !== null)).toBe(true);
    expect(chained.some((t) => t.prevFrameId !== null)).toBe(true);
  });
});
