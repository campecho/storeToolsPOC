import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LayoutDocumentSchema } from "./document";
import {
  createEmptyDocument,
  deserializeDocument,
  parseDocument,
  serializeDocument,
} from "./parse";

/** Fixtures are the schema's proof of completeness (PLAN.md §6.6) — resolved
    relative to this file so the tests run from any cwd. */
function readFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)), "utf8");
}

const FIXTURES = ["minimal.json", "kitchen-sink.json", "photo-single-image.json"] as const;

describe("round-trip identity", () => {
  for (const name of FIXTURES) {
    it(`${name}: deserialize(serialize(parse(fixture))) deep-equals the parsed document`, () => {
      const doc = parseDocument(JSON.parse(readFixture(name)));
      const roundTripped = deserializeDocument(serializeDocument(doc));
      expect(roundTripped).toEqual(doc);
    });
  }

  it("serializeDocument is stable 2-space JSON", () => {
    const doc = createEmptyDocument();
    const text = serializeDocument(doc);
    expect(text).toBe(JSON.stringify(doc, null, 2));
    expect(serializeDocument(deserializeDocument(text))).toBe(text);
  });
});

describe("createEmptyDocument", () => {
  it("parses through its own schema", () => {
    const doc = createEmptyDocument();
    expect(LayoutDocumentSchema.parse(doc)).toEqual(doc);
    expect(parseDocument(doc)).toEqual(doc);
  });

  it("matches the document-slice defaults: one 8.5×11 portrait page, bleed 0.125, margin 0.5", () => {
    const doc = createEmptyDocument();
    expect(doc.version).toBe(3);
    expect(doc.kind).toBe("layout");
    expect(doc.size).toEqual({ w: 8.5, h: 11 });
    expect(doc.orientation).toBe("portrait");
    expect(doc.bleed).toBe(0.125);
    expect(doc.margin).toBe(0.5);
    expect(doc.slug).toBe(0);
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]?.objects).toEqual([]);
    expect(doc.layers).toHaveLength(1);
    expect(doc.masters).toEqual([]);
    expect(doc.sections).toEqual([]);
    expect(doc.anchors).toEqual([]);
    expect(doc.swatches).toEqual([]);
    expect(doc.groups).toEqual([]);
    expect(doc.fonts).toEqual([]);
    expect(doc.assets).toEqual({});
    expect(doc.guides).toEqual({ v: [], h: [] });
  });

  it("equals the committed minimal fixture", () => {
    expect(parseDocument(JSON.parse(readFixture("minimal.json")))).toEqual(createEmptyDocument());
  });
});

describe("version gate (migrate-on-read door)", () => {
  it("rejects a v2-shaped document with the no-runtime-migration message", () => {
    const v2 = {
      version: 2,
      name: "POC document",
      product: null,
      size: { w: 8.5, h: 11 },
      orientation: "portrait",
      bleed: 0.125,
      margin: 0.5,
      columns: 1,
      pages: [{ id: "p1", masterId: null, objects: [] }],
      masters: [],
    };
    expect(() => parseDocument(v2)).toThrowError(/no runtime migration/);
    expect(() => parseDocument(v2)).toThrowError(/POC lineage/);
  });

  it("rejects a v1 document the same way", () => {
    expect(() => parseDocument({ version: 1 })).toThrowError(/no runtime migration/);
  });

  it("rejects a future version with a this-build-reads-v3 message", () => {
    expect(() => parseDocument({ version: 4 })).toThrowError(/reads schema v3 only/);
  });

  it("rejects garbage: non-objects, arrays, and missing/non-numeric version", () => {
    expect(() => parseDocument(null)).toThrowError(/Not a layout document/);
    expect(() => parseDocument("document")).toThrowError(/Not a layout document/);
    expect(() => parseDocument([])).toThrowError(/Not a layout document/);
    expect(() => parseDocument({})).toThrowError(/missing numeric `version`/);
    expect(() => parseDocument({ version: "3" })).toThrowError(/missing numeric `version`/);
  });

  it("rejects a version-3 object that is not a valid document, naming the failing paths", () => {
    expect(() => parseDocument({ version: 3 })).toThrowError(/Invalid v3 document/);
    expect(() => parseDocument({ version: 3 })).toThrowError(/name: Required/);
  });

  it("wraps JSON syntax errors actionably", () => {
    expect(() => deserializeDocument("{not json")).toThrowError(/not valid JSON/);
  });
});
