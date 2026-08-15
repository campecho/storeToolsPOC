# SEAMS — dev-team interfaces

Every SURFACE capability declares its seam here: what it's called with, what it
returns, and what the dev team owns (PLAN.md §3, §8).

**Status:** no seams registered yet. Seam entries arrive with the SURFACE
capabilities themselves (export/print settings, model services, full-res render,
HEIC, ICC/CMYK — PLAN.md §6.5, §6.7).

## Handoff decisions of record (PLAN.md §0.1)

- **POC access (recorded 2026-08-15):** the dev team has access to the entire
  `storeToolsPOC` repository. Seam entries and generated docs may cite POC
  implementations as full working references; the prototype always carries its own
  concise, self-contained description alongside any citation — a citation is never
  the only explanation.
- **Extraction mode (recorded 2026-08-15):** **copy** — the §0.1 default stands. A
  pristine new repo; rationale travels in the generated docs and review record, not
  commit history.
- **Target repo (recorded 2026-08-15):** none, deliberately. The prototype stays in
  `storeToolsPOC` so the POC remains reviewable alongside it as reference, especially
  for the dev team's later `.pub` import work. This supersedes §0.1's "the stopgap
  stays short" preference; the binding commit discipline (no mixed commits,
  standalone messages) remains in force for as long as the prototype lives here.
