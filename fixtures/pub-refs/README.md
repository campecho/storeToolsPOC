# `pub2xhtml` reference renders

Checked-in reference renders of the real-corpus `.pub` files
(`fixtures/pub-corpus/`), one `.xhtml` per publication. They are the
comparison side of the P5 fidelity harness (plan §10.6): `pub2xhtml` is an
**independent consumer of the same libmspub parse** our import pipeline
consumes via `pub2raw`, so scoring our `LayoutDocument` output against these
renders measures the pipeline's element-level fidelity without trusting the
pipeline to grade itself — deterministically, from checked-in bytes, with no
native binary in the test lane (`src/lib/import/corpus-fidelity.test.ts`,
`npm run fidelity`).

## Provenance

Generated with `pub2xhtml` 0.1.4 (libmspub-tools) by `scripts/refresh-corpus.mjs`
(`npm run refresh:corpus`), which regenerates every trace **and** every render
in one pass and is byte-stable — CI runs it followed by
`git diff --exit-code -- fixtures/pub-traces fixtures/pub-refs` as the drift
gate. Regenerate one file by hand with
`pub2xhtml fixtures/pub-corpus/<name>.pub fixtures/pub-refs/<name>.xhtml`.

| Render | Source | What it pins |
|---|---|---|
| `3up_tabs.xhtml` | Binder-tab store template | 3 pages 9×11 · rotated text (`transform="rotate(90, cx, cy)"` — the center ≈ the frame center, the pub2xhtml-verified rotation sign) |
| `bcim_double_cut.xhtml` | 2-sided customer business card | 3.75×2.125 pages · 8 texts · 4 `svg:line`s (2-point polygons in the trace) · 1 pattern-filled polygon carrying the ~1 MB JPEG as a data: URI |
| `production_checkpoint_labels.xhtml` | Store production labels | 2 dense pages · 64 texts / 96 polygons / 32 paths · 16 `svg:pattern` bitmap fills (one PNG payload, repeated) · layer `svg:g` groups |
| `business_card_template_10up.xhtml` | 10-up imposition template | **0 bytes — deliberately.** Master-page-only content: pub2xhtml prints "No SVG document generated!" and exits 1; the emptiness IS the golden (the same upstream gap our mapper flags tier 3) |

## Format facts the harness encodes (`src/lib/import/fidelity.ts`)

- One `<svg:svg width="9.0000in" height="11.0000in" viewBox="0 0 648.0000
  792.0000">` per page, pages separated by `<hr/>`; coordinates inside are
  **points** (viewBox units, 72/in).
- `<!-- … -->` comment blocks wrap embedded XML doctypes — stripped before
  scanning.
- `<svg:tspan font-size="0.1667">` is in **inches** (0.1667 ≈ 12 pt) — the
  same libmspub quirk the traces have.
- Shape paint lives in `style="fill: …; stroke: …"`; bitmap fills are
  `fill: url(#imgN)` against a `<svg:pattern>` whose `<svg:image>` holds the
  bytes as a base64 data: URI — **byte-identical to the trace's
  `draw:fill-image` payloads** (verified: same sha256).
- The serializer pretty-prints a newline at the start of every tspan's text
  node and emits nothing at paragraph boundaries, so tspan boundaries are
  unreliable whitespace — the harness's text-flow comparison treats them as
  optional whitespace and stays strict inside tokens.

These files contain internal store data — fine in this repo, never copy them
elsewhere (same rule as `fixtures/pub-corpus/`).
