# publisher-prototype

A standalone functional model of the layout tool's interaction surface — every tool,
every panel, every option, and exactly what each does on the canvas — built so a dev
team can implement the real product against it. **[`PLAN.md`](PLAN.md) is the plan of
record**; the requirements it cites live in
[`docs/microsoft_publisher_feature_requirements.md`](docs/microsoft_publisher_feature_requirements.md).

## Standalone posture

This directory is the future repo root (PLAN.md §0). It is hosted inside
`storeToolsPOC` temporarily and mechanically; extraction is copying this directory to
a new repo's root. Two rules keep that true:

- **Installs happen inside this directory.** The repo has two lockfiles — the host's
  and this one. Never run `npm install` for this app from the host root.
- **No imports cross the boundary, in either direction.** `npm run check:boundaries`
  enforces it (and the framework-free rule for `src/core/`) in CI.

## Getting started

Requires Node 22 (`.nvmrc`).

```sh
cd publisher-prototype
npm ci
npm run dev
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (flat config) |
| `npm run test` | Vitest unit tests (`src/**/*.test.ts`, colocated) |
| `npm run e2e` | Playwright against the Vite dev server |
| `npm run check:boundaries` | §0 extraction-boundary + framework-free-core check |
| `npm run ci` | Everything CI runs: boundaries, lint, typecheck, test, build |

The host repo's workflow for this app is a thin cd-and-run shim over `npm run ci`;
all CI logic lives here (PLAN.md §0.1).

## Layout

```
src/
  core/    # framework-free TypeScript — the artifact the dev team ports.
           # No react/konva imports (CI-enforced); RTK and zod only.
    model/     # schema v3 — the document format (PLAN.md §6.6)
    registry/  # tool contracts and panel specs (§4, §5)
    geometry/  # viewport and ruler math (§6.2)
    store/     # RTK slices (§6.3)
  shell/   # React 19 + Vite scaffolding around the core — not carried forward.
```

`core/model/` is the storage and rendering contract: `DocumentSchema` is the
document format, and the debug bar's Export/Import round-trips it as a file.
`fixtures/store-flyer.v3.json` is the first authored document and doubles as
the schema's coverage test.

See PLAN.md §6.1 for the full intended tree and §6.7 for the stack.
