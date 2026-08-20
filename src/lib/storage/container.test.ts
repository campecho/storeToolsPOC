import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "@/store";
import {
  STAPLES_FORMAT_VERSION,
  packStaples,
  parseLayoutPayload,
  staplesFileName,
  unpackStaples,
} from "./container";

/** The committed v2 contract fixture — the same one the persist merge tests
    pin (src/lib/store/layout-store.test.ts). */
const v2Fixture = JSON.parse(
  readFileSync(resolve(__dirname, "../../../fixtures/layout-document.v2.json"), "utf8"),
) as unknown;
const v1Fixture = JSON.parse(
  readFileSync(resolve(__dirname, "../../../fixtures/layout-document.v1.json"), "utf8"),
) as unknown;

const STAMPS = { created: "2026-08-20T10:00:00.000Z", modified: "2026-08-20T12:30:00.000Z" };

describe("packStaples / unpackStaples", () => {
  const doc = parseLayoutPayload(v2Fixture);

  it("round-trips the v2 contract fixture with its asset bytes", () => {
    const assets = { "asset-1": new Uint8Array([1, 2, 3]) };
    const bytes = packStaples({ doc, assets, ...STAMPS });
    const unpacked = unpackStaples(bytes);
    expect(unpacked.doc).toEqual(doc);
    expect(unpacked.assets).toEqual(assets);
    expect(unpacked.manifest).toMatchObject({
      formatVersion: STAPLES_FORMAT_VERSION,
      created: STAMPS.created,
      modified: STAMPS.modified,
      document: { schemaVersion: 2, kind: "layout", name: doc.name, pageCount: doc.pages.length },
    });
  });

  it("is byte-deterministic for identical input", () => {
    expect(packStaples({ doc, ...STAMPS })).toEqual(packStaples({ doc, ...STAMPS }));
  });

  it("migrates a v1 payload on read, exactly like the persist merge", () => {
    const entries = unzipSync(packStaples({ doc: createDefaultDocument(), ...STAMPS }));
    entries["document.json"] = strToU8(JSON.stringify(v1Fixture));
    const unpacked = unpackStaples(zipSync(entries));
    expect(unpacked.doc.version).toBe(2);
  });

  it("rejects bytes that are not a ZIP archive", () => {
    expect(() => unpackStaples(strToU8("nope"))).toThrow(/not a ZIP archive/);
  });

  it("rejects an archive missing its parts, naming the part", () => {
    const full = unzipSync(packStaples({ doc, ...STAMPS }));
    expect(() =>
      unpackStaples(zipSync({ "document.json": full["document.json"] as Uint8Array })),
    ).toThrow(/no manifest\.json/);
    expect(() =>
      unpackStaples(zipSync({ "manifest.json": full["manifest.json"] as Uint8Array })),
    ).toThrow(/no document\.json/);
  });

  it("names the newer build when the container format is ahead", () => {
    const entries = unzipSync(packStaples({ doc, ...STAMPS }));
    const manifest = JSON.parse(strFromU8(entries["manifest.json"] as Uint8Array)) as Record<
      string,
      unknown
    >;
    manifest.formatVersion = STAPLES_FORMAT_VERSION + 1;
    entries["manifest.json"] = strToU8(JSON.stringify(manifest));
    expect(() => unpackStaples(zipSync(entries))).toThrow(/newer build/);
  });

  it("rejects an unknown document version with the version named", () => {
    const entries = unzipSync(packStaples({ doc, ...STAMPS }));
    entries["document.json"] = strToU8(JSON.stringify({ version: 3 }));
    expect(() => unpackStaples(zipSync(entries))).toThrow(/Unsupported document version 3/);
  });

  it("ignores directory placeholders and nested paths in assets/", () => {
    const entries = unzipSync(packStaples({ doc, assets: { real: new Uint8Array([7]) }, ...STAMPS }));
    entries["assets/"] = new Uint8Array(0);
    entries["assets/deep/asset"] = new Uint8Array([9]);
    expect(unpackStaples(zipSync(entries)).assets).toEqual({ real: new Uint8Array([7]) });
  });

  it("rejects an invalid modified stamp before packing", () => {
    expect(() => packStaples({ doc, created: STAMPS.created, modified: "bad" })).toThrow(
      /valid ISO timestamp/,
    );
  });
});

describe("staplesFileName", () => {
  it("appends the extension exactly once, case-insensitively", () => {
    expect(staplesFileName("Spring flyer")).toBe("Spring flyer.staples");
    expect(staplesFileName("flyer.STAPLES")).toBe("flyer.STAPLES");
    expect(staplesFileName("  ")).toBe("document.staples");
  });
});
