# Handoff: In-Store Suite — Feedback, Bug & Feature-Request Tracker

## Overview

A field-facing (counter-associate) tracker that lets any Staples print-shop store **report a bug, request a feature, upvote what other stores raised, and see it ship** — from inside the tools they already use. The product team gets a ranked, de-duplicated, release-aware queue; the field gets a visible status on every item and a "you asked, we delivered" loop when things ship.

This prototype covers the **three counter-associate surfaces** (the team-side triage console is out of scope for this build):

1. **Report entry** — a "Give feedback" affordance in the app header → a short problem/feature form with auto-captured context and live "similar items" detection.
2. **The board** — the population-wide ranked list: browse, search, filter (incl. store-hierarchy roll-ups), upvote, follow, and open an item's detail.
3. **What's new / Releases** — the version history and the public "you asked, we delivered" changelog.

Plus the connective tissue: a **notification bell** with unread count, and a **celebratory "shipped" moment** that auto-plays the first time a store lands on the board.

The full product spec this was built from is included in this bundle as `FUNCTIONAL_DESIGN.md`.

---

## About the design files

The HTML files in this bundle are **design references**, not production code to copy line-for-line. They are prototypes that demonstrate the intended **layout, flow, copy, interactions, and motion**. The task is to **recreate these designs in the target codebase's environment** (React/Vue/Swift/etc.) using its established components, state patterns, and styling conventions. If no front-end environment exists yet, pick the most appropriate framework for the project and implement there.

Two representations of the same design are included:

- **`feedback-tracker-prototype.html`** — a single self-contained file that **runs in any browser with no setup**. Open it to click through every flow. This is the behavioral source of truth.
- **`Feedback Tracker Prototype.dc.html`** — the readable source. It is authored as a "Design Component": the markup lives between `<x-dc>…</x-dc>` and the logic in a `class Component extends DCLogic { … }` block near the bottom. Read it for exact structure, inline styles, copy, and the `renderVals()`/handler logic. (It needs a runtime to execute — use the offline HTML above to actually run it.)

---

## Fidelity

**Mid-fidelity wireframe.** Treat the two layers differently:

- **Follow closely (intentional):** information architecture, screen layout, component composition, the exact **copy**, all **interactions/flows**, the **state model**, and the **motion** described below. These are the design.
- **Replace when productionizing (placeholder):** the literal grayscale-wireframe visual styling. The palette is deliberately restrained — **white surface, structural grays, and Staples red (`#CC0000`) used only for action/active/warning**, with green for shipped/fixed. All product imagery is rendered as flat gray placeholder rectangles (`#e4e4e4`). When building for real, apply the **Staples design system** (real Motiva Sans type scale, real product photography, real components) rather than reproducing the gray boxes. The tokens listed at the end tell you what the wireframe used so you can map them.

Icons are inline SVG in a **Lucide** style (stroke ~1.8–2.2, `currentColor`). Swap for the codebase's icon set.

---

## Global frame & chrome

- **Canvas:** a single fixed **1440 × 900** "in-store station screen" (desktop, landscape), white, `border-radius: 12px`, on a `#cfcfcf` desk. Productionize as a normal responsive desktop app; the fixed frame is just the wireframe device.
- **Type:** **Motiva Sans** (Staples brand face). Body = Light 300, emphasis = Medium 500 / Semibold 600, headings = Bold 700. No italics, no all-caps except small uppercase section labels with `letter-spacing: .04em`.
- **Persistent header (52px, `#f0f0f0`, bottom border `#e0e0e0`):**
  - Left: red `Staples` badge (`#CC0000`, white text, `border-radius:3px`) + `Print Studio` (700/14).
  - Center: search field (440×32, white, 1px `#d6d6d6`, radius 6) — placeholder "Open a file or pick a product…". Decorative in this prototype.
  - Right: `Store #1284` (12/#777) · **Give feedback** button · **notification bell** · avatar (28px gray circle).
  - **Give feedback button:** outlined, white bg, 1px `#e2b4b4`, radius 7, 6×11 padding; red message-square icon + `Give feedback` (12/600/#CC0000); hover bg `#FBEBEB`. This is the persistent, unobtrusive entry to the report flow — present on **every** surface.
  - **Notification bell:** 33×33, white, 1px `#e0e0e0`, radius 7. Unread badge: min 17px red circle, top-right, white 700/10 count, 2px `#f0f0f0` ring. Opens the notifications dropdown.
- **Tracker sub-bar (46px, white, bottom border `#ececec`)** — shown only on the board & releases:
  - `‹ Back to Print Studio` (chevron + 12/500/#666, hover red) → returns to Home.
  - Tabs `The board` and `What's new`: 7×15 padding, radius 7, 13/600. Active tab = `#CC0000` bg + white text; inactive = white bg + `#666`.

---

## Screens / Views

### 1. Home & file intake (entry context)

**Purpose:** the tool the associate is already in; shows how they reach the tracker.

**Layout:** header + an 848px body: a full-width **quick-jump tool row** across the top, then a two-column area below.

- **Quick-jump tool shortcuts (top row, full width, 16×26 padding, bottom border `#ececec`, 14px gap):** five equal cards that jump straight into the suite's main tools — **Document** (Word, PDF & text), **Layout** (Design & arrange), **Quick Fix** (Auto-repair file content), **Photo Edit** (Crop, retouch, color), **Print Setup** (Size, bleed & imposition). Each card: white, 1px `#e6e6e6`, radius 10, 13×15 padding; a 40px `#f4f4f4` rounded square holding a Lucide-style icon (file-text / layout / wrench / image / printer, stroke `#555`) + label (700/14) and descriptor (11/#999); hover → red border + soft shadow. Placeholder shortcuts (no destination wired in this prototype, like the product tiles).

- **Left column (520px, right border `#ececec`, 26px padding, 16px gap):**
  - Uppercase label `BRING IN A FILE`.
  - **Dropzone:** 2px dashed `#c4c4c4`, radius 10, bg `#fafafa`, 196px tall. Centered: up-triangle glyph in a 46px rounded-square outline; `Drop a customer file to start` (500/15/#444); `We detect the type — no need to pick a tool` (12/#8c8c8c); a wrap of file-type chips — `JPG PNG HEIC SVG PDF DOCX XLSX PPTX` (outlined, 11/#777) then `.PUB` (red fill, white) and `ZIP` (outlined).
  - **Actions row:** `Browse files` (red `#CC0000`, white, radius 6, 40px) + `Fetch from an order` (white, 1px `#cfcfcf`).
  - **.pub callout:** 1px `#f0c9c9`, bg `#FBEBEB`, radius 8; `Got an old .pub file?` (600/13/#9a1818) + subcopy + `Convert →`.
  - Divider, then `START A NEW DOCUMENT OR PRINT LAYOUT` + a 2×2 grid of size tiles: **Letter** 8.5×11, **Legal** 8.5×14, **Ledger** 11×17, and **Custom size** (dashed red, `+`).
- **Right column (flex, 26px padding):**
  - Header row: `PICK A PRODUCT` + `Sorted by most used` (left); a red-outline `Recent projects ▾` pill + `Browse all templates →` (blue link) (right).
  - **Product grid:** 4 columns × 3 rows = 12 tiles, each a bordered card (1px `#e6e6e6`, radius 8) with an 80px gray media area + label (12/500/#444): *Business cards, Flyers, Documents, Postcards, Rack cards, Posters, Signs, Banners, Labels, Stickers & decals, Booklets, Envelopes*.
  - **Board-entry / recognition card** (bottom, pushed down by a flex spacer): dashed `#d8d8d8`, radius 10, bg `#fbfbfb`. Red message icon + `Feedback from your store helped ship {impact} improvements` (600/13; number in red) + subcopy; `Open the board →` (red, cursor) navigates to the board.
- **Coachmark (dismissible):** on first Home visit, a dark `#1a1a1a` tooltip (radius 10) points at the Give-feedback button — `Hit a snag or have an idea?` + subcopy. Controlled by the `coachmark` prop.

### 2. Report flow (modal, 640px, centered, `popIn`)

A 4-step modal opened by any "Give feedback" affordance.

- **Step "choose":** title `Give feedback` + `One sentence from you — we capture the rest.`; two option cards (hover: red border + `#FBEBEB`):
  - **Report a problem** (red alert-triangle icon) — subcopy "Something broke or looks wrong. We'll attach what you were doing automatically."
  - **Request a feature** (blue lightbulb icon) — subcopy "An idea to make the tool better. We'll tag it to where you are."
  - Footer link `or browse the feedback board →`.
- **Step "bug"/"feature" (form):** back chevron + title + close X. Body:
  - **Title input** (42px, 1px `#d4d4d4`, radius 8; focus border red). Placeholder differs by type ("e.g. Large-format resize freezes the app" / "e.g. Save a customer's brand colors to reuse").
  - **Live "similar items" panel** (bugs & features): appears as the associate types (see Interactions). 1px `#f0d9d9`, bg `#fdf6f6`, radius 9. Headline like `3 related items already open…`; each candidate row shows vote count, title, `area · status`, and a red **`Back this`** button that upvotes the existing item instead of filing a duplicate.
  - **Description** textarea (optional, 70px).
  - **Bug only — auto-captured context panel:** bordered card. Header "We've already captured the context · no typing needed" (green check). Read-only rows: **Tool / mode** (Print Studio · Standard editor), **File** (Smith_BizCard_v2.pdf · 3.5 × 2 in · 300 dpi · CMYK), **Product spec** (Business cards · SKU 24704 · 0.125 in bleed), **What happened**, **Recent steps** (breadcrumb of last actions), **Environment** (Store #1284 · Station POS-3 · v1.3.2 · timestamp). Footer: a **checkbox toggle** "Attach the customer file that misbehaved" (default ON; note "handled as sensitive, purged in 14 days").
  - **Feature only — area auto-tag:** blue info chip "Tagged to **Design editor** automatically — where you are right now."
  - **Identity:** optional `Your name` input (placeholder "Leave blank to post as your store only") + note "Tracked to **Store #1284**."
  - Footer buttons: `Cancel` (outlined) + `File the problem` / `File the request` (red).
- **Step "upvoted":** shown after backing an existing item from the similar panel. Ring-burst + up-chevron; `Your store's backing is in.`; recap of which item; `See it on the board` (red).
- **Step "confirm":** green check ring-burst; `Filed. Tracked to Store #1284.`; recap that it's on the board and auto-followed; `Back to my work` + `See it on the board`.

### 3. The board (802px body)

**Purpose:** the population-wide, ranked list; upvote and follow what matters.

- **Left rail (272px, bg `#fafafa`, right border, scrolls):**
  - **Impact card:** 1px `#ecd7d7`, white; uppercase `Your store's impact`; big `{impact}` (26/700/#CC0000); subcopy.
  - **Type filter:** 3 pill chips `All / Bugs / Requests` (active = red border + `#FBEBEB` + red text).
  - **Status filter:** list rows `All / New / Planned / Shipped / Fixed / Declined / Closed`, each with a status dot (see tokens); active row = `#FBEBEB` bg + red text.
  - **Roll up by** (store hierarchy): list rows `All stores (chain) / Region · Northeast / District 118 / My store #1284`. Filters the list to items backed within that tier (see State).
  - **Stores behind v1.4:** a soft cluster of store-number chips (the store's own chip highlighted red) — a positive, non-ranked spotlight.
- **Main column:**
  - Header: `What stores are asking for` (700/17) + subline `{n} open items · {scope} · ranked by store votes`; a 280px search field.
  - **Ranked list** (scrolls, 10px gap). Each **item row** (1px border, radius 10, white, `box-shadow: 0 1px 3px rgba(0,0,0,.05)`; hover border `#cfcfcf`; **highlighted** item gets a red ring):
    - **Upvote button** (56px, left): up-chevron + count, stacked. Unvoted = white/1px `#d4d4d4`/#666 text; voted = red fill/white. Count animates (`pulseCount`) on change.
    - **Middle:** a type tag (`Bug` red on `#FBEBEB` / `Feature request` blue on `#eef4fb`, uppercase 10) + area (11/#999); the **title** (600/14); then a meta row — `{votes} stores · {districts} districts`, a comment-count with icon, and `Raised by your store` (red) when applicable.
    - **Right:** a status pill (dot + label in a rounded outline) and, if shipped, `Shipped in v1.4` (green).
    - Clicking the row (not the buttons) opens the **detail drawer**.

### 4. Item detail drawer (452px, slides in from right, `slideIn`, dimmed backdrop)

- Header: type tag + area, the title, close X.
- **Status timeline:** dots + labels `New → Planned → Fixed/Shipped` (or `→ Declined/Closed`), last node emphasized.
- If shipped: a green `Fixed/Shipped in v1.4` card → links to the release note.
- If declined: a "Why we're not doing this" card with the honest reason.
- Description paragraph.
- **Actions:** big **upvote** button (`Add your store's vote` / `Backed by your store · tap to remove`) + a **Follow** toggle (`Follow` / `Following`, active = red).
- **Preserved reports:** header `{votes} stores across {districts} districts back this`, then a list of each store's **original words** — store number (own store highlighted red), optional name, timestamp, and the verbatim quote. (Design principle: merges aggregate but never flatten; every store sees its own report kept.)
- **Comments:** simple list (avatar, store number, text). Not threaded.

### 5. What's new / Releases

- **Banner:** star icon; `You asked, we delivered.`; `Feedback from your store has helped ship {impact} improvements.`
- **Release cards** (reverse-chronological; latest gets a slightly heavier shadow + red border tint):
  - Version chip (`v1.4`, dark pill), date (12/#999), a green `Latest` badge and/or a red `Your store asked` badge.
  - Title (700/18) + plain-language summary.
  - **New features** and **Fixes** sections: each a list of rows (green dot + item title + a credit like `Your store + 8 asked` in red when the store contributed, else `10 stores asked` in gray + a `View →` link when it maps to a board item).

### 6. Notifications dropdown (384px, top-right, `popIn`)

- Header `Notifications` + `{n} unread`.
- Rows (unread rows tinted `#fcfaf7`): a kind icon in a tinted bubble — **shipped** = red star / **status** = blue clock / **backed** = green chevron; the message text; an action link (`See what shipped →` / `See detail →` / `View on the board →`); an unread dot.
- Clicking a **shipped** row opens the celebrate modal; a **status/release** row jumps to the release note; a **backed** row opens the item.

### 7. Celebrate "shipped" moment (modal, 520px)

- Top band: two concentric red rings pulsing (`ringExpand`, infinite) behind a white disc holding a red **star** that pops in (`starPop`).
- `You asked, we delivered` (uppercase red) → item **title** → subcopy → a green pill `Fixed/Shipped in v1.4` → tally line `That brings your store's shipped-from-feedback tally to {impact}.`
- **Queue controls when multiple items shipped:** a `‹` / `›` arrow pair (dimmed at the ends) + an `N of M` counter to move between items; a **`Dismiss all`** button closes the whole queue (label is `Nice` when there's only one). Plus `See what's new` → releases.

---

## Interactions & behavior

- **Give feedback → report:** opens the modal at the "choose" step from any surface. Choosing a type advances to the form; a back chevron returns to choose.
- **Similar-items-while-typing (consolidation at the source):** as the title input changes (≥3 meaningful chars), the tracker keyword-matches against open items and shows up to 3 candidates ranked by overlap then votes. `Back this` upvotes the existing item and routes to the "upvoted" confirmation — the primary way duplicates are prevented. Gibberish / <3 chars shows nothing.
- **Submit:** creates a new item (`status: new`, `votes: 1`, `mine: true`, `votedByMe: true`, `followed: true`, one preserved report), unshifts it to the top of the list, shows the confirm step, and on continue lands on the board with the new item highlighted.
- **Upvote (the main interaction):** **toggles** — first tap adds the store's vote (count +1, button fills red, `pulseCount`), tapping again removes it (count −1, unfills). **One vote per store** (the store is the unit; a second associate at the same station doesn't add a second tally). Works identically on the board row and in the detail drawer.
- **Follow:** toggles per item; drawer button reflects `Follow` / `Following`.
- **Filters & search (board):** Type, Status, and hierarchy Scope filter the list; search matches title/area/description. List is always **sorted by votes descending**. Scope `My store` = items the store raised or backed; `District`/`Region` = items with backing in that tier; `All` = everything. The subline reflects the active scope + result count.
- **Navigation:** header Give-feedback + bell are global; the sub-bar tabs switch board/releases; `Back to Print Studio` and `Open the board →` move between Home and the tracker; release-item `View →` and drawer `Shipped in vX` cross-link items ↔ releases.
- **Notifications → close-the-loop:** the bell shows the unread count; opening a shipped notification fires the celebrate moment; status/release notifications route to the relevant release note or item.
- **Auto-play celebration:** the **first time the store lands on the board in a session** (via any path), the celebrate modal auto-opens as a **queue** of every shipped item the store backed (here: 2 → "1 of 2"). It plays once per session (guarded by an `autoCelebrated` flag); arrows move between items, `Dismiss all` closes.

### Motion (keyframes; keep brief, functional, non-blocking)

| Name | Where | Rough spec |
|---|---|---|
| `pulseCount` | vote count on change | scale 1 → 1.45 → 1, ~.6s |
| `popIn` | modals / dropdown | scale .96→1 + fade, ~.16–.22s |
| `slideIn` | detail drawer | translateX 30→0 + fade, ~.22s |
| `fadeIn` | backdrops | opacity, ~.16s |
| `ringExpand` | upvote/confirm burst; celebrate rings | scale .35→1.75 + fade; celebrate loops infinite |
| `starPop` | celebrate star | scale/rotate in, ~.5s |

Easing: plain `ease`/`ease-out`. No bounce, no spring, no large transforms — per the brand's restrained-motion rule.

---

## State management

All state lives in one component (`class Component extends DCLogic`). Key state and the model behind each surface:

**Top-level UI state**
- `view`: `'home' | 'board' | 'releases'`
- `reportOpen` + `reportStep`: `'choose' | 'bug' | 'feature' | 'upvoted' | 'confirm'`; `reportTitle`, `reportDesc`, `reportName`, `attachFile`
- `notifOpen`, `detailId` (open drawer), `highlightId` (newly added/backed item)
- Filters: `fType` (`all|bug|feature`), `fStatus` (`all|new|planned|done|declined`), `fScope` (`all|region|district|mine`), `query`
- Vote animation: `justVotedId`
- Celebration queue: `celebrateOpen`, `celebrateQueue: [{itemId, release}]`, `celebrateIndex`, `autoCelebrated`
- `coachOpen`, `impact` (running "improvements shipped" tally), `store` (`'#1284'`)

**Data model**
- **Item:** `{ id, type: 'bug'|'feature', title, desc, area, status: 'new'|'planned'|'done'|'declined', votes, districts, mine, votedByMe, followed, inDistrict, inRegion, shippedIn?, declineReason?, comments: [{store, text}], reports: [{store, when, name?, text}] }`  — `status: 'done'` renders as **Fixed** (bug) or **Shipped** (feature). `votes` == number of distinct backing stores.
- **Release:** `{ version, date, title, summary, yourStore, latest, features: [{id?, title, stores, yours}], fixes: [...] }`
- **Notification:** `{ id, kind: 'shipped'|'status'|'backed', unread, itemId, release?, text }`

**Derived (computed each render):** the filtered+sorted board list, the "similar items" for the current title, the decorated detail object (with status timeline + preserved reports), the releases view model, notification view models, and the celebrate view model (title/release/position/labels). No data fetching in the prototype — all seed data is in-memory; production would back these with real APIs (items, votes, releases, notifications, and the store-directory hierarchy imported from an Excel/store-listing source).

**Configurable props (surfaced as tweaks):** `startView` (`home|board|releases`), `coachmark` (bool), `celebrations` (bool — turns the celebratory moment on/off; when off, shipped notifications route straight to the release note).

---

## Design tokens (what the wireframe used)

**Color**
- Brand red `#CC0000` (action / active / primary CTA / bug accent); pressed `#A30000`; tint `#FBEBEB`; tint border `#f0c9c9`, `#e2b4b4`.
- Success green `#2e8b3d` (shipped/fixed dot & labels); green tints `#eef7ef`, `#e8f5ea`, border `#cfe6d3`.
- Info/link blue `#086DD2` (links, Planned status, feature accent); tint `#eef4fb`.
- Ink `#1A1A1A` (headings). Text grays: `#444, #555, #666, #777, #888, #999, #aaa`.
- Structure: borders `#e6e6e6, #ececec, #eee, #e0e0e0`; surfaces `#f0f0f0` (header), `#fafafa`/`#fbfbfb` (rails/cards), desk `#cfcfcf`.
- Placeholders (media): `#e4e4e4` / `#d9d9d9`.
- Status dots: New `#9a9a9a` · Planned `#086DD2` · Shipped/Fixed `#2e8b3d` · Declined/Closed `#bcbcbc`.

**Typography** — Motiva Sans. Sizes in play: 11 (uppercase labels), 12 (mini/meta), 13 (body), 14–17 (subheads/titles), 18–22 (headings), 26 (impact number). Weights: 300 body, 500/600 emphasis, 700 headings. Uppercase labels use `letter-spacing: .04–.05em`.

**Radius** — 3–4 (chips/badges), 6–8 (buttons/inputs/small cards), 9–12 (cards/panels/modals), 14–16 (celebrate modal), 20 (status pills), 50%/9999 (circles, dots).

**Shadow** — card `0 1px 3px rgba(0,0,0,.05)`; dropdown `0 16px 44px rgba(0,0,0,.2)`; drawer `-8px 0 32px rgba(0,0,0,.16)`; modal `0 24px 64px rgba(0,0,0,.28)`; celebrate `0 28px 70px rgba(0,0,0,.32)`; frame `0 18px 50px rgba(0,0,0,.22)`.

**Spacing** — 4px-based; common paddings 12/14/16/18/22/26/28; common gaps 6/8/10/12/14/16.

---

## Assets

- **No raster/image assets.** All product imagery is intentional gray placeholder rectangles (`#e4e4e4`) — replace with real Staples product photography in production.
- **Icons:** inline SVG, Lucide-style (search, bell, message-square, chevrons, check, paperclip, alert-triangle, lightbulb, flag/follow, star, clock). Swap for the codebase's icon library.
- **Fonts:** **Motiva Sans** (Light/Regular/Medium/Bold) — the Staples brand face. The runnable HTML embeds it; production should use the real licensed webfont from the Staples design system.
- **Staples red `#CC0000`** and the `Staples` wordmark badge come from the Staples Print brand system — use the official brand assets/tokens in production.

---

## Files in this bundle

- `README.md` — this document (self-sufficient spec).
- `feedback-tracker-prototype.html` — **runnable**, self-contained prototype (open in any browser; no setup, works offline).
- `Feedback Tracker Prototype.dc.html` — the readable source (Design Component format: `<x-dc>` template + `class Component` logic + inline styles + `d_props_json` tweak metadata).
- `FUNCTIONAL_DESIGN.md` — the original product/functional design doc this prototype was built from (four surfaces, statuses, vote & identity model, release/close-the-loop model, engagement & recognition, edge cases). The prototype implements the three counter-associate surfaces from it.

---

## Notes for implementation

- **Identity model:** the **store** is the unit of voice — votes, recognition, and loop-closing all land at store level; associate name is always optional. Enforce **one vote per store per item** server-side.
- **Consolidation:** the highest-leverage feature is "similar items while typing." Back it with real similarity search; keep every merged report's original store/name/time/words (aggregate, never flatten).
- **Store hierarchy:** the roll-up filters (store → district → region → chain) depend on a fed-in store directory (store number is stable; district/region alignment can change — always reflect current alignment).
- **Release tracking:** items moved to Shipped/Fixed link to the release that delivered them; the Releases surface is the changelog. Notifications close the loop with the concrete version.
- **Recognition/motion guardrails:** collective/store-level only (never individual leaderboards); motion stays subtle, brief, and never blocks counter work.
- The team-side **triage console** (ranked queue, de-dup workspace, status/release management, telemetry, Claude Code handoff generation, moderation) is described in `FUNCTIONAL_DESIGN.md` §5.8 but is **not** part of this prototype.
