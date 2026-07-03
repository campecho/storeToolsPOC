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

Status at a glance (✅ done · 🟡 partial · ❌ stubbed / not started — details in the build log
below; everything fake or inert is registered in **[STUBS.md](STUBS.md)**):

| Surface | Status |
|---|---|
| Suite homepage (quick-jumps, intake affordances) | 🟡 Layout card + size tiles are real entry points; dropzone/product grid are wire placeholders |
| Feedback tracker — report flow, board, releases, notifications, celebrate | ✅ complete to the wires; localStorage persistence + demo reset |
| Layout editor — shell, document model, objects, text, multi-page & masters, multi-select/align/snap, side panel with assets & layers, picture fill-on-click & drag-in (L1–L9) | ✅ shipped |
| Layout editor — toolset build-out: rotation/Arrange, ruler guides & units, spreads & mixed sizes, clipboard (L10–L13) | ❌ next in plan (v1.4) |
| Layout editor — experience levels (Simple/Standard), hardening (L14–L15) | ❌ after the toolset |
| Product/SKU catalog binding | ❌ inert affordance; schema field exists |
| `.pub` import, open/save/export, print production | ❌ specified in docs only (plan §8–§11) |
| Auth / station identity | ❌ stubbed (`src/lib/identity.ts`) |
| Backend/API | ❌ none — fully client-side; Zod schemas + `fixtures/` are the contract-in-waiting |

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

- **Layout editor — step L2, shell completion: every band, tab & pane:** the remaining
  at-rest chrome — **Insert / Layout / Text** command bands (page & object tiles, page-size /
  orientation / guides & bleed / columns controls, character & text-flow pills), the inspector's
  **Properties** (no-selection empty state + disabled Transform), **Text**, and **Align**
  bodies, and the pages pane's **Master pages** view (A · applied, B · blank, + New master).
  Every ribbon tab, inspector tab, and the Pages/Masters toggle now matches the offline
  prototype click-for-click; the controls themselves go live in L3–L7.

- **Layout editor — step L3, document model & the true-scale page:** the editor becomes a
  real tool — a Zod-validated `LayoutDocument` (inches-canonical) behind a persisted store
  (`stp-layout-v1`, schema-validated on load, **Reset** in the status bar). The page renders
  **true-scale** (`in × 96 × zoom`) with fit-zoom on mount; the status-bar **zoom**
  slider/±/%, the **Zoom** tool (Alt-click reverses), the **Move/pan** tool, and
  Ctrl/Cmd+scroll are live; rulers are real — inch-numbered, density-adaptive, tracking zoom
  and pan from the page's origin. The **Page tab and Layout band edit the document**: presets
  (Letter/Legal/Ledger/posters), custom W/H up to large format, orientation, bleed, margin,
  columns + the Guides toggle (gutter guides derive from the model). The title-bar name is
  editable and the size hint/caption/legend track the file. Homepage **size tiles deep-link**
  (`/layout?preset=…`, `?custom=1` lands in the width field) into fresh documents.

- **Layout editor — step L4, objects: draw, select, transform:** the first editing
  capability — **Rect / Ellipse / Line / Picture drag-to-draw** (dashed preview, Picture as
  the gray placeholder frame, tool auto-returns to Select), **click-select / drag-move /
  8-handle resize** (Shift preserves aspect) with line endpoint handles, and the **Properties
  tab live**: Transform X/Y/W/H round-trip plus Fill/Stroke rows (grayscale ramp + brand red
  + none). Full keyboard: Delete, Cmd/Ctrl+D duplicate, arrow nudge 1/32 in (Shift ×10),
  **Cmd/Ctrl+Z / Shift+Z undo/redo** (bounded per-gesture snapshots — one entry per completed
  drag or input commit), Cmd/Ctrl+]/[ z-order, Esc deselect (yields to suite overlays). The
  status bar tracks tool + selection ("Rectangle tool · drag to draw", "Select tool · 2
  objects", "Table tool · coming later in the beta"), and the Insert band's Text box/Picture
  tiles arm their tools. Drawn objects persist with the document.

- **Layout editor — step L5, text frames & typography:** the novice promo-sign use case works
  end-to-end. The **Text tool draws a frame that opens ready to type** (Publisher behavior);
  **double-click re-edits** via a contentEditable overlay with identical metrics at the
  current zoom — each session commits as **one undo step**, and Cmd/Ctrl+B/I/U toggle real
  document props while editing. The **Home band Font/Paragraph/Styles**, the **Text band**,
  and the **Text inspector tab** go live against the text target (editing frame or selected
  text frame; disabled with the wire's at-rest faces otherwise): curated family list (Motiva
  Sans leading with system fallback until licensing, per `public/fonts/README`), point sizes,
  B/I/U, L/C/R/J alignment, line spacing, and the two minimal style bundles — **Body · Normal
  / Heading** ("+ New" stays static). Text renders true-scale (pt × 96/72 × zoom), clips like
  a print frame, and raises the **red overflow badge** at the bottom edge when content
  exceeds it. Empty frames keep a faint dashed affordance so they stay findable.

- **Layout editor — step L6, multi-page & masters:** publications grow past one page.
  **Add page** (pages-pane tile + Insert band) inserts after the active page, inheriting its
  master; the pane's thumbnails are **live mini-renders** of each page's model (the same
  ObjectNode tree, CSS-scaled — they can't drift from the canvas), with the red active border,
  click-to-switch, and a hover ✕ (last page guarded); the status bar's **◀ Page N of M ▶ nav
  is live**. **Master pages:** each page binds a master (`A` seeded applied, `B` blank);
  master objects render **beneath page objects, non-selectable** from the page. Click a
  master in the Masters view to **edit it on the canvas** — a brand banner ("Editing master A
  — changes apply to every page that uses it" + Done) marks the mode, every L4/L5 tool works
  on the master surface, and edits **propagate to every applied page**. "Apply to this page"
  rebinds per page; **+ New master** creates blank C/D/… and opens it. Page/master ops are
  undoable with the session pointers resolved across undo (e.g. undoing Add page steps back
  to the neighbor); multi-page files persist and rehydrate onto page 1.

- **Layout editor — step L7, multi-select, align & snapping:** measurement-driven precision
  layout. **Shift-click** toggles selection membership, an empty-canvas drag **rubber-bands a
  marquee**, and grabbing any member **drags the group** (a dragless click collapses back to
  the one object); multi-selections outline every member, with resize handles staying
  single-object. The **Align inspector tab goes live**: six aligns and Distribute H/V
  (equal-gap, ends anchored) against a "Relative to" choice of Page or Selection, with honest
  disabled states (selection-relative needs 2, distribute needs 3) — each action is one undo
  step. **Snapping** engages during move/resize/draw/endpoint drags: page margins, page
  centers, column guides (only while the Guides toggle is on), and other objects'
  edges/centers, within a 6px screen radius at any zoom; the engaged targets render as
  brand-red **smart guides** that clear on release, and snapped geometry lands exactly (the
  e2e proves edge-to-edge equality numerically). Group moves snap as one union box.
- **Layout editor — step L8, side panel with Assets & Layers (plan v1.3):** the pages pane
  grows into a **collapsible side panel** with vertical Pages / Assets / Layers tabs (titles
  rotated 90°; clicking the open tab collapses to the strip). The **Assets tab imports
  content** — file picker or drag-drop, images and PDFs: metadata lives in the document
  (`doc.assets`, the §9 asset model pulled forward additively), bytes in an IndexedDB blob
  store behind a one-file seam. **Clicking an image places it** at natural size (96 DPI,
  scaled to a 2 in working minimum, fit inside the margins, centered) — or fills the selected
  picture frame; frames render their image cover-fit, survive reload, and show a visible
  **"Image missing"** state if the bytes are gone. PDFs join the library but stay honestly
  un-placeable until print tooling lands. The **Layers tab lists the surface top-to-bottom**
  — click selects, **drag restacks** (one undo step, verified against canvas paint order).
  The canvas dropped the wire's name/size/zoom caption and bleed corner marks, and the title
  bar dropped the Pro segment (two experience levels since plan v1.3).
- **Layout editor — step L9, pictures: fill-on-click & drag-in (plan v1.4):** image intake
  moves onto the frame. The Picture tool still draws a gray image box; now a **dragless click
  on an empty frame opens the device file picker** — the chosen file joins the Assets library
  (same IndexedDB store) **and binds to that frame**. Image tiles in the Assets panel are
  **draggable onto any picture frame**: the frame under the cursor highlights and the image
  binds (or swaps) on drop, empty or filled. A frame that already holds an image just selects
  on click; a non-image pick raises a visible note, never a silent fallback; both paths
  persist through reload. The dragless-click detection reuses L7's 3px capture threshold, so
  it never fires after a move or resize.
- **Design revision — single-row ribbon (user-directed):** every command band lays its
  groups' controls in **one row** — the wire's stacked clusters flatten (the big Paste tile
  and the Cut/Copy and Find/Replace columns become uniform pills; Font and Paragraph merge
  onto one line) — with the section dividers kept but the section titles (Clipboard, Font, …)
  dropped as self-explanatory (the name survives as each group's `aria-label`). Controls
  **wrap within their section** as the viewport narrows, so the band grows down instead of
  clipping; band height is auto (min 64px) instead of the wire's fixed 92px. Recorded as
  fidelity deviation #5 (plan §2).

## Where things live

- `src/app/` — routes: `/` (home), `/feedback/board`, `/feedback/releases`; root layout hosts
  the header + overlays.
- `src/components/` — `chrome/` (header, coachmark), `home/`, `report/` (modal steps).
- `src/lib/schema/` — Zod schemas + status metadata. `src/lib/data/` — seed content, verbatim
  from the prototype. `src/lib/store/` — the Zustand store (ported 1:1 from the prototype's
  state class). `src/lib/similar.ts` — the similar-items scorer.
- `public/fonts/` — Motiva Sans drop-in spot (see its README; system fallback until licensed).

## Start here (docs)

- **[STUBS.md](STUBS.md)** — the handoff registry: every stub, inert affordance, known gap, and assumption, with the swap story per seam. Dev teams start here.
- **[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)** — the review of the inputs and the phased build plan for this POC (homepage + feedback tracker, built).
- **[docs/LAYOUT_EDITOR_PLAN.md](docs/LAYOUT_EDITOR_PLAN.md)** — the phased build plan for the **page-layout editor** (the Publisher replacement), mounted behind the homepage's Layout card. In progress — L1–L8 shipped.

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
