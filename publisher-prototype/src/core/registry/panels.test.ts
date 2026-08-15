import { describe, expect, it } from "vitest";
import { panelRegistry } from "./panels";

/**
 * Panel registry invariants (PLAN.md §4.3): the full classified panel set,
 * one entry per PanelId, with the same seam-iff-SURFACE discipline as tools.
 */

describe("panelRegistry", () => {
  it("has globally unique panel ids", () => {
    const ids = panelRegistry.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries the §4.3 sets: 26 layout panels and 6 photo panels", () => {
    expect(panelRegistry.filter((p) => p.mode === "layout").length).toBe(26);
    expect(panelRegistry.filter((p) => p.mode === "photo").length).toBe(6);
  });

  it("prefixes photo panel ids with photo- and nothing else", () => {
    for (const panel of panelRegistry) {
      expect(panel.id.startsWith("photo-"), panel.id).toBe(panel.mode === "photo");
    }
  });

  it("declares a seam exactly when a panel is SURFACE", () => {
    for (const panel of panelRegistry) {
      expect(panel.seam !== undefined, panel.id).toBe(panel.tier === "SURFACE");
    }
  });

  it("gives every panel a label and a non-empty reviewable carries list", () => {
    for (const panel of panelRegistry) {
      expect(panel.label.length).toBeGreaterThan(0);
      expect(panel.carries.length).toBeGreaterThan(0);
      for (const line of panel.carries) expect(line.length).toBeGreaterThan(0);
    }
  });

  it("cites requirements in § form", () => {
    for (const panel of panelRegistry) {
      for (const req of panel.req) {
        expect(req).toMatch(/^§\d+(\.\d+)*$/);
      }
    }
  });

  it("describes SURFACE seams self-containedly", () => {
    for (const panel of panelRegistry) {
      if (panel.seam) {
        expect(panel.seam.interface.length).toBeGreaterThan(0);
        expect(panel.seam.payload.length).toBeGreaterThan(0);
        expect(panel.seam.returns.length).toBeGreaterThan(0);
      }
    }
  });
});
