import { describe, expect, it } from "vitest";
import { CURRENT_VERSION } from "./document";
import { MIGRATIONS, MigrationError, migrateToCurrent, type Migration } from "./migrate";

/**
 * Migrate-on-read (PLAN.md §6.6). v3 is the first version, so the registered
 * table is empty; the mechanism is still tested here with injected migrations,
 * because a migration path that has never run once is not a migration path.
 */

describe("migrateToCurrent", () => {
  it("passes a current document through untouched", () => {
    const doc = { version: CURRENT_VERSION, name: "Current" };
    expect(migrateToCurrent(doc)).toEqual(doc);
  });

  it("ships no migrations, because v3 is the first version", () => {
    expect(Object.keys(MIGRATIONS)).toEqual([]);
  });

  it("chains migrations until the document is current", () => {
    const seen: number[] = [];
    const step =
      (to: number): Migration =>
      (doc) => {
        seen.push(to);
        return { ...doc, version: to, [`touchedBy${to}`]: true };
      };
    const migrations: Record<number, Migration> = {
      1: step(2),
      2: step(CURRENT_VERSION),
    };

    const result = migrateToCurrent({ version: 1, name: "Old" }, migrations);

    expect(seen).toEqual([2, CURRENT_VERSION]);
    expect(result.version).toBe(CURRENT_VERSION);
    expect(result.name).toBe("Old");
    expect(result.touchedBy2).toBe(true);
  });

  it("rejects a document from a newer build", () => {
    expect(() => migrateToCurrent({ version: CURRENT_VERSION + 1 })).toThrow(MigrationError);
    expect(() => migrateToCurrent({ version: CURRENT_VERSION + 1 })).toThrow(/newer version/);
  });

  it("rejects an older document with no registered migration", () => {
    expect(() => migrateToCurrent({ version: 1 })).toThrow(/no migration registered from version 1/);
  });

  it("rejects a migration that does not advance the version", () => {
    const migrations: Record<number, Migration> = { 1: (doc) => doc };
    expect(() => migrateToCurrent({ version: 1 }, migrations)).toThrow(/did not advance/);
  });

  it("rejects things that are not documents", () => {
    expect(() => migrateToCurrent(null)).toThrow(/expected a JSON object/);
    expect(() => migrateToCurrent([])).toThrow(/expected a JSON object/);
    expect(() => migrateToCurrent("{}")).toThrow(/expected a JSON object/);
    expect(() => migrateToCurrent({})).toThrow(/missing an integer `version`/);
    expect(() => migrateToCurrent({ version: "3" })).toThrow(/missing an integer `version`/);
    expect(() => migrateToCurrent({ version: 2.5 })).toThrow(/missing an integer `version`/);
  });
});
