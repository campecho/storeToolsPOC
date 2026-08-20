import { describe, expect, it } from "vitest";
import { GLOBAL_KEY_SURFACES, globalKeyClauses } from "./globalKeys";
import { toolRegistry } from "./tools";

/**
 * The global chords carry the same invariants tools.test.ts holds the tool
 * clauses to — they are the same kind of thing, declared somewhere else — plus
 * two of their own: every chord is modified (bare keys belong to the tool
 * letters), and no id collides with a tool's.
 */

describe("globalKeyClauses", () => {
  it("has unique ids that no tool clause repeats", () => {
    const ids = globalKeyClauses.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const toolClauseIds = new Set(toolRegistry.flatMap((t) => t.gestures.map((g) => g.id)));
    for (const id of ids) expect(toolClauseIds.has(id), `${id} also names a tool clause`).toBe(false);
  });

  it("shapes ids as surface.trigger.behavior in kebab-case", () => {
    for (const clause of globalKeyClauses) {
      expect(clause.id).toMatch(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){2}$/);
      const surface = clause.id.split(".")[0];
      expect(GLOBAL_KEY_SURFACES).toContain(surface);
    }
  });

  it("shapes actions as RTK action types (slice/eventCommitted)", () => {
    for (const clause of globalKeyClauses) {
      expect(clause.action).toMatch(/^[a-z][a-zA-Z]*\/[a-z][a-zA-Z]*Committed$/);
    }
  });

  it("puts a modifier on every chord — bare keys are the tool letters", () => {
    for (const clause of globalKeyClauses) {
      expect(clause.trigger, `${clause.id} triggers on "${clause.trigger}"`).toMatch(/Ctrl\/Cmd/);
    }
  });

  it("describes every chord in a sentence", () => {
    for (const clause of globalKeyClauses) {
      expect(clause.behavior.length).toBeGreaterThan(0);
    }
  });
});
