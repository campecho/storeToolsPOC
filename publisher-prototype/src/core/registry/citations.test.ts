import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { panelRegistry } from "./panels";
import { toolRegistry } from "./tools";

/**
 * §0.1: no handoff artifact may cite a document that isn't in the
 * directory — and a citation that doesn't resolve to a real heading is the
 * same failure one typo later. Every req cite in the registry must match a
 * numbered heading in docs/microsoft_publisher_feature_requirements.md.
 */

const docPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/microsoft_publisher_feature_requirements.md",
);

function headingNumbers(): Set<string> {
  const text = readFileSync(docPath, "utf8");
  const numbers = new Set<string>();
  for (const line of text.split("\n")) {
    const match = /^#{1,3}\s+(\d+(?:\.\d+){0,2})[.\s]/.exec(line);
    if (match?.[1]) numbers.add(match[1]);
  }
  return numbers;
}

describe("registry citations", () => {
  const headings = headingNumbers();

  it("parses the requirements doc's numbered headings", () => {
    expect(headings.size).toBeGreaterThan(30);
    expect(headings.has("3.1")).toBe(true);
  });

  it("resolves every tool citation to a real heading", () => {
    for (const tool of toolRegistry) {
      for (const req of tool.req) {
        expect(headings.has(req.slice(1)), `${tool.id} cites ${req}`).toBe(true);
      }
    }
  });

  it("resolves every panel citation to a real heading", () => {
    for (const panel of panelRegistry) {
      for (const req of panel.req) {
        expect(headings.has(req.slice(1)), `${panel.id} cites ${req}`).toBe(true);
      }
    }
  });
});
