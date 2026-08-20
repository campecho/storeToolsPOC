import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createEmptyDocument, parseDocument, serializeDocument } from "../model";
import {
  STAPLES_EXTENSION,
  packStaples,
  staplesFileName,
  unpackStaples,
  type PackStaplesInput,
} from "./container";
import { STAPLES_FORMAT_VERSION } from "./manifest";

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");
const kitchenSink = parseDocument(
  JSON.parse(readFileSync(resolve(fixturesDir, "kitchen-sink.json"), "utf8")),
);

const STAMPS = { created: "2026-08-20T10:00:00.000Z", modified: "2026-08-20T12:30:00.000Z" };

function pack(overrides: Partial<PackStaplesInput> = {}): Uint8Array {
  return packStaples({
    doc: kitchenSink,
    appVersion: "0.1.0-test",
    ...STAMPS,
    ...overrides,
  });
}

describe("packStaples / unpackStaples", () => {
  it("round-trips the kitchen-sink document exactly", () => {
    const { doc, manifest, assets } = unpackStaples(pack());
    expect(doc).toEqual(kitchenSink);
    expect(assets).toEqual({});
    expect(manifest).toEqual({
      formatVersion: STAPLES_FORMAT_VERSION,
      appVersion: "0.1.0-test",
      created: STAMPS.created,
      modified: STAMPS.modified,
      document: {
        schemaVersion: kitchenSink.version,
        kind: kitchenSink.kind,
        name: kitchenSink.name,
        pageCount: kitchenSink.pages.length,
      },
    });
  });

  it("round-trips embedded asset bytes by id", () => {
    const assets = {
      "asset-1": new Uint8Array([1, 2, 3, 4]),
      "asset-2": new Uint8Array(0),
    };
    const unpacked = unpackStaples(pack({ assets }));
    expect(unpacked.assets).toEqual(assets);
  });

  it("stores the document payload as serializeDocument's exact output", () => {
    const entries = unzipSync(pack());
    const payload = entries["document.json"];
    expect(payload).toBeDefined();
    expect(strFromU8(payload as Uint8Array)).toBe(serializeDocument(kitchenSink));
  });

  it("is byte-deterministic for identical input", () => {
    expect(pack()).toEqual(pack());
  });

  it("rejects an invalid modified stamp before packing anything", () => {
    expect(() => pack({ modified: "not a date" })).toThrow(/valid ISO timestamp/);
  });

  it("rejects bytes that are not a ZIP archive", () => {
    expect(() => unpackStaples(strToU8('{"version":3}'))).toThrow(/not a ZIP archive/);
  });

  it("rejects an archive with no manifest", () => {
    const bytes = zipSync({ "document.json": strToU8(serializeDocument(kitchenSink)) });
    expect(() => unpackStaples(bytes)).toThrow(/no manifest\.json/);
  });

  it("rejects an archive with no document payload", () => {
    const entries = unzipSync(pack());
    const manifestOnly = zipSync({ "manifest.json": entries["manifest.json"] as Uint8Array });
    expect(() => unpackStaples(manifestOnly)).toThrow(/no document\.json/);
  });

  it("rejects a manifest that is not JSON", () => {
    const bytes = zipSync({ "manifest.json": strToU8("not json") });
    expect(() => unpackStaples(bytes)).toThrow(/not valid JSON/);
  });

  function withManifest(mutate: (manifest: Record<string, unknown>) => void): Uint8Array {
    const entries = unzipSync(pack());
    const manifest = JSON.parse(strFromU8(entries["manifest.json"] as Uint8Array)) as Record<
      string,
      unknown
    >;
    mutate(manifest);
    entries["manifest.json"] = strToU8(JSON.stringify(manifest));
    return zipSync(entries);
  }

  it("names the newer build when the container format is ahead of this one", () => {
    const bytes = withManifest((m) => (m.formatVersion = STAPLES_FORMAT_VERSION + 1));
    expect(() => unpackStaples(bytes)).toThrow(/written by a newer build/);
  });

  it("rejects a non-numeric container version", () => {
    const bytes = withManifest((m) => (m.formatVersion = "1"));
    expect(() => unpackStaples(bytes)).toThrow(/no numeric `formatVersion`/);
  });

  it("rejects a manifest missing its document block", () => {
    const bytes = withManifest((m) => delete m.document);
    expect(() => unpackStaples(bytes)).toThrow(/Invalid manifest\.json/);
  });

  it("tolerates manifest fields this build does not know", () => {
    const bytes = withManifest((m) => (m.futureField = { anything: true }));
    expect(unpackStaples(bytes).doc).toEqual(kitchenSink);
  });

  it("routes the payload through the document version gate", () => {
    const entries = unzipSync(pack());
    entries["document.json"] = strToU8(JSON.stringify({ ...kitchenSink, version: 4 }));
    expect(() => unpackStaples(zipSync(entries))).toThrow(/Unsupported document version 4/);
  });

  it("ignores directory placeholders and nested paths in assets/", () => {
    const entries = unzipSync(pack({ assets: { real: new Uint8Array([7]) } }));
    entries["assets/"] = new Uint8Array(0);
    entries["assets/nested/deep"] = new Uint8Array([9]);
    const { assets } = unpackStaples(zipSync(entries));
    expect(assets).toEqual({ real: new Uint8Array([7]) });
  });

  it("packs an image-kind document the same way — one format, not two", () => {
    const doc = { ...createEmptyDocument(), kind: "image" as const, name: "photo" };
    const unpacked = unpackStaples(pack({ doc }));
    expect(unpacked.doc.kind).toBe("image");
    expect(unpacked.manifest.document.kind).toBe("image");
  });
});

describe("staplesFileName", () => {
  it("appends the extension to a document name", () => {
    expect(staplesFileName("Spring flyer")).toBe(`Spring flyer${STAPLES_EXTENSION}`);
  });

  it("never doubles the extension, case-insensitively", () => {
    expect(staplesFileName(`flyer${STAPLES_EXTENSION}`)).toBe(`flyer${STAPLES_EXTENSION}`);
    expect(staplesFileName("FLYER.STAPLES")).toBe("FLYER.STAPLES");
  });

  it("falls back for a blank name", () => {
    expect(staplesFileName("   ")).toBe(`document${STAPLES_EXTENSION}`);
  });
});
