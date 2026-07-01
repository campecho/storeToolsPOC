# Store Tools POC

POC for the In-Store Print & Design Tool Suite, starting with the suite homepage placeholder and the **Feedback, Bug & Feature-Request Tracker** (counter-associate surfaces), built to the fidelity of the design-handoff wireframes.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest unit tests (similarity scorer, store semantics)
npm run e2e        # Playwright smoke of the main flows
npm run build      # production build (standalone output)
```

If Playwright complains about a missing browser and downloads are blocked, point it at a
pre-installed Chromium: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium npm run e2e`.

## What's built so far (plan steps 0–2)

- **Step 0 — scaffold:** Next.js 15 (App Router) + React 19 + TypeScript strict, Tailwind v4
  design tokens from the wires, motion keyframes, Zustand store, Zod schemas, Vitest + Playwright.
  Persistent app header (Staples badge, search, store ID, **Give feedback**, notification bell
  with unread badge, avatar) on every surface.
- **Step 1 — Home & file intake** (`/`): quick-jump tool row, dropzone with file-type chips,
  `.pub` callout, new-document size tiles, product grid, recognition/board-entry card, and the
  first-visit coachmark. All intake affordances are placeholders per the wires.
- **Step 2 — report flow:** the 4-step Give-feedback modal — choose → bug/feature form with
  live **similar items** ("Back this" upvotes instead of filing a duplicate), bug-only
  auto-captured context with the attach-file toggle, feature area auto-tag, optional name →
  upvoted / confirm steps. Filing unshifts the item and lands highlighted on the board.
- **Step 3 — the board** (`/feedback/board`): left rail with the store-impact card,
  type/status/scope filters (scope rolls up by the store hierarchy: chain → region → district →
  my store), and the "Stores behind v1.4" spotlight; main column with the scope-aware subline,
  search (title/area/description), and the votes-ranked item rows — upvote toggles with one
  vote per store and a pulse on change. Row click sets up the detail drawer (renders in Step 4).
- **Step 4 — item detail drawer:** slides in from the right over a dimmed backdrop — status
  timeline (New → Planned → Fixed/Shipped, or → Declined/Closed), shipped-release card that
  cross-links to the releases surface, decline-reason card, big vote + follow actions, the
  **preserved per-store reports** (own store highlighted, each store's words kept verbatim),
  and the non-threaded comments list. Opens from any board row; vote/follow stay in sync with
  the row underneath.
- **Interim stub:** `/feedback/releases` (banner + bare version list; full release cards are
  Step 5).

Next up per the plan: **Step 5** (the full releases surface), then
notifications/celebrate.

## Where things live

- `src/app/` — routes: `/` (home), `/feedback/board`, `/feedback/releases`; root layout hosts
  the header + overlays.
- `src/components/` — `chrome/` (header, coachmark), `home/`, `report/` (modal steps).
- `src/lib/schema/` — Zod schemas + status metadata. `src/lib/data/` — seed content, verbatim
  from the prototype. `src/lib/store/` — the Zustand store (ported 1:1 from the prototype's
  state class). `src/lib/similar.ts` — the similar-items scorer.
- `public/fonts/` — Motiva Sans drop-in spot (see its README; system fallback until licensed).

## Start here (docs)

- **[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)** — the review of the inputs and the phased build plan for this POC.

## Reference documents

- `docs/handoff/feedback-tracker/` — the design handoff package:
  - `README.md` — the self-sufficient design spec (screens, interactions, state model, motion, tokens).
  - `feedback-tracker-prototype.html` — runnable prototype; open in any browser, no setup. The behavioral source of truth.
  - `Feedback Tracker Prototype.dc.html` — readable source (markup + `Component` logic).
  - `FUNCTIONAL_DESIGN.md` — the tracker's product/functional design (v0.1).
- `docs/Store_Tools_Suite_Implementation_Plan.md` — the overall suite implementation plan (prototype → open beta → production); the tracker is Track C, shipped early.
