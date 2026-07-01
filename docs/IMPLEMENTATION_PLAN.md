# Store Tools POC — Implementation Plan

**Scope of this plan:** the first buildable increment of the Store Tools Suite POC — the **suite homepage placeholder** and the **Feedback / Bug & Feature-Request Tracker** (the three counter-associate surfaces from the design handoff), built at the **same mid-fidelity as the handoff wires**, structured so the rest of the suite POC grows onto it.

**Inputs reviewed:**

| Input | Where | Role |
|---|---|---|
| Design handoff package (README spec, runnable prototype, readable `.dc.html` source, functional design) | `docs/handoff/feedback-tracker/` | The design source of truth for the first build |
| Feedback Tracker functional design v0.1 | `docs/handoff/feedback-tracker/FUNCTIONAL_DESIGN.md` | Product behavior the wires implement (§5.1–5.7, §5.9 field side) |
| Store Tools Suite Implementation Plan v0.1 | `docs/Store_Tools_Suite_Implementation_Plan.md` | The big picture: where this POC sits in the phased suite build |
| AI Design Studio tech stack overview | (provided in kickoff message) | Reference stack from a sibling POC; adopted with deltas below |

---

## 1. Review findings

### 1.1 The handoff package is complete and internally consistent

- The bundle's `README.md` is a genuinely self-sufficient spec: global chrome, all 7 screens/overlays, every interaction, the full state model (verified against the `class Component` logic in the `.dc.html` source), a motion table with rough keyframe specs, and a design-token inventory (color, type, radius, shadow, spacing).
- The bundled `FUNCTIONAL_DESIGN.md` is byte-identical to the standalone functional design doc — no version drift to reconcile.
- The runnable prototype (`feedback-tracker-prototype.html`) is the behavioral reference; the `.dc.html` source is the structural one. The prototype's seed data (12 items, 5 releases, 4 notifications, store `#1284`, impact tally 7) is complete enough to power the whole POC with no invented content.
- Scope is explicit: the three **counter-associate surfaces** (report entry, board, releases) plus connective tissue (notification bell, celebrate moment, coachmark). The **team-side triage console (§5.8) is out of scope** for this build.

### 1.2 How this fits the suite plan (big picture)

- In the suite implementation plan, the tracker is **Track C (Feedback & telemetry)** — deliberately shipped early ("skeleton in Phase 1, full in Phase 4, permanent after GA") because it is the at-scale test signal for everything else. Building it first is consistent with the plan, not a detour.
- The handoff's **Home & file intake** screen doubles as the **suite homepage placeholder**: the quick-jump tool row (Document / Layout / Quick Fix / Photo Edit / Print Setup), the intake dropzone, and the product grid are all placeholder affordances in the wires ("no destination wired"). They become the mount points for future vertical slices (Track B) — so the homepage we build now *is* the shell the rest of the POC grows into.
- The suite plan is intentionally stack-agnostic (stack decided by Phase-0 spikes). This POC is a **UI/flow prototype**, not a Phase-0 engine spike — adopting a proven sibling-POC web stack here doesn't pre-empt those decisions.

### 1.3 Stack review — what carries over from AI Design Studio, what doesn't

The AI Design Studio stack maps cleanly onto this POC. Adopt the core; defer the parts that exist for design-studio-specific features.

**Adopt now:**
- **Next.js 15 (App Router) + React 19 + TypeScript 5.7 strict**, `reactStrictMode`, typed routes, path aliases (`@/*` plus focused aliases like `@/schema`, `@/store`).
- **Tailwind CSS v4** (`@tailwindcss/postcss`) — the wireframe tokens become theme values (§4.4).
- **lucide-react** — the wires' icons are explicitly "Lucide-style inline SVG; swap for the codebase's icon set."
- **Zustand 5** for the tracker store — the prototype is literally one state class; it translates 1:1 to a single store (§4.3).
- **Zod 3** for the item/release/notification schemas.
- **localStorage persistence** (no database) — matches both the sibling POC and the prototype's in-memory model; adds demo-friendly persistence of votes/follows/filed items across reloads, with a reset.
- **Vitest 3** (colocated unit tests) + **Playwright** (e2e smoke of the main flows).
- **`output: "standalone"` + multi-stage `node:22-alpine` Docker → Cloud Run** deployment shape (honor `PORT`/`HOSTNAME`, bind `0.0.0.0:8080`).
- **Motiva Sans from `public/fonts`** — the runnable prototype embeds it; extract the four weights (300/400/500/700) for the POC. Flag: confirm license coverage for a deployed POC; fall back to a system stack if not (§7).

**Defer (not needed for this increment, adopt when the relevant suite slice arrives):**
- Konva/react-konva, @dnd-kit, the in-house SVG renderer — canvas/editor slices.
- jsPDF/svg2pdf/jszip/qrcode/Ghostscript PDF/X pipeline — export slices.
- The AI Gateway + Anthropic/Gemini SDKs — no AI features in the tracker wires. (Real similarity search and Claude-drafted release notes are *production* tracker features per the functional design; the wires' keyword matcher is the right fidelity for the POC. The design studio's gateway pattern — config-routed tasks with a stub fallback — is the template when we get there.)
- IndexedDB asset storage — until file intake actually stores files.

---

## 2. What we're building (fidelity contract)

**Mid-fidelity wireframe, faithfully.** Per the handoff's fidelity section:

- **Follow exactly:** information architecture, layout, component composition, the **exact copy**, all interactions/flows, the state model, and the motion table. These are the design.
- **Reproduce as-is for this POC:** the grayscale wireframe styling — white surfaces, structural grays, Staples red `#CC0000` for action/active/warning, green for shipped/fixed, flat `#e4e4e4` placeholder rectangles for imagery. We are matching the wires, not productionizing the Staples design system.
- **One deliberate deviation:** the wires render inside a fixed 1440×900 "station screen" on a gray desk. The README says to productionize as a normal desktop app — we'll build **full-viewport desktop layout** (content column widths per the wires, sensible min-width ~1200px) rather than the framed device. The frame is wireframe chrome, not design.

**Surfaces in scope** (from the handoff): Home & file intake (placeholder homepage) · Report flow modal (choose → bug/feature form with live similar-items → upvoted/confirm) · The board (rail filters + ranked list) · Item detail drawer · What's new / Releases · Notifications dropdown · Celebrate "shipped" moment · Home coachmark.

**Out of scope:** triage console, real backend/APIs, real similarity search, real store directory import, per-person accounts, any production Staples design-system styling.

---

## 3. Application architecture

### 3.1 Routes (App Router)

| Route | Surface | Notes |
|---|---|---|
| `/` | Home & file intake (suite homepage placeholder) | Quick-jump cards, dropzone, size tiles, product grid are static placeholders; board-entry card navigates to `/feedback/board` |
| `/feedback/board` | The board | Tracker sub-bar (tabs + "Back to Print Studio") appears on `/feedback/*` only |
| `/feedback/releases` | What's new / Releases | |

Overlays (report modal, notifications dropdown, detail drawer, celebrate modal, coachmark) are client components rendered from the root layout / store state, **not** routes — they must open over any surface, exactly as in the prototype. The persistent header (Staples badge, search, store ID, Give feedback, bell, avatar) lives in the root layout so the report entry is global — the functional design's "one shared surface across the whole suite."

Future suite slices land as sibling route groups (`/document`, `/layout`, `/quick-fix`, `/photo`, `/print-setup`) wired from the quick-jump cards — placeholders until their vertical slices are built.

### 3.2 Component map (mirrors the wire sections)

```
src/
  app/
    layout.tsx                 // header chrome + overlay host
    page.tsx                   // Home & file intake
    feedback/
      layout.tsx               // tracker sub-bar (tabs, back link)
      board/page.tsx
      releases/page.tsx
  components/
    chrome/    AppHeader, GiveFeedbackButton, NotificationBell, TrackerSubBar, Coachmark
    home/      QuickJumpRow, IntakeDropzone, PubCallout, SizeTiles, ProductGrid, BoardEntryCard
    report/    ReportModal, StepChoose, StepForm, SimilarItemsPanel,
               CapturedContextPanel, StepUpvoted, StepConfirm
    board/     BoardRail (ImpactCard, TypeFilter, StatusFilter, ScopeFilter, TopStores),
               BoardList, ItemRow, UpvoteButton, StatusPill
    detail/    DetailDrawer, StatusTimeline, PreservedReports, CommentsList
    releases/  ReleaseBanner, ReleaseCard, DeliveredItemRow
    overlays/  NotificationsDropdown, CelebrateModal
  lib/
    schema/    types + Zod schemas (Item, Release, Notification, Report, Comment)
    store/     feedback-store.ts (Zustand) + selectors + persistence
    data/      seed-items.ts, seed-releases.ts, seed-notifications.ts  // verbatim from prototype
    similar.ts // tokenizer + overlap scorer, ported from prototype
```

### 3.3 State (one Zustand store, ported from the prototype's `Component` class)

The prototype's state translates directly; keep the same names so the `.dc.html` source stays a usable reference:

- **Data:** `items`, `releases`, `notifications`, `impact`, `store: '#1284'` — hydrated from seed modules, mutations persisted to localStorage (versioned key + "reset demo data" affordance).
- **UI:** `reportOpen`/`reportStep` (`choose|bug|feature|upvoted|confirm`) + form fields; `notifOpen`; `detailId`; `highlightId`; filters `fType`/`fStatus`/`fScope`/`query`; `justVotedId`; celebration `celebrateOpen`/`celebrateQueue`/`celebrateIndex`/`autoCelebrated` (session-scoped, not persisted); `coachOpen`. Navigation state (`view`) is replaced by the router.
- **Derived (selectors):** `filtered()` (type/status/scope/query → sort by votes desc), `computeSimilar()` (≥3 chars, tokenizer with stop-words, overlap-then-votes ranking, top 3, excludes `done`), decorated detail (status trail + preserved reports), releases view model, unread count, celebrate view model.
- **Actions (semantics locked by the prototype):** `upvote` toggles — one vote per store, ±1, sets `inDistrict`/`inRegion` on vote, 650ms `justVotedId` pulse; `submitReport` unshifts a new item (`status:'new'`, `votes:1`, `mine`, `votedByMe`, `followed`, one preserved report) and highlights it on the board; `upvoteFromSimilar` → upvoted step; `notifSee` routes by kind (shipped → celebrate if enabled, release → releases page, else board + drawer); `maybeAutoCelebrate` queues **all** shipped notifications once per session on first board landing.

Key model rule to preserve: `status: 'done'` renders as **Fixed** for bugs and **Shipped** for features; `votes` = distinct backing stores; preserved reports keep each store's original words.

### 3.4 Data & schemas

Zod schemas in `lib/schema` matching the prototype's shapes:

```ts
Item:         { id, type: 'bug'|'feature', title, desc, area,
                status: 'new'|'planned'|'done'|'declined',
                votes, districts, mine, votedByMe, followed,
                inDistrict, inRegion, shippedIn?, declineReason?,
                comments: {store,text}[], reports: {store,when,name?,text}[] }
Release:      { version, date, title, summary, yourStore, latest,
                features: {id?,title,stores,yours}[], fixes: [...] }
Notification: { id, kind: 'shipped'|'status'|'backed', unread, itemId, release?, text }
```

Seed data is copied **verbatim** from the prototype (12 items, 5 releases, 4 notifications) — it's authored content, part of the design.

### 3.5 Design tokens & motion

- Tailwind v4 theme from the README's token tables: brand red `#CC0000` / pressed `#A30000` / tint `#FBEBEB` / tint borders; success `#2e8b3d` + tints; info blue `#086DD2` + tint; ink `#1A1A1A`; the gray text/border/surface ramps; status-dot colors (New `#9a9a9a`, Planned `#086DD2`, Shipped/Fixed `#2e8b3d`, Declined `#bcbcbc`); radius and shadow scales as named tokens.
- Motiva Sans via `@font-face` from `public/fonts` (weights 300/500/600/700 per the type spec).
- Keyframes in global CSS, per the motion table: `pulseCount` (~.6s), `popIn` (~.16–.22s), `slideIn` (~.22s), `fadeIn` (~.16s), `ringExpand` (celebrate loops infinite), `starPop` (~.5s). Plain `ease`/`ease-out`, no spring — the brand's restrained-motion rule.

---

## 4. Build order

The user-set starting point: **homepage placeholder first, then the report (bug/feature) flow**, then the rest. Each step leaves the app runnable and demoable.

### Step 0 — Scaffold *(small)*
Next.js 15 + TS strict + Tailwind v4 + Zustand + Zod + lucide-react + Vitest + Playwright; path aliases; tokens + fonts + keyframes; root layout with the **persistent header** (Staples badge, decorative search, `Store #1284`, Give feedback button, bell with static badge, avatar). CI-friendly scripts (`dev`, `build`, `test`, `e2e`, `lint`).
*Done when:* app boots showing the header on an empty page; tokens/fonts render.

### Step 1 — Home & file intake (homepage placeholder)
Quick-jump tool row (5 cards, hover states, no destinations) · left column (BRING IN A FILE label, dropzone with file-type chips, Browse/Fetch actions, `.pub` callout, size tiles incl. dashed Custom) · right column (PICK A PRODUCT header row, 4×3 product grid with gray media placeholders, board-entry/recognition card) · dismissible coachmark pointing at Give feedback.
*Done when:* pixel-faithful to the wire at 1440; recognition card shows the live `impact` value; coachmark dismisses; "Open the board →" navigates (to a stub route until Step 3).

### Step 2 — Report flow (feature request / bug report)
Seed data + schemas + store land here (the flow needs items for similar-matching). ReportModal with all four steps: **choose** (two option cards + browse-the-board link) · **bug/feature form** (title input with type-specific placeholders, live **similar-items panel** with `Back this`, optional description, bug-only **auto-captured context panel** with attach-file toggle, feature-only area auto-tag chip, optional name + store attribution, Cancel/File buttons) · **upvoted** and **confirm** steps with ring-burst cues.
*Done when:* Vitest covers the similarity scorer (≥3 chars, stop-words, overlap→votes ranking, top 3, gibberish → nothing); filing unshifts an item and lands on the board with a red-ring highlight; backing an existing item upvotes it (no duplicate created); flow matches the prototype click-for-click.

### Step 3 — The board
Tracker sub-bar (tabs + back link) · left rail (impact card, type/status/scope filters, "Stores behind v1.4" chip cluster) · main column (header + result subline reflecting scope, 280px search, ranked list) · ItemRow (upvote button with `pulseCount`, type tag, area, title, reach meta, comment count, "Raised by your store", status pill, "Shipped in vX").
*Done when:* filters/search/sort match prototype semantics (scope `mine` = raised-or-backed; always votes-desc); upvote toggles with one-vote-per-store; Vitest covers `filtered()`.

### Step 4 — Item detail drawer
Slide-in drawer with backdrop: status timeline (New → Planned → Fixed/Shipped, or → Declined/Closed) · shipped-release card linking to releases · decline-reason card · big vote button + Follow toggle · **preserved reports** (own store highlighted) · flat comments list.
*Done when:* every board row opens its decorated detail; vote/follow state stays consistent between row and drawer; cross-link to the release note works.

### Step 5 — What's new / Releases
Banner ("You asked, we delivered." + impact line) · reverse-chronological release cards (version chip, date, Latest/Your-store-asked badges, title, summary, Features/Fixes rows with store credits and `View →` linking back to board items).
*Done when:* item ↔ release cross-links work both directions; credit lines render (`Your store + 8 asked` red vs `10 stores asked` gray).

### Step 6 — Notifications & celebrate moment
Bell dropdown (unread count/badge, kind icons + tinted bubbles, action links, mark-read) · celebrate modal (pulsing rings, star pop, title, green release pill, tally line, prev/next queue controls with `N of M`, `Dismiss all`/`Nice`, "See what's new") · **auto-play**: first board landing per session queues every shipped notification; `celebrations` off routes shipped notifications straight to the release note.
*Done when:* all three notification kinds route per the prototype; auto-celebrate fires once per session; queue controls dim at the ends.

### Step 7 — Hardening & ship shape
Playwright smoke: (a) file a bug → confirm → highlighted on board; (b) type a similar title → back existing → upvoted step; (c) filter + search + upvote toggle; (d) notification → celebrate → releases. Cross-surface polish pass against the runnable prototype. localStorage persistence + demo reset. Dockerfile (standalone, node:22-alpine, 8080) + root README (run, test, demo script, where the handoff docs live).
*Done when:* e2e green; `docker run` serves the POC; README lets a teammate demo it cold.

**Suggested commit cadence:** one commit per step, each leaving `main`-quality state on the feature branch.

---

## 5. Testing strategy

- **Unit (Vitest, colocated):** similarity scorer; `filtered()` (type/status/scope/query × sort); vote toggle invariants (±1, one per store, district/region propagation); `submitReport` shape (status/votes/flags/preserved report); notification routing; celebrate-queue construction; status label mapping (`done` → Fixed vs Shipped).
- **E2E (Playwright, Chromium, dev server):** the four smoke flows in Step 7 — these are the demo script, so they double as regression cover for stakeholder demos.
- **Fidelity checks (manual):** side-by-side with `feedback-tracker-prototype.html` per step — it runs offline in any browser and is the behavioral source of truth.

---

## 6. How the rest of the POC grows from here

- **New tool surfaces (suite Track B)** mount behind the quick-jump cards as new route groups; the header (with global Give feedback + bell) already wraps them, which is exactly the functional design's "one shared surface" requirement.
- **Report-entry context** is stubbed realistically: the bug form's captured-context panel shows the wire's fixed sample (tool/file/spec/steps/environment). When real tool surfaces exist, they publish their context into the store and the panel reads it — no redesign needed.
- **Triage console** (§5.8) would be a separate route group (`/triage`) reusing the same store/schemas; explicitly deferred.
- **Backend swap:** all mutations flow through store actions, so replacing localStorage with real APIs (items, votes, releases, notifications, store directory) is an adapter change behind the store — components untouched.
- **AI features** (real similarity, Claude-drafted release notes) slot in via a design-studio-style gateway with stub fallback when they're prioritized.

## 7. Open questions / assumptions (proceeding with the recommendation unless redirected)

1. **Motiva Sans licensing** — the prototype embeds it; the plan extracts it to `public/fonts` for this internal POC. Confirm that's acceptable for a deployed demo; otherwise a system-stack fallback is a one-line swap.
2. **Full-viewport vs. framed station screen** — building full-viewport desktop (README's productionization guidance) rather than the 1440×900 wireframe device. If demos should show the "station frame," it can be added back as a wrapper.
3. **Persistence** — votes/follows/filed items persist to localStorage with a reset control (better demo continuity than the prototype's memory-only state). Say the word if demos should instead reset on every reload.
4. **Deploy target** — Dockerfile targets Cloud Run to match the sibling POC; adjust if this POC deploys elsewhere.
