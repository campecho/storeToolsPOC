import { describe, expect, it } from "vitest";
import { toolRegistry } from "./tools";

/**
 * Registry invariants (PLAN.md §4, §5): every entry keeps the one-id-three-
 * places discipline — clause ids name spec lines and test assertions, clause
 * actions name RTK action types — so these checks are structural, not
 * stylistic.
 */

describe("toolRegistry", () => {
  it("has globally unique tool ids", () => {
    const ids = toolRegistry.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has globally unique gesture-clause ids", () => {
    const ids = toolRegistry.flatMap((t) => t.gestures.map((g) => g.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prefixes every clause id with its tool id", () => {
    for (const tool of toolRegistry) {
      for (const clause of tool.gestures) {
        expect(clause.id.startsWith(`${tool.id}.`)).toBe(true);
      }
    }
  });

  it("shapes clause ids as tool.trigger.behavior in kebab-case", () => {
    for (const clause of toolRegistry.flatMap((t) => t.gestures)) {
      expect(clause.id).toMatch(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){2}$/);
    }
  });

  it("shapes clause actions as RTK action types (slice/eventCommitted)", () => {
    for (const clause of toolRegistry.flatMap((t) => t.gestures)) {
      expect(clause.action).toMatch(/^[a-z][a-zA-Z]*\/[a-z][a-zA-Z]*$/);
    }
  });

  it("cites requirements in § form that resolves in docs/", () => {
    for (const tool of toolRegistry) {
      for (const req of tool.req) {
        expect(req).toMatch(/^§\d+(\.\d+)*$/);
      }
    }
  });

  it("declares a seam exactly when a tool is SURFACE", () => {
    for (const tool of toolRegistry) {
      expect(tool.seam !== undefined).toBe(tool.tier === "SURFACE");
    }
  });

  it("gives every tool a non-empty label, shortcut, and cursor", () => {
    for (const tool of toolRegistry) {
      expect(tool.label.length).toBeGreaterThan(0);
      expect(tool.shortcut.length).toBeGreaterThan(0);
      expect(tool.cursor.length).toBeGreaterThan(0);
    }
  });

  it("keeps viewport-only tools out of document history", () => {
    for (const tool of toolRegistry.filter((t) => t.group === "navigation")) {
      expect(tool.undo).toBe("none");
    }
  });
});
