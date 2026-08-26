# UI Layout Redesign Plan — Store Tools POC (host app)

Source design: `docs/Publisher replacement.fig`, page **"Proposal"**, sections
**"Select Template"** and **"Builder Home + Tabs"**. The binding screens are the
frames `Home - Page Tab` (two variants), `Home - File Options`, `Layers Tab`,
`Preflight`, `Text`, `Masters`, `Insert`, `Publisher - select a template`
(two variants), `publisher-import-report`, and the dialogs `Booklet Setup
Modal`, `Package Dialog`, `mail-merge-setup`. The frame
`PrintStudio Pro App Suite Preview` and the "Option 1–6" boards are earlier /
aspirational exploration, treated here as directional only.

Scope note: this plan targets the **host POC at the repo root** (Next.js app
under `src/`), not `publisher-prototype/`. `CLAUDE.md` currently records the
host POC as paused; this plan exists because the redesign task explicitly
targets it. No code is written until the plan is confirmed.

---

## 1. Current state (summary)

The app today: a global 52px `AppHeader` (`src/components/chrome/AppHeader.tsx`)
with wordmark, inert search, store label, feedback and notifications; routes
`/` (home/intake), `/layout` (layout editor), `/photo` (photo editor),
`/feedback/*`. The layout editor (`src/components/layout-editor/EditorShell.tsx`)
stacks: TitleBar → ImportBanner → RibbonTabs (File menu + Home/Insert/Layout/
Text/Arrange) → per-tab command band → work row (52px `ToolPalette` · 27px
vertical side-panel tab strip + 188px pane for Pages/Assets/Layers/Review ·
canvas with rulers · 268px `Inspector` with Properties/Text/Align/Page tabs) →
StatusBar. File open/save lives in the ribbon `FileMenu` dropdown. State is in
Zustand (`src/lib/store/layout-store.ts`). Styling is Tailwind v4 with tokens
in `src/app/globals.css` and mostly inline arbitrary values. There are no
shared UI primitives (four independent tab-strip implementations, bespoke
dropdowns).

Known gaps the design addresses: no suite-wide navigation, no real layers
model, no preflight, flat side-panel arrangement, tool palette as a fixed left
rail, no template picker, no find & replace.

## 2. Target UI architecture (from the Figma frames)

Editor screen, top to bottom (1462×906 reference frame):

1. **Suite top nav** — 50px (figma showed 59px; slimmed by request
   2026-08-26), `#cc0000`. "PrintStudio" wordmark (the figma's
   Staples "S" roundel was dropped by request 2026-08-26 — wordmark only);
   suite tabs **Publisher · Bench · Photo Editor · Layouts ·
   Recent Jobs** (white text; the figma's white divider strokes between
   tabs were removed by the same request); search field
   ("Search products, templates, orders — or paste a file link", white, r6);
   right: "Store 3000 (Natick, MA)" + white avatar circle with red initials.
   (Earlier frames show icon-only nav items; the labeled variant appears in
   every later frame and is the one to build.)
2. **Document header** — 35px (figma showed 54px; slimmed by request
   2026-08-26), white, bottom border `#dddddd`. Back arrow;
   centered doc identity "Smith_BizCard_v2 · Business card 3.5×2"; right:
   "Autosaved 10:24" + green status badge (stroke `#048103`).
3. **Menu bar** — 33px, `#f0f0f0`. Left cluster: undo, redo, print icon
   buttons. Menu items **File · Home · Insert · View · Help**; active item
   gets a red underline (and red label in later frames); an *open* File menu
   gets a `#d3d3d3` pill background. (Some frames add Layout/Text/Arrange
   menus — treat File/Home/Insert/View/Help as canonical; see §6 Q1.)
4. **Ribbon band** — ~111px, `#f7f7f7`, groups separated by `#ececec` rules,
   each with a small caption. Home tab groups: **Clipboard** (Paste/Cut/Copy),
   **Font** (family "Motiva Sans", size, B/I/U — one frame adds strikethrough
   and a **Case** group AG/ag/Ag/–), **Paragraph** (lists, alignment, ¶),
   **Styles** (dropdown, "Heading", "+ New"), **Align**, **Arrange**,
   **Editing** (dropdown + "Replace..." → Find & Replace dialog). Insert tab:
   Clipboard + an **Insert** group of split buttons with chevrons: New Slide,
   Table, Image, Shapes, Text Box.
5. **Work row**:
   - **Left panel, "Pages"** — 189px. Header: "Pages" caption + a red pill /
     secondary pill button pair; page thumbnails (selected = red border +
     red number), a "+" placeholder tile, "Add page" caption. On the Masters
     screen the panel also hosts a **master list**: "+ Add" and "Duplicate"
     pills, cards "Master A / Default Template" (selected, red), "Master B /
     Chapter Opener", "Master C / Blank Layout". Tools do **not** live here.
   - **Canvas** — flex-1, `#ededed`/`#eaeaea` pasteboard, rulers, hint line
     "Untitled publication · Letter 8.5 × 11 in · 100%", floating legend card
     "Bleed 0.125 in" (red) / "Margin 0.5 in" (blue `#9fb6df`), and a
     **floating bottom-center tool strip** (465×52, white, r4): select
     (active = red overlay), text "T", shape tools, grouped by dividers —
     this replaces the current left ToolPalette. Master editing adds an amber
     banner: "Editing Master Page Mode: Master A — Changes here will apply to
     all 12 document pages bound to Master A" + "Return to Document" button
     (`#fffbe6`/`#ffe58f`/`#faad14`).
   - **Right panel** — 288px, four horizontal top tabs (active = 4px red
     underline; Preflight tab carries a red count badge). Tab contents seen
     in the frames:
     - **Page** ("Home - Page Tab"): Product ("Custom size" + link "Choose a
       template Instead" `#086dd2`); Page size (two inputs + unit dropdown);
       Orientation (pill toggle pair); Bleed & margins (two inputs);
       "MASTER PAGE APPLIED" dropdown.
     - **Text** ("Text" frame): "Paragraph Styles" list — Heading 1
       (expanded editor: font + size dropdowns, red apply pill), Heading 2
       "Motiva Sans | 32pt | Bold" + "+ Edit", Body Text 18pt, Caption
       "14pt | Light Italic"; full-width red pill at the bottom.
     - **Layers** ("Layers Tab"): "+ New Layer" and "Merge Down" buttons;
       rows with drag grip, colored accent bar, name, badge, eye toggle,
       delete: "Dieline (Red Area)" (red accent, "Non-Print" badge, eye off),
       "Text Content (Active)" (blue `#41b6e6` accent, selected row = red
       border r10), "Images Frame" (green `#aed76f`), "Background Layer"
       (gray, "Locked Base" badge).
     - **Preflight** ("Preflight" frame): header "Preflight Check" +
       secondary button; status "1 issues found · 2 errors" (red dot);
       **Errors** cards (`#ffefed`/`#a30000`): "Missing Font: Proxima Nova",
       "Low-Resolution Image" (72 vs 300 DPI) — each with description,
       location tag ("Page 1 · Header Text"), action button; **Warnings**
       cards (`#fff6df`/`#a67300`): "Text Overflow", "Object Too Close to
       Trim", "Bleed Not Extended", "Hairline Rule Below Minimum"; full-width
       red CTA at the bottom. Canvas shows matching red pin markers and an
       inline alert banner.
     - **Master Properties** (contextual, Masters screen): TEMPLATE NAME and
       INHERIT FROM dropdowns, CANVAS FOOTPRINT card ("Letter (8.5 × 11.0
       in)", "Portrait layout mode"), MARGIN BLUEPRINT (four 0.5" inputs).
6. **Status bar** — 29px, `#ececec`: "◀ Page 1 of 1 ▶" · "Select tool ·
   ready" · view-mode chips · zoom − slider + "100%".

Overlays and adjacent screens:

- **File menu** ("Home - File Options"): 215×236 dropdown popover under File,
  five rows, hover row `#ecf4fd`, slim scrollbar. (Row labels are icon
  instances in the file — see §6 Q2.)
- **Find & Replace** ("Home - Page Tab" v2): 450×397 modal, r12 — FIND /
  REPLACE WITH inputs, checkboxes, "Use GREP Regular Expressions" toggle,
  "RESULTS (23 INSTANCES FOUND)" list with per-page snippets, secondary +
  primary (red) footer buttons.
- **Template picker** ("Publisher - select a template"): full-screen under the
  suite nav — left "Filters" panel (search, accordions "Copy & Print
  Products" → Finishing Only / Simple Print / Presentation and Manuals /
  Booklets; "Sort By" radios) and a "Template Explorer" with carousel rows
  **Booklets**, **Flyers**, **Blank Sizes** (A3/A5 portrait & landscape,
  dimension captions). v2: selecting a card (red border, `#fff1f1`) opens a
  473px right drawer — Page Dimensions, Orientation toggle, Margins, Bleed,
  Slug — footer "Create Document" (red pill, full width).
- **Publisher import report** ("publisher-import-report"): full-screen
  post-conversion review — left preview "Converted Document Preview
  (Newsletter_Spring2024)", right panel: green "Conversion Complete", stats
  card "14 Pages / 3 Items errors / 1 Warning", cards for Font Substitution
  ("Calibri > Arial, Pages 1–14"…), Text Overflow warning, Color Conversion
  ("3 RGB objects converted to CMYK"), Missing Font error; footer secondary +
  primary buttons; status bar "◀ Document View ▶ · Publisher File Imported
  with conversion logs".
- **Dialogs** (later scope): Booklet Setup & Imposition Preview (fold-seam
  diagram, inside/outside margins, creep slider, "Document has 8 pages.
  Perfect fit for 4-page signatures."), Collect for Output & Package Job
  (asset/font/profile collection, destination path, payload size), Mail
  Merge Setup (steps rail Select Data Source → Map Fields → Preview Records →
  Generate Sheets; `customers_q4.xlsx`; field mapping; "Matched: 847 of
  1,203 recipients").

### Design tokens observed

Brand red `#cc0000` (top nav, active states, primary pills, selected
thumbnails, badges); chrome grays `#f7f7f7`/`#f0f0f0`/`#ececed`–`#ececec`;
pasteboard `#ededed`/`#eaeaea`; text grays `#4d4d4f`/`#555555`/`#757575`/
`#777777`; borders `#dddddd`/`#cccccc`/`#e6e6e6`; link blue `#086dd2`; hover
blue `#ecf4fd`; guide blue `#9fb6df`; layer accents `#41b6e6`/`#aed76f`;
success `#048103`/`#ebfaeb`; warning `#fffbe6`/`#ffe58f`/`#faad14`/`#d19400`/
`#a67300`; error `#ffefed`/`#a30000`/`#dd1700`/`#ff4d4f`. Pills are r28–r100;
cards r6–r12. These become named tokens in `globals.css` `@theme` (replacing
ad-hoc grays where touched).

## 3. Mapping: current → target

| Current | Target |
|---|---|
| `chrome/AppHeader.tsx` (white, 52px) | Suite top nav (red, 59px): wordmark, suite tabs, search, store + avatar |
| `layout-editor/TitleBar.tsx` | Document header (Back · name + product · Autosaved + badge) |
| `ribbon/RibbonTabs.tsx` (Home/Insert/Layout/Text/Arrange) | Menu bar (File/Home/Insert/View/Help) + undo/redo/print cluster |
| `ribbon/HomeBand…ArrangeBand` | Home ribbon regrouped (Clipboard/Font/Paragraph/Styles/Align/Arrange/Editing); Insert ribbon (split buttons) |
| `palette/ToolPalette.tsx` (left, 52px) | Floating bottom-center canvas tool strip |
| `panel/SidePanel.tsx` (Pages/Assets/Layers/Review vertical tabs) | Left panel = Pages (+ Masters list); Layers moves right; Assets/Review relocated (§6 Q3) |
| `inspector/Inspector.tsx` (Properties/Text/Align/Page) | Right panel tabs: Page / Text / Layers / Preflight (+ contextual Master Properties); Align stays in ribbon |
| `ribbon/FileMenu.tsx` (Open/Save/Recent dropdown) | File menu popover, same capabilities, new visual per "Home - File Options" |
| `pages/PagesPane.tsx`, `MasterThumb.tsx` | Pages panel thumbnails + master cards with names/descriptions + amber master-edit banner |
| `panel/ImportReportPane.tsx` | Full-screen publisher import report |
| Home `IntakeColumn` new-doc tiles | Template picker screen (filters + Template Explorer + config drawer → "Create Document") |
| — (new) | Preflight tab + engine, Find & Replace, layer model |
| `StatusBar.tsx` | Same regions, new visual (zoom slider, view chips) |

## 4. Implementation phases

Each phase lands independently; gate for every phase: `npm run typecheck`,
`npm run lint`, `npm run test`, `npm run e2e` green (updating specs in `e2e/`
as chrome changes), plus a review pass. Store changes stay in
`layout-store.ts` unless a schema change is agreed (§6).

**Status (2026-08-25): Phases 0–9 are implemented and green** — the full
redesign scope; Phase 10 remains deferred, each item needing its own plan (typecheck,
lint, 1121 unit tests, 141 e2e — the one red e2e is a pre-existing
environment failure: the jailed HEIC conversion needs a codec this container
lacks; it fails identically on the pre-redesign baseline). Notes of record
from implementation: Popover/Modal/Field primitives deferred from Phase 0 to
their first consumers to avoid dead code; the inspector's Page tab is the
contextual properties surface (page setup at rest, object properties with a
selection) so the old Properties tab's functions survive within the four-tab
figma layout; the import Review pane rides as a conditional fifth inspector
tab until Phase 9's full-screen report; Distribute + Relative-to joined the
Home band's Align group when the Align inspector tab retired. Phase 6's
preflight tiers the figma's thresholds (error under 150 DPI, warning under
300; safe zone 0.125 in) and skips hidden/non-print layers. Phase 9's
import report opens automatically for reviewable imports and closes onto a
deep-linked object; the fixture banner gained View report as the reopen
path.

- **Phase 0 — Foundations.** Add the token palette above to `globals.css`
  `@theme`. Create shared primitives in `src/components/ui/`: `PillButton`
  (primary/secondary), `TabStrip` (horizontal, red-underline active,
  optional badge), `Popover/Dropdown`, `Badge`, `IconButton`, `Modal`,
  `Field`. *New pattern, flagged deliberately:* the codebase has no shared
  primitives and the redesign repeats these shapes on every surface; four
  existing tab-strip implementations is the evidence.
- **Phase 1 — Suite chrome.** Rebuild `AppHeader` as the red suite nav
  (Publisher/Bench/Photo Editor/Layouts/Recent Jobs — Publisher → `/layout`,
  Photo Editor → `/photo`, others inert placeholders for now, § 6 Q4); store
  identity + avatar; search placeholder per design (still inert). Add the
  document header inside the layout editor. Keep feedback/notifications
  affordances (relocated into the avatar/menu area).
- **Phase 2 — Menu bar + ribbon.** Replace `RibbonTabs` with the menu bar
  (File/Home/Insert/View/Help, undo/redo/print cluster). Regroup band
  content: Home = Clipboard/Font/Paragraph/Styles/Align/Arrange/Editing;
  Insert = Insert split-buttons (Table stays disabled as today). Current
  Layout/Text/Arrange band features that disappear from tabs are rehomed
  (Text → right-panel Text tab and Font/Paragraph groups; Arrange → Arrange
  group; Layout/page setup → right-panel Page tab). View/Help stay inert
  labels unless confirmed otherwise.
- **Phase 3 — Work row.** Left panel becomes Pages-only (189px, per spec);
  tool palette becomes the floating bottom-center strip over the canvas;
  canvas gains the bleed/margin legend card and hint line. Side-panel
  vertical tab strip is removed; Assets pane is parked behind an Insert →
  Image flow or a temporary right-panel tab (§6 Q3).
- **Phase 4 — Right panel.** New 288px inspector with `TabStrip`: **Page**
  (port of today's PageTab + Properties merge, per spec fields), **Text**
  (paragraph styles list — backed by the existing text-style model; style
  editing v1 = apply + edit font/size), **Layers**, **Preflight** (see next
  two phases for engines). Align tab retires (ribbon covers it).
- **Phase 5 — Layers.** v1 renders the design's list UI over the existing
  per-page z-order (each object = a row; accent color by object type; eye =
  visibility flag; lock flag; no Merge Down until a real layer model
  exists). A true named-layer model changes the document schema —
  stop-and-ask decision (§6 Q5) before any `.staples` format change.
- **Phase 6 — Preflight.** Rule engine in `src/lib/` (framework-free):
  text overflow (exists as `OversetCheck`), object-outside-safe-zone, bleed
  not extended, hairline rule, low-res image (from asset DPI at placed
  size), missing font (font catalog lookup). Right-panel tab with count
  badge, error/warning cards with locate action (select + scroll canvas),
  canvas pin markers, inline alert banner.
- **Phase 7 — File menu + Find & Replace.** Restyle `FileMenu` as the
  popover (keeping Open/Save/Save As/folder/Recents behavior and dirty
  guard); add autosave indicator to the document header (wired to the
  existing persist layer — "Autosaved HH:MM"). Find & Replace modal from
  ribbon Editing: plain-text search across text objects with per-page
  result snippets, replace/replace-all; GREP toggle only if trivially
  backed by `RegExp` (else deferred, §6 Q6).
- **Phase 8 — Masters.** Masters list card UI in the Pages panel (name +
  description), amber editing banner + "Return to Document", contextual
  Master Properties panel. Backed by existing master-page model.
- **Phase 9 — Template picker + import report.** Template picker as the
  new-document flow (route or full-screen surface from Home / "Choose a
  template Instead"): filters, explorer rows (seed with existing presets +
  blank sizes), config drawer → Create Document → `/layout`. Import report
  becomes a full-screen review surface fed by the existing
  `importReport` data (today's `ImportReportPane` retires).
- **Phase 10 — deferred (design exists, out of initial scope).** Booklet
  imposition, Package job, Mail merge, table editor, PDF export presets,
  "Bench"/"Layouts"/"Recent Jobs" suite surfaces, photo editor re-skin to
  the new chrome. Each needs its own plan before work starts.

Phases 1–4 are the "updated UI layout" the task asks for; 5–9 make the new
chrome honest (every visible affordance functional or explicitly disabled).

## 5. Testing

- Unit (vitest): preflight rules, find/replace matching, layer-row mapping,
  template-picker → document-preset mapping.
- E2E (playwright, update `e2e/layout-editor.spec.ts`, `smoke.spec.ts`,
  `storage.spec.ts`): chrome regions render; menu-bar tab switching; file
  menu open/save round-trip unchanged; tool strip selection; right-panel tab
  switching incl. Preflight badge; master edit banner; find & replace flow.
- Existing import/photo/storage suites must stay green — no behavior change
  intended outside the UI layer except where phases say so.

## 6. Decisions of record (confirmed 2026-08-24)

Governing rule: **where the POC and the Figma disagree, follow the Figma —
unless doing so would drop a feature or function, in which case stop and
ask.**

1. **Menu set** — the five-item canonical set: File / Home / Insert / View /
   Help. Layout/Text/Arrange content rehomes into ribbon groups and the
   right panel; the eight-item variants in the mail-merge/suite frames are
   design drift.
2. **File menu rows** — New / Open / Save / Save As / Recent. All current
   file capabilities (folder support, Recents, dirty guard) are kept per the
   no-dropped-functions rule.
3. **Assets & import-review panes** — both retire. Asset placement rehomes
   to Insert → Image; import review rehomes to the full-screen import
   report screen.
4. **Suite tabs** — render all five; Bench / Layouts / Recent Jobs are
   disabled until surfaces exist.
5. **Layer model** — real named layers, implemented as **schema v3 nested
   containers** (chosen over the additive tag model at the Phase 5 schema
   sign-off): document-level `layers` definitions (name, color, visible,
   locked, nonPrint) with per-page `{layerId, objects}` containers aligned to
   the definition order. `version: 3`; v1/v2 documents migrate on read
   (localStorage, `.staples` files, imports) with all content landing on the
   base layer, z-order intact. Masters stay flat. Z-reorder actions clamp to
   the object's layer band; hidden layers neither render nor hit-test;
   locked layers render but reject selection.
6. **Find & Replace** — build the GREP toggle, backed by `RegExp` with
   invalid-pattern handling.
7. **Right-panel tab labels** — Page / Text / Layers / Preflight.
8. **Host-POC pause** — un-paused. `CLAUDE.md` updated: both apps active,
   every task clearly directed at one app or the other unless and until
   they are merged.
