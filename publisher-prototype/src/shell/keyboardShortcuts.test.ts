import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { globalKeyClauses, toolRegistry } from "../core/registry";
import type { ToolMode } from "../core/registry";
import { WIRED_TOOLS } from "./wiredTools";

/**
 * KEYBOARD_SHORTCUTS.md is a reading of the registry, and a reading that
 * drifts is worse than none — a reviewer trusts it exactly as far as it is
 * checked. Same technique as registry/citations.test.ts (read the markdown,
 * assert against the registry), but this one lives in the shell because the
 * document spans both sides: the tool letters come from the registry, the
 * Wired/Specified column from shell/wiredTools.ts, and a core test may not
 * reach across that boundary.
 */

const doc = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../KEYBOARD_SHORTCUTS.md"),
  "utf8",
);

type DocRow = { key: string; label: string; id: string; status: string };

/** | `V` | Select | `select` | Wired | — or `—` in the key cell, dock-only. */
const ROW = /^\|\s*(?:`([^`]+)`|(—))\s*\|\s*(.+?)\s*\|\s*`([^`]+)`\s*\|\s*(\S+)\s*\|$/;

function rowsUnder(heading: string): DocRow[] {
  const lines = doc.split("\n");
  const start = lines.indexOf(heading);
  expect(start, `${heading} is missing from KEYBOARD_SHORTCUTS.md`).toBeGreaterThan(-1);
  const rows: DocRow[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("#")) break;
    const m = ROW.exec(line);
    const [, letter, dash, label, id, status] = m ?? [];
    const key = letter ?? dash;
    if (key && label && id && status) rows.push({ key, label, id, status });
  }
  return rows;
}

function registryRows(mode: Exclude<ToolMode, "both">): DocRow[] {
  return toolRegistry
    .filter((t) => t.mode === mode || t.mode === "both")
    .map((t) => ({
      key: t.shortcut ?? "—",
      label: t.label,
      id: t.id,
      status: WIRED_TOOLS.has(t.id) ? "Wired" : "Specified",
    }));
}

describe("KEYBOARD_SHORTCUTS.md", () => {
  it("lists the layout dock exactly as the registry declares it", () => {
    expect(rowsUnder("### Layout mode")).toEqual(registryRows("layout"));
  });

  it("lists the photo dock exactly as the registry declares it", () => {
    expect(rowsUnder("### Photo mode")).toEqual(registryRows("photo"));
  });

  it("documents one bare letter per keyed tool, and a dash for the dock-only ones", () => {
    for (const row of [...rowsUnder("### Layout mode"), ...rowsUnder("### Photo mode")]) {
      expect(row.key, `${row.id} activates on "${row.key}"`).toMatch(/^([A-Z]|—)$/);
    }
  });

  it("cites only gesture-clause ids that exist", () => {
    const clauseIds = new Set([
      ...toolRegistry.flatMap((t) => t.gestures.map((g) => g.id)),
      ...globalKeyClauses.map((c) => c.id),
    ]);
    // A clause id is three kebab-case segments (registry/tools.test.ts holds
    // the shape); file names match it too, so they are excluded by suffix.
    const clauseShape = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){2}$/;
    const fileSuffix = /\.(ts|tsx|mjs|md|json|css)$/;
    for (const [, span] of doc.matchAll(/`([^`]+)`/g)) {
      if (span === undefined || !clauseShape.test(span) || fileSuffix.test(span)) continue;
      expect(clauseIds.has(span), `${span} is cited but is not a registry clause`).toBe(true);
    }
  });

  it("documents every global chord the registry declares", () => {
    for (const clause of globalKeyClauses) {
      expect(doc.includes(clause.id), `${clause.id} is declared but undocumented`).toBe(true);
    }
  });

  it("mentions every key the registry's triggers name", () => {
    const tokens = ["Esc", "Enter", "Tab", "Shift", "Alt", "Ctrl", "Cmd", "Space", "Delete", "Backspace", "arrow", "wheel", "[", "]"];
    const triggers = [...toolRegistry.flatMap((t) => t.gestures), ...globalKeyClauses]
      .map((clause) => clause.trigger)
      .join(" | ")
      .toLowerCase();
    const text = doc.toLowerCase();
    for (const token of tokens) {
      if (!triggers.includes(token.toLowerCase())) continue;
      expect(text.includes(token.toLowerCase()), `triggers name ${token}; the doc never does`).toBe(
        true,
      );
    }
  });
});
