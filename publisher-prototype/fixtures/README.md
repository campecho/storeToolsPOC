# Fixtures

Authored seeded documents for tests and review sessions (PLAN.md §9).

**Licensing rule (PLAN.md §0.1, binding):** fixture documents use CC0 or
owned assets only. Nothing may be copied from the POC's photo or `.pub`
corpora — those carry provenance this handoff must not inherit.

The canvas foundation's stress fixture is generated deterministically in code
(`src/shell/debug/stressFixture.ts`) precisely so it needs no assets.

## `store-flyer.v3.json`

The first authored document — a two-page store flyer, and the schema's own
coverage test. It exercises every §6.6 delta at least once: two layers (one
non-printing, one hidden on page 2), object opacity/blend/effects, two
numbering sections, styles with `basedOn` and `nextStyle`, anchors, run and
paragraph typography, a table with a merged cell, RGB/CMYK/spot swatches, text
wrap, a picture with a recipe and an in-frame crop, a slug and a per-page size
override, a variable font, and a two-frame threaded story.

`roundTrip.test.ts` asserts that coverage, so a delta that regresses out of
the schema fails there rather than going unnoticed until a Phase B group needs
it. It also asserts the file is a **fixed point** — reading and re-serializing
it reproduces the file byte for byte — so the fixture can be reviewed as a
diff. After a deliberate schema change, re-author it by importing, exporting,
and committing the result from the debug bar's round-trip controls.

It references one asset id (`asset-hero`) but ships no bytes: only asset
metadata lives in a document, so the licensing rule above is satisfied
trivially and the frame renders as its placeholder.
