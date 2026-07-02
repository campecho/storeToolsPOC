# Store Tools POC

POC for the In-Store Print & Design Tool Suite, starting with the suite homepage placeholder and the **Feedback, Bug & Feature-Request Tracker** (counter-associate surfaces), built to the fidelity of the design-handoff wireframes.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest unit tests (similarity, filters, store semantics)
npm run e2e        # Playwright smoke of the main flows
npm run build      # production build (standalone output)
```

If Playwright complains about a missing browser and downloads are blocked, point it at a
pre-installed Chromium: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium npm run e2e`.

**Docker** (standalone runner, unprivileged, Cloud Run shape — binds `0.0.0.0:8080`):

```bash
docker build -t store-tools-poc .
docker run --rm -p 8080:8080 store-tools-poc   # http://localhost:8080
```

**Persistence:** votes, follows, filed reports, and notification read-state persist to
localStorage (`stp-feedback-v1`) so a demo survives reloads. **Reset demo data** (top-right of
the tracker sub-bar on board/releases) restores the pristine seed.

## Demo script (~2 minutes, cold start)

1. **Home** — the suite homepage placeholder. Note the persistent header: every surface has
   **Give feedback** and the notification bell (3 unread). Dismiss the coachmark.
2. **Give feedback → Report a problem** — type `large format resize crash` and watch the
   **similar items** panel surface the existing 47-store item; **Back this** instead of filing
   a duplicate → "Your store's backing is in." → **See it on the board**.
3. **First board landing auto-plays the celebrate moment** — two items the store backed
   shipped in v1.4; step through *1 of 2 → 2 of 2*, then **Dismiss all**.
4. **The board** — ranked by store votes. Filter *Bugs*, roll up to *My store #1284*, search;
   toggle an upvote (one vote per store). Click a row → the **detail drawer**: status
   timeline, vote/follow, and each store's **preserved original words**.
5. **Bell → a shipped notification** — the celebrate moment fires → **See what's new** lands on
   **Releases**: v1.4 with *Latest* / *Your store asked* badges and per-item store credits;
   **View →** jumps back to the item on the board.
6. Finish with **Reset demo data** to hand the station back clean.

## What's built so far

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
- **Step 5 — What's new / Releases** (`/feedback/releases`): the "You asked, we delivered."
  banner with the impact tally, and reverse-chronological release cards — version chip, date,
  Latest / "Your store asked" badges, plain-language summary, and the delivered items
  (features + fixes) with store credits ("Your store + 8 asked" in red vs "10 stores asked" in
  gray) and "View →" cross-links that open the item's board detail. Item ↔ release links work
  in both directions.

- **Step 6 — notifications & the celebrate moment:** the header bell opens the notifications
  dropdown (kind-tinted icons, unread dots, action links); tapping a row marks it read and
  routes by kind — **shipped** fires the celebrate moment, release-tied updates open the
  release note, the rest open the item on the board. The **celebrate "shipped" moment**
  (pulsing rings, star pop, release pill, impact tally) **auto-plays once per session** on the
  first board landing as a queue of every shipped item the store backed, with prev/next
  controls and "Dismiss all". A `celebrations` flag in the store (prototype tweak) routes
  shipped notifications straight to the release note when off.

- **Board redesign — "Recently shipped" band:** deliveries from the last 7 days group at the
  top of the board in a green band (most recent first, "Fixed/Shipped in vX · N days ago");
  each entry has a **Got it** dismissal, the band has **Clear all**, and entries fall off after
  7 days — acknowledgments persist. The ranked list is now a purely open queue: the
  **Shipped / Fixed status filter is removed** ("All open" is the default; New / Planned /
  Declined available), the subline honestly counts open items, and delivered items live in the
  band, the drawer/release cross-links, and What's new (the permanent record).
- **UI consistency pass:** symmetric enter/exit motion on every overlay (drawer slides back
  out, modals/dropdown/coachmark pop out, backdrops fade out); board rows glide on reorder
  ("items reorder gently as backing shifts"); the celebrate queue fades between items and
  replays the star pop; Escape closes the topmost overlay; a delivery celebrates once (unread
  shipped only, marked read on play — no replay after reload); "Back this" toggles like every
  vote surface, with the button and confirmation reflecting added vs removed backing;
  navigation clears an open drawer; empty state + one-tap clear on the board; new filings
  scroll their highlight into view; the wire's 4-point spark star is used consistently.

- **Layout editor — step L1, shell: frame, chrome & Home band** (`/layout`): the page-layout
  editor (Publisher replacement) opens from the homepage's **Layout** card — title bar (back
  link, doc name, Simple/Standard/Pro switch with Standard active and the rest disabled until
  L8), Publisher-style ribbon (tab switching live, Home band built), Affinity-style tool
  palette with the live status-bar tool readout, pages pane, rulers + pasteboard with the
  Letter page proxy (bleed/margin guides, corner marks, legend), Page inspector tab, and
  status bar. Desktop-only: below `lg` an honest "needs a bigger screen" gate shows instead.
  Build plan: [docs/LAYOUT_EDITOR_PLAN.md](docs/LAYOUT_EDITOR_PLAN.md).

## Where things live

- `src/app/` — routes: `/` (home), `/feedback/board`, `/feedback/releases`; root layout hosts
  the header + overlays.
- `src/components/` — `chrome/` (header, coachmark), `home/`, `report/` (modal steps).
- `src/lib/schema/` — Zod schemas + status metadata. `src/lib/data/` — seed content, verbatim
  from the prototype. `src/lib/store/` — the Zustand store (ported 1:1 from the prototype's
  state class). `src/lib/similar.ts` — the similar-items scorer.
- `public/fonts/` — Motiva Sans drop-in spot (see its README; system fallback until licensed).

## Start here (docs)

- **[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)** — the review of the inputs and the phased build plan for this POC (homepage + feedback tracker, built).
- **[docs/LAYOUT_EDITOR_PLAN.md](docs/LAYOUT_EDITOR_PLAN.md)** — the phased build plan for the **page-layout editor** (the Publisher replacement), mounted behind the homepage's Layout card. Next up.

## Reference documents

- `docs/handoff/feedback-tracker/` — the design handoff package:
  - `README.md` — the self-sufficient design spec (screens, interactions, state model, motion, tokens).
  - `feedback-tracker-prototype.html` — runnable prototype; open in any browser, no setup. The behavioral source of truth.
  - `Feedback Tracker Prototype.dc.html` — readable source (markup + `Component` logic).
  - `FUNCTIONAL_DESIGN.md` — the tracker's product/functional design (v0.1).
- `docs/handoff/layout-editor/` — the layout-editor design handoff package:
  - `README.md` — the design spec (regions, control groups, state model, tokens, growth scope).
  - `Layout Editor (offline).html` — runnable prototype of the editor shell; the behavioral source of truth.
  - `Layout Editor.dc.html` — readable source (markup + `Component` logic).
- `docs/Desktop_Publisher_Design_Doc.md` — the desktop publishing application design doc (product vision, experience model, capability targets the editor serves).
- `docs/Store_Tools_Suite_Implementation_Plan.md` — the overall suite implementation plan (prototype → open beta → production); the tracker is Track C, shipped early; the layout editor is Track B's custom-size layout core.
