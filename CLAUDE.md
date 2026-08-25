# Working rules for this repository

Two apps live here, both active. The **host POC** (repo root) is being brought
up to the updated UI in `docs/Publisher replacement.fig`;
**`docs/UI_LAYOUT_REDESIGN_PLAN.md` is the source of truth** for that work.
The **publisher prototype** (`publisher-prototype/`) continues separately;
**`publisher-prototype/PLAN.md` is the source of truth** for all prototype
work. Every task must be clearly directed at one app or the other — never
assume a change spans both — unless and until the two are merged.

## Process

1. **Restate before coding.** Restate the task and the PLAN.md section it maps
   to. Wait for confirmation before writing code.
2. **Delegate mechanical work** — codebase search, test scaffolding,
   boilerplate, doc updates — to subagents. Keep architecture decisions,
   interface design, and final review in the main thread.
3. **Review pass.** After implementing, do a separate review pass before
   reporting done.

## Definition of done (all must pass)

- Typecheck and lint clean.
- Tests written and passing for new logic.
- No new `any`, no TODOs, no commented-out code.
- Follows patterns already in this codebase; a new pattern must be flagged
  with the reason for introducing it.
- No files touched outside the agreed scope.

## Stop and ask before proceeding when

- Anything requested conflicts with PLAN.md — quote both lines, then wait.
- PLAN.md is ambiguous on a decision you need to make.
- The work requires changing a shared interface, schema, or dependency.

This is foundation code. Correct beats fast. Don't infer unstated
requirements — ask.

## Repository mechanics (binding, from PLAN.md §0.1)

- **No mixed commits.** A commit touches `publisher-prototype/` or the host
  repo, never both.
- **Prototype commit messages read standalone** — no POC context assumed.
- **Installs happen inside `publisher-prototype/`** (two lockfiles, one
  rule). All prototype npm scripts run from inside the directory;
  `npm run ci` there is the whole CI gate, and
  `npm run check:boundaries` enforces the extraction boundary and the
  framework-free `src/core/`.
- Handoff decisions of record live in `publisher-prototype/SEAMS.md`.
