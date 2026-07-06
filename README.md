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

**`.pub` import — live vs. demo mode.** Converting real Publisher files needs the
`libmspub-tools` binary (`pub2raw`). Where it's absent — a plain `npm run dev` on a machine
without it — the importer falls back to **fixture mode** and serves a built-in demo
publication (the "GRAND OPENING" flyer) for *any* file; the editor shows an amber **demo-mode
banner** so this is never mistaken for a real conversion. To convert real files, either run the
**Docker image** (it bundles the converter) or `apt install libmspub-tools` where the app runs.
Ask the server which mode it's in:

```bash
curl http://localhost:3000/api/import     # {"mode":"live"|"fixture", "reason":"…", "pub2raw":{…}}
```

`mode:"fixture"` with `fixtureForced:true` means `STP_IMPORT_FIXTURE=1` is set in the
environment (remove it); with `pub2raw.available:false` means the binary isn't installed on
that server.

**Developing locally (macOS/Windows).** A plain `npm run dev` on a laptop has no
`libmspub-tools`, so `localhost:3000` runs in demo mode — real `.pub` files show the sample
flyer with the amber banner. Two options: (a) test real imports against the **Docker image**
(`localhost:8080`), which bundles the converter — recommended; or (b) install the tools
natively so the dev server converts live. On macOS the CLI tools come from **MacPorts**
(`sudo port install libmspub`), *not* Homebrew (its `libmspub` is the library only); on
Debian/Ubuntu, `sudo apt install libmspub-tools`. Restart `npm run dev` after installing and
`curl localhost:3000/api/import` should report `"mode":"live"`.

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
| Layout editor — shell, document model, objects, text, multi-page & masters, multi-select/align/snap, side panel with assets & layers, picture fill-on-click & drag-in, rotation & Arrange, ruler guides & units (L1–L11) | ✅ shipped |
| Layout editor — toolset build-out: spreads & mixed sizes, clipboard (L12–L13) | ✅ shipped |
| Layout editor — experience levels (Simple/Standard), hardening (L14–L15) | ❌ next in the L-sequence |
| Customer proof station — counter sign-off: customer view, associate dispatch, session service | ❌ planned, sequenced **before UAT** — spec + build plan in docs (PS1–PS5) |
| Product/SKU catalog binding | ❌ inert affordance; schema field exists |
| `.pub` import — geometry-first pipeline (P1): sniff → `pub2raw` → trace parser → mapper, fixture mode, homepage callout live | ✅ shipped — the import proof point |
| `.pub` import — content core (P2): schema v2 per-run text + ink color, real vector paths, §10.5 font library (self-hosted stand-ins + tiered remap + Wingdings translation), v1→v2 migration | ✅ shipped — labels corpus 176/192 clean (was 34) |
| `.pub` import — image extraction (P3): bitmap fills + graphic objects → deduped assets, real bytes seeded to the editor's asset store, stretch-fit rendering | ✅ shipped — labels corpus **192/192 clean** |
| `.pub` import — review layer (P4): import report panel with deep links, font-load-gated overset check, `.puz` (CAB) unpacking | ✅ shipped — pure-TS MSCF/MSZIP unpack verified live; report Review tab + overset surfaced |
| Open/save/export, print production | ❌ specified in docs (plan §8–§11) |
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
  step. **Snapping** engages during move/resize/draw/endpoint drags — the same target set for
  all four — against page margins, page centers, the **bleed line**, column guides and
  ruler guides (while the Guides toggle is on), and other objects' edges/centers, within a 6px
  screen radius at any zoom (ruler guides and the bleed line joined the set in L11 and after);
  the engaged targets render as brand-red **smart guides** that clear on release, and snapped
  geometry lands exactly (the e2e proves edge-to-edge equality numerically). Group moves snap
  as one union box.
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
- **Layout editor — step L10, rotation & Arrange (plan v1.4):** a **stemmed rotate handle**
  above the selection turns a frame about its center (**Shift snaps to 15°**), the status bar
  reads the live angle, and a **Rotation field** in Properties round-trips degrees — all one
  undo step. The selection chrome (and the text-edit overlay) rotate with the object; a
  rotated frame **resizes in its own local axes** (the fixed corner stays put in page space),
  and rotated objects snap by their axis-aligned footprint (the honest simplification). The
  **Arrange ribbon tab goes live**: Order (bring to front / forward / backward / to back),
  Rotate (90° left / right / reset), and Align (the L7 actions) — all against the selection,
  verified against real canvas paint order. Grouping and effects stay in the backlog.
- **Layout editor — step L11, ruler guides & units (plan v1.4):** **drag a guide out of
  either ruler** — top ruler for horizontal, left for vertical — a live line follows the
  pointer and drops into the model, spanning the **full workspace** (the whole pasteboard,
  not just the page). Guides are **selectable**: a plain click selects one (it turns
  **brand-red**) without nudging it, then **Delete** removes it — or **drag** it to reposition,
  or drag it back onto the ruler to delete. Guide and object selection are mutually exclusive,
  so Delete is unambiguous. Objects **snap to guides** just like margins and page centers (the
  engaged guide shows a brand-red smart line). Guides are visual-only (`pointer-events: none`)
  and grabbed by a board-level hit-test, so an **object on top of a guide always wins the
  click** — objects take priority. The whole canvas column **suppresses native HTML drag**
  (`onDragStart` → `preventDefault`, rulers included): guide drags run on window listeners
  (attached at pointer-down, no capture), and without the guard a press would start a browser
  drag and fire `pointercancel` mid-gesture. A **unit toggle** in the status bar (`in` / `mm` /
  `px` / `pt`) relabels the rulers, every length field (Page W/H, bleed, margin, X/Y/W/H), and
  the bleed/margin legend, round-trips typed input, and **persists** with the document. Guides
  and the chosen unit both survive reload.
- **Design revision — single-row ribbon (user-directed):** every command band lays its
  groups' controls in **one row** — the wire's stacked clusters flatten (the big Paste tile
  and the Cut/Copy and Find/Replace columns become uniform pills; Font and Paragraph merge
  onto one line) — with the section dividers kept but the section titles (Clipboard, Font, …)
  dropped as self-explanatory (the name survives as each group's `aria-label`). Controls
  **wrap within their section** as the viewport narrows, so the band grows down instead of
  clipping; band height is auto (min 64px) instead of the wire's fixed 92px. Recorded as
  fidelity deviation #5 (plan §2).
- **Layout editor — step L12, spreads & mixed page sizes (plan v1.4):** the status bar's
  **two-page spread toggle goes live** with Publisher pairing (page 1 alone, then 2|3, 4|5 …) —
  the partner page renders beside the active one, a click activates it, and every editing
  gesture keeps targeting the active page; spread view is session-only. The **Page tab gains
  "Apply to: Whole document / This page"** — a per-page size override (`sizeOverride`, the §9
  v2 delta pulled forward additively) honored by canvas, rulers, thumbnails, spreads, guides,
  and snapping; clearing it returns the page to the document size.
- **Layout editor — step L13, clipboard: copy, cut & paste (plan v1.4):** **Cmd/Ctrl+C/X/V and
  the Home band's Clipboard pills go live** against an in-app object clipboard — multi-selection
  copy, cut as copy+delete in one undo step, paste onto the current editing surface (any page
  or master, surviving navigation) with the duplicate offset and cascading repeat pastes, fresh
  ids, pictures keeping their assets. Inside a text-editing session the browser's native
  clipboard keeps working untouched; pill enabled states track selection and clipboard content.
- **`.pub` import — step P1, the geometry-first pipeline (plan §10, v1.5):** the POC's **first
  server slice**. The homepage's `.pub` callout goes live: pick a Publisher file and
  `POST /api/import` runs **content-sniff** (CFBF magic + `Contents`-stream markers — never the
  extension) → the **`pub2raw` subprocess** (size cap, timeout+kill, per-job scratch jail; the
  one-file seam of plan §10.7) → a **trace parser** ground-truthed against librevenge's raw
  generator (format quirks and all — see `fixtures/pub-traces/README.md`) → an intermediate
  model → the **geometry mapper**: pages (with per-page `sizeOverride`), rects/ellipses/lines
  placed exactly, rotation converted CCW→CW, fills/strokes, text frames with content, dominant
  font/size/alignment, and Publisher's 1.19 default line spacing; polygons/paths degrade to
  bounding boxes, images to placeholder frames, tables to flagged placeholders — every
  simplification lands in the structured **import report** (`{fidelity, fonts, notes}`), nothing
  silent. **Fixture mode** serves the golden demo trace wherever `libmspub-tools` isn't
  installed, so dev/CI/e2e run with zero native dependency; the Docker runner moved to
  **Debian slim + libmspub-tools** and is where live conversion executes. Replacing a
  publication that has content asks first; the imported document opens in the editor named
  after its file, fully editable and persisted.
- **`.pub` import — real-corpus validation:** four real store files
  (`fixtures/pub-corpus/`: binder tabs, a two-sided customer business card, production
  checkpoint labels, a 10-up imposition template) now convert **live** end-to-end and their
  traces are the primary goldens (16 corpus tests). Reality corrected the synthetic
  assumptions — inch-denominated font sizes, frame styling on `startTextObject`, leaked `\r`
  terminators, `insertSpace` word spacing, and the **rotation sign (clockwise passthrough,
  verified against pub2xhtml's reference render)** — and surfaced one honest upstream
  limitation: master-page-only publications convert empty and are flagged tier-3
  (libmspub never emits master pages). Default 0.04 in text insets report once per document
  instead of drowning the report per-frame; the corpus fonts (Calibri, Goudy Old Style,
  HelveticaNeueLT Pro, Wingdings) seed §10.5's P2 remap table.
- **`.pub` import — step P2, the content core (plan v1.6): schema v2 + fonts + paths.** The
  document model moves to **`version: 2`**: text is **paragraphs of styled runs** (per-run
  family/size/weight/style/underline **and ink color**), plus paragraph indents, text-frame
  **insets** (Publisher's 0.04 in survives round-trip now) and **vertical alignment**, and a
  real **`path` object** (normalized M/L/C/Z segments — resize/rotate/align tooling works on
  paths unchanged). Persisted v1 documents **migrate on load** (`src/lib/schema/layout-v1.ts`)
  — the production posture, practiced in the POC. The **§10.5 font library ships**: eight
  libre families vendored as self-hosted WOFF2 (`scripts/vendor-fonts.mjs` → `public/fonts/`,
  no CDN), lazily registered via FontFace with overflow re-measured when faces land; the
  **remap table is data** grown from the corpus — Calibri *stays Calibri* (Carlito renders it
  where the real face is missing, metric-compatible), HelveticaNeue LT Pro cuts → Libre
  Franklin (tier 2, honest note), Goudy Old Style via Sorts Mill Goudy, **Wingdings checkbox
  glyphs translate to real ✔/✘/☑ symbols** with a report note. The canvas renders runs
  faithfully (the labels corpus's white-on-dark text finally reads white) and the
  **contentEditable overlay is run-aware**: it seeds styled spans (editing an imported frame
  is WYSIWYG) and parses the browser-mutated DOM back into runs, so editing preserves
  imported styling. Live corpus re-check: the 192-shape checkpoint labels went from
  34 converted / 158 degraded (P1) to **176 / 16**, with all 128 vector shapes as real paths.
  Still honest: images (P3), tables, arcs, and selection-scoped styling remain flagged
  degradations or later slices.
- **`.pub` import — step P3, image extraction (plan v1.7): pictures convert for real.** The
  corpus corrected the spec before build: real Publisher images arrive as **bitmap fills**
  (`draw:fill: bitmap` + base64 `draw:fill-image` on `setStyle`, stretched onto rectangle
  polygons), not as `drawGraphicObject` embeds — the pipeline now extracts **both paths**.
  Payloads are sniffed by magic bytes (never the declared MIME — same posture as the `.pub`
  sniffer), PNG/JPEG/GIF dimensions parsed from headers, and **deduped by content hash**: the
  checkpoint-labels file stamps one 915×300 logo onto 16 frames and imports as 16 picture
  frames sharing **one** asset. Bytes ride the import response as base64 (`assets`, a new
  Zod contract) and the client seeds them into the same IndexedDB asset store the L8 upload
  path uses — pictures re-resolve whichever side of the async write they mount on. New
  picture `fit` mode renders imports **stretched** (Publisher's scaling) while uploads keep
  cover-fit. Honest edges: WMF/EMF/TIFF can't render in a browser and stay placeholders with
  a format-named note (no asset); bitmap fills on non-rectangular shapes keep their vector
  geometry, unfilled, with a note. Live corpus: labels **192/192 converted, 0 degraded**
  (P1: 34/158 · P2: 176/16); the business card's 600×434 JPEG (~1 MB) extracts and renders.
  Verified end-to-end: 348 unit tests, 77 e2e, live conversion of all four corpus files.
- **`.pub` import — step P4, the review layer (plan v1.8): the associate sees exactly what to
  review.** Three pieces. **(1) Import report panel** — a side-panel "Review" tab that renders
  the fidelity report (remapped fonts as `source → mappedTo` + reason, overset frames, and
  notes grouped by tier: "Not converted" / "Simplified"); every object-anchored row is a
  **deep link** that selects the frame and jumps to its page. It auto-opens on import when
  there's something to review, and the top-of-canvas banner gained a "View report" button.
  **(2) Overset check** — Publisher's shrink-to-fit plus font remapping can render text taller
  than its box; a headless pass measures every imported text frame across all pages in a
  detached container that mirrors the canvas's exact layout (insets, wrap, subpixel cushion),
  **gated on `document.fonts.ready`** and re-run when a late-loading webfont changes the
  verdict, then lists the overflowing frames in the report. **(3) `.puz` unpacking** — a
  Publisher "pack-and-go" file is a Microsoft Cabinet wrapping the `.pub`; a **pure-TypeScript
  MSCF reader** unpacks it (STORED + MSZIP with cross-block dictionary continuation; Quantum/LZX
  rejected honestly), re-sniffs the extracted bytes (never the archived name), and re-enters the
  same pipeline — no new native dependency. Verified live: a real 100 KB `.pub` in a 4-block
  stored CAB unpacks and converts identically to the raw file. Honest limit: no real `.puz`
  sample exists to test against, so MSZIP byte-compatibility with Publisher's own packer is
  unconfirmed — unsupported compressions fail with clear guidance, never silently. Verified:
  369 unit tests, 80 e2e, live corpus + live `.puz`.

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
- **[docs/LAYOUT_EDITOR_PLAN.md](docs/LAYOUT_EDITOR_PLAN.md)** — the phased build plan for the **page-layout editor** (the Publisher replacement), mounted behind the homepage's Layout card. In progress — L1–L13 shipped; the K-tranche (Konva render) and P-tranche (`.pub` import, incl. the §10.5 font library & mapping plan) are specified and next.
- **[docs/CUSTOMER_PROOF_STATION_PLAN.md](docs/CUSTOMER_PROOF_STATION_PLAN.md)** — the build plan for the **customer proof station** (counter sign-off: customer view + associate "Send proof" + SSE session service, steps PS1–PS5), sequenced ahead of UAT. Implements [docs/Customer_Proof_Station_Spec.md](docs/Customer_Proof_Station_Spec.md).

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
- `docs/Customer_Proof_Station_Spec.md` — the customer-facing proof station functional/technical spec (transport, pairing, screens, signed-proof artifact, session hygiene).
- `docs/PUB_TO_IDML_RESEARCH.md` — the `.pub` parse/convert research (`libmspub` front end, intermediate model, IDML target) the import pipeline builds on.
- `docs/SECURITY_CONSIDERATIONS.md` — the cross-cutting threat model; gates the import pipeline (§2.1, layout plan §10.1) and the proof station (§2.6/§2.7).
