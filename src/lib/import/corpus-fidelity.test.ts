import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildModel } from "./model";
import {
  CATEGORIES,
  categoryRatio,
  computeFidelity,
  formatScorecard,
  parseReferencePages,
} from "./fidelity";
import { mapToLayoutDocument } from "./mapper";
import { parseTrace } from "./trace-parser";

/**
 * The measured fidelity gate (plan §10.6, P5 exit): the design target of
 * ≥90% element-level fidelity is COMPUTED here, per Markzware conformance
 * category, from checked-in artifacts only — the pub2raw traces our pipeline
 * consumes and the pub2xhtml reference renders of the same files (an
 * independent consumer of the same libmspub parse). No native binary runs in
 * this suite; scripts/refresh-corpus.mjs regenerates both fixture sets where
 * libmspub-tools is installed, and CI's drift gate keeps them honest.
 *
 * The gate deliberately excludes business_card_template_10up from the
 * denominators: its content lives entirely on master pages, which libmspub
 * doesn't expose — BOTH sides render it empty, and the last describe pins
 * that agreement (plus our tier-3 flag) as the "nothing degrades silently"
 * proof rather than letting an empty/empty comparison inflate the score.
 */

const FIDELITY_TARGET = 0.9;

/** The content-bearing corpus files the metric runs on. ecl_workbook (39
    pages, 508 elements — the field-contributed training workbook) joined
    after the arc→cubic fix took its position score from 91.9% to 100%. */
const FILES = ["3up_tabs", "bcim_double_cut", "production_checkpoint_labels", "ecl_workbook"];

const read = (dir: string, file: string) =>
  readFileSync(join(process.cwd(), "fixtures", dir, file), "utf8");

const inputs = FILES.map((name) => {
  const { doc, blobs } = mapToLayoutDocument(buildModel(parseTrace(read("pub-traces", `${name}.trace`))), name);
  return { name, refPages: parseReferencePages(read("pub-refs", `${name}.xhtml`)), doc, blobs };
});

const card = computeFidelity(inputs);

describe("corpus fidelity: import output vs pub2xhtml reference render", () => {
  it("prints the per-file × per-category scorecard", () => {
    console.info(`\n${formatScorecard(card)}\n`);
    // every category actually measured something — an empty denominator
    // would make the gate below vacuous
    for (const cat of CATEGORIES) {
      expect(card.combined[cat].total).toBeGreaterThan(0);
    }
  });

  it(`scores ≥${FIDELITY_TARGET * 100}% in every category, combined across the corpus`, () => {
    for (const cat of CATEGORIES) {
      const t = card.combined[cat];
      expect
        .soft(categoryRatio(t), `${cat}: ${t.pass}/${t.total}`)
        .toBeGreaterThanOrEqual(FIDELITY_TARGET);
    }
  });

  it("matches every element — no unmatched reference elements on this corpus", () => {
    // Empirical on this corpus: every reference element finds a doc object.
    // A regression that drops elements shows up here before it dilutes the
    // category percentages.
    for (const f of card.files) expect(f.unmatched, `${f.name} unmatched refs`).toBe(0);
  });

  it("produces no extras — every doc object is claimed by a reference element", () => {
    // Empirical on this corpus: the pipeline invents nothing (extras = 0).
    // Pinned so a mapper change that starts emitting phantom objects fails
    // the harness, not just the eyeball check.
    for (const f of card.files) expect(f.extras, `${f.name} extras`).toBe(0);
  });
});

describe("corpus fidelity: business_card_template_10up (master-page-only)", () => {
  // Asserted SEPARATELY from the metric: the reference render is EMPTY
  // (pub2xhtml prints "No SVG document generated!" — a 0-byte file is the
  // committed golden), our import converts to an empty page, and the mapper
  // flags the upstream gap tier-3. Every degradation reported, nothing silent.
  const refXhtml = read("pub-refs", "business_card_template_10up.xhtml");
  const { doc, notes } = mapToLayoutDocument(
    buildModel(parseTrace(read("pub-traces", "business_card_template_10up.trace"))),
    "business_card_template_10up",
  );

  it("the committed reference render is the 0-byte upstream truth", () => {
    expect(refXhtml.length).toBe(0);
    expect(parseReferencePages(refXhtml)).toEqual([]);
  });

  it("our import agrees: one empty page, flagged tier 3 — not a silent win", () => {
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].objects).toHaveLength(0);
    const flag = notes.find((n) => n.tier === 3 && n.message.includes("master pages"));
    expect(flag).toBeDefined();
  });
});
