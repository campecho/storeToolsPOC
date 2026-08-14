# Headless Layout Tool — Functional Model for Dev-Team Handoff

**Document type:** Implementation plan (bounded module in **this repo**)
**Status:** Draft v2.2 — plan of record; supersedes the v2.1 draft circulated outside the repo
**Last updated:** 2026-08-14
**Source of truth:** `microsoft_publisher_feature_requirements.md` (§1–§14)
**Relationship to `storeToolsPOC`:** **this repo is the home.** The model is a bounded module
(`src/publisher/`) sharing the repo's schema lineage, pure-math core, asset store, `.pub`
import pipeline, and photo editor — with new chrome, a new store, and a new text engine.

**Changes in v2.2 (all five §9 questions closed, plus the repo question):**

1. **Repo decision reversed — built here, not in a new repo.** v2.1's "zero shared code"
   premise is retired (§0). Extraction-readiness becomes an acceptance criterion so a
   standalone handoff repo can be produced mechanically at the end if wanted.
2. **State is Redux Toolkit, affirmed as the org standard.** The tool model's store is
   RTK-native from the first commit. Coexistence rules with the repo's legacy Zustand
   surfaces are defined (§6.3).
3. **The text engine is upgraded from the measureText hybrid to a real shaping engine**
   (HarfBuzz/WASM, own line breaker, glyph-outline rendering). §3.3 is now a LIVE
   evaluation target, and the shaped-glyph contract is designed to carry unchanged into
   the dev team's PDF output (§6.4).
4. **Photo editing is in scope, both tiers plus standalone** (§6.5): a robust in-line
   Image panel on picture frames (LIVE), a live-recipe round-trip to the existing photo
   editor for mask/model-backed work, and the standalone `/photo` surface retained.
5. **Shape-tool presentation ships both ways** behind a registry-driven toggle; the
   prototype decides (§9).
6. **JSON document round-trip is in** — debug export/import, the schema-completeness
   proof, and the bridge that turns imported `.pub` corpus files into seeded content (§9).

**Changes in v2.1:** stack settled — Konva (Canvas 2D) content, SVG interaction overlay,
React, Redux Toolkit, framework-free TypeScript core.
**Changes in v2.0:** scope narrowed to a headless layout tool; three-tier build status;
schedule estimate corrected.

---

## 0. Why this repo (the handoff-cleanliness question, answered)

The driver for a new repo was a cleaner handoff. Examined against the closed decisions, a
new repo no longer delivers that:

- **The tool-model app is ~90% new code either way.** Redux replaces the Zustand store,
  the shaping engine replaces `text.ts`'s measureText layout, Konva was decided here
  (`LAYOUT_EDITOR_PLAN.md` §8) but never executed — the POC canvas is DOM-rendered and
  `konva` is not in the dependency tree. So a new repo saves almost no duplication.
- **What a new repo *costs* is the two subsystems v2.2 pulls into scope.** The standalone
  photo editor (PE1–PE10: recipe architecture, jailed server rendering, HEIC, CMYK/GRACoL,
  PDF boxes) and the `.pub` import pipeline (P1–P5: 100% measured corpus fidelity) live
  here with their server components, Docker story, security posture, corpora, and CI.
  Porting them is the most expensive path; leaving them behind splits the prototype across
  two repos and makes the layout ↔ photo pass-back — an explicit evaluation target —
  undemonstrable in one running app.
- **The import pipeline is the SME evaluation harness.** Real Publisher files opened in
  the model and compared side-by-side against Publisher's own render beat any synthetic
  seed documents. This also closes the seeded-content question (§9).
- **Handoff cleanliness is a property of the module and the bundle, not the repo.**
  Everything the dev team ports lives under one directory with zero framework imports;
  the deliverable is the generated bundle plus an offline build, per the `docs/handoff/`
  convention already practiced three times in this repo.

**Acceptance criterion — extraction-readiness:** at any point, `src/publisher/core/` plus
the generated handoff bundle must be copyable into a fresh repo and build standalone
(no imports reaching outside the module other than declared npm dependencies). CI gets a
check that walks the import graph and fails on boundary violations. This buys the
clean-repo optics at handoff time without paying the two-repo tax during the build.

---

## 1. What this is

A **functional model of the layout tool's interaction surface** — every tool, every panel,
every option, and exactly what each does on the canvas — so a dev team can implement the
real product against it. Plus, per v2.2, the photo-editing capability in its three shapes:
in-line on the layout canvas, via round-trip to the photo editor, and standalone.

It answers three questions per tool:

1. What is it?
2. What options does it have, with types, ranges, and defaults?
3. What exactly happens when you use it on the canvas?

The running app is the specification. The generated documents are its printed form.

**The reviewer is the instrument.** This model exists so a print/design SME can drive every
tool, compare against Publisher and its peers, and sign off before dev-team implementation.
Two affordances serve that directly:

- **In-app contract checklists** — each tool's gesture clauses render as a checkable list
  beside the tool (generated from the registry), so a review session produces a record.
- **The feedback tracker is dogfooded.** The repo's own tracker (`/feedback`) captures
  observations per tool during review; its items become the dev team's punch list.

---

## 2. The scope boundary

**The model builds:** anything a user can see, click, drag, or configure — and everything
that changes the document *in memory*. Per v2.2 this now includes real text shaping and
real in-line image adjustment, because both are things the SME must evaluate, not stubs.

**The dev team builds:** anything that crosses a process boundary — network, disk,
printer, PDF bytes — plus the application shell around the tool.

| In scope (this model) | Out of scope (dev team) |
|---|---|
| Tool dock and every tool's canvas behavior | Application header, navigation, suite chrome |
| Control panels and every option they carry | Backend services, auth, catalog/product API |
| Canvas: geometry, selection, transform, snapping, guides | Storage — save, open, autosave, recovery |
| The in-memory document model (schema v3) | Native `.cdoc` format on disk (§13.2) |
| **Text engine: shaping, H&J, OpenType — LIVE (§6.4)** | PDF **bytes**: font subsetting/embedding, PDF/X-4 writer |
| **In-line image adjust + photo round-trip (§6.5)** | Model services (inpaint, upscale, bg removal) |
| Live design-checker analysis over the model | Final file rendering — print output (§11.1) |
| Export/print **settings surfaces** and their presets | `.pub` parsing beyond the POC pipeline (§13.1) |
| Spell-check *interaction* (marks, suggestions, panel) | Dictionaries and proofing services (§3.7) |

**Two contracts are the load-bearing deliverables:**

1. **The document model (schema v3)** — what storage and rendering get implemented
   against. Designed as deltas on this repo's proven schema v2, not from scratch (§6.6).
2. **The shaped-text output (`PositionedGlyphRun`, §6.4)** — what the PDF path consumes.
   The dev team's PDF text is the same glyph ids at the same positions from the same
   fonts; WYSIWYG is structural, not aspirational.

### Three regions, nothing else

```
┌──────────────────────────────────────────────────────────┐
│  tool options bar   (contextual — changes with the tool)  │
├──────┬─────────────────────────────────────┬─────────────┤
│ tool │                                     │   control   │
│ dock │              canvas                 │    panel    │
│      │                                     │             │
└──────┴─────────────────────────────────────┴─────────────┘
```

No header, no menus, no title bar, no status bar. Basic unstyled UI — default controls
with enough CSS to be usable and no more, so nothing is mistaken for design direction.

The model mounts at **`/tool-model`** as a sibling surface. The existing `/layout` editor
is untouched — it remains the shipped wire-fidelity demo and the import pipeline's UI; the
model is where the tool suite gets designed. (The suite header stays above `/tool-model`
like every surface, but the model owns everything below it.)

---

## 3. Three-tier build status

Every capability carries one of three statuses, visible in the app beside the control:

| Tier | Meaning | Example |
|---|---|---|
| **LIVE** | Fully interactive. Real behavior on canvas or in the panel. | Rectangle tool, Layers panel, H&J controls, Image adjust |
| **SURFACE** | The control exists with its full option set, defaults, and a written contract — but the action stops at a declared interface the dev team implements. | Export PDF settings, Save, font packaging |
| **OUT** | Not represented. Named in the capability map with its owner. | PDF/X-4 writer, font activation service |

SURFACE is not a stub — it is a specification with a named seam, declaring the interface
it would call and the data shape it would pass. This repo's `STUBS.md` registry and its
honest in-UI labels are the same idea; the model's SURFACE entries register there too.

v2.2 tier promotions: **typography (§3.3) LIVE** (was hybrid), **image adjust (§4.2)
LIVE**, **photo round-trip LIVE** (was unaddressed). Optical kerning is the one §3.3 item
that may land SURFACE (§6.4).

---

## 4. Classification — the first artifact

The requirements document is organized by **capability area**; a tool dock by **what the
user picks up**. Most requirements are not tools:

| Surface | Count | Lives in |
|---|---|---|
| **Tool** | ~24 | The dock |
| **Panel** | ~26 | The control panel |
| **Command** | ~30 | Keyboard / context menu (no dock slot) |
| **Dev-team seam** | ~10 | Named in the capability map, not built |

**The first artifact is a registry, not UI.** One machine-readable file classifying every
requirement with its § citation, tier, and contract. The dock, options bar, control panel,
checklists, and every generated document are *renderings of that one file*.

### 4.1 The tool set (~24)

| # | Tool | Group | Req |
|---|---|---|---|
| 1 | Select | Selection | §2.1, §5.1–5.3 |
| 2 | Node / direct select | Selection | §4.4 |
| 3 | Text frame | Content | §3.1 |
| 4 | Link text frames | Content | §3.2 |
| 5 | Picture frame | Content | §4.1 |
| 6 | Crop | Content | §4.2 |
| 7 | Table | Content | §8.1 |
| 8–17 | Rectangle · Rounded rectangle · Ellipse · Line · Arrow · Star/polygon · Callout · Banner · Flowchart · Pen/freeform | Shapes | §4.4 |
| 18 | Fill / gradient | Style | §4.4, §9.4 |
| 19 | Eyedropper / format painter | Style | §12.2 |
| 20 | Guide | Layout aids | §2.4 |
| 21 | Merge field | Data | §7.1 |
| 22 | Building block | Data | §6.2 |
| 23 | Zoom | Navigation | §9.1 |
| 24 | Pan | Navigation | — |

**Shape presentation (decision closed as "both"):** the dock renders the ten shape tools
either as a single slot with a flyout *or* as individual slots, switched by a
registry-driven presentation toggle in the model's debug bar. Both renderings bind to the
same tool contracts, so the toggle costs one dock-rendering branch. The prototype review
picks the winner; the registry records it.

### 4.2 The panel set (~26)

Transform · Character · Paragraph · Styles · Layers · Pages · Master pages · Sections &
numbering · Document setup (trim/bleed/slug) · Guides & grid · Align & distribute · Text
wrap · Text fit & overflow · Colour & swatches · Effects · **Image adjust (LIVE, §6.5)** ·
Resource manager · Design checker · Data merge · Templates · Building blocks · Themes ·
Language & proofing · Table properties · Find & replace · History.

Under-represented in v2.1, now explicit in the registry: clipboard/paste-special
(commands, §12.2), object styles (Styles panel scope, §3.6), and the layers-scoping
decision (§2.2's per-document vs per-page "as configured" — the schema picks
document-scoped layers with per-page visibility overrides; the panel exposes it).

### 4.3 One requirement that must not be deferred

§3.8's **anchor model** — a stable reference to a text position surviving reflow — goes
into schema v3 from the first draft, with no tool using it yet. Retrofitting anchors into
a shipped text engine is substantially more expensive than accommodating them up front.
The shaping engine's cluster maps (§6.4) are what make anchors resolvable.

---

## 5. The tool contract

Every tool carries identical fields. Uniformity is the point — a reviewer can diff tool 17
against tool 3 and see exactly what differs.

```ts
type ToolContract = {
  id: string;
  label: string;
  group: ToolGroup;
  shortcut: string;
  req: string[];              // ["§4.4", "§2.1"]
  tier: "LIVE" | "SURFACE";
  cursor: string;
  creates: ObjectType | null;
  hitTest: HitTestSpec;       // tolerance, unfilled-interior rule, locked skip
  gestures: GestureClause[];
  options: OptionSpec[];
  panels: PanelId[];          // which panels apply while active
  undo: UndoGranularity;
  seam?: SeamSpec;            // SURFACE only: interface + payload shape
  notes: string[];
};

type GestureClause = {
  id: string;                 // "rect.drag.shift-constrains-square"
  trigger: string;            // "drag + Shift"
  behavior: string;           // one sentence, testable
  action: string;             // RTK action type dispatched on commit
};
```

**One id, three places.** `rect.drag.shift-constrains-square` is a line in the generated
spec, the name of a test assertion, and — via `action` — the running app's Redux
vocabulary. The dev team inherits executable acceptance criteria instead of prose.

**`hitTest` is a first-class contract field** because Canvas has no DOM hit testing.
Click tolerance on a hairline, whether a click inside an unfilled rectangle selects it,
how locked objects are skipped — day-one questions prose specs leave undefined.

**Testing note (canvas reality):** once rendering is Konva, Playwright cannot assert
against DOM for canvas content. Gesture-clause tests assert on **store state after
dispatch** (the clause-id action log makes this natural), plus targeted probes: hit-test
unit tests against `core/` directly, and a small pixel-sampling helper for render-level
smoke checks. The Playwright suite stays keyed to clause ids; what it *inspects* is the
store, not the pixels.

---

## 6. Technical approach

### 6.1 Module layout — bounded core, thin shell

```
src/publisher/
  core/            # ZERO framework imports — the ported artifact
    registry/      # capability registry + generated-doc sources
    model/         # schema v3 (Zod), migrations (v2→v3), JSON round-trip
    geometry/      # grown from src/lib/layout/{geometry,snap,align,objects}.ts
    hittest/       # hit-testing per the ToolContract specs
    gestures/      # gesture state machines (pointer streams → committed actions)
    text/          # the shaping engine (§6.4)
    image/         # adjust-recipe evaluation (shared vocabulary with photo, §6.5)
    checker/       # design-checker rules over the model
    store/         # Redux Toolkit slices + actions (RTK is framework-free; §6.3)
  shell/           # React 19: dock, options bar, panels, canvas binding,
                   # SVG overlay, contentEditable/custom text editing surface
src/app/tool-model/page.tsx   # mounts the shell (client-only surface)
```

The repo's pure modules (`geometry.ts`, `snap.ts`, `align.ts`, `objects.ts`, `units.ts`,
`adjust-math.ts`, and the schema lineage) **move or are copied into `core/`** and grow
there; the legacy `/layout` surface keeps consuming its own copies untouched. The
extraction-readiness CI check (§0) enforces the boundary from day one.

The shell is scaffolding nobody ports. The host framework is the repo's Next.js — the
model is a client-side surface, and Next is what already hosts the photo editor's server
routes and the import API the model depends on.

### 6.2 Render layers — Konva content, SVG overlay (executes the K-tranche)

`LAYOUT_EDITOR_PLAN.md` §8.1 chose Canvas 2D via Konva for the production render layer;
that decision was never executed — **this build is the K-tranche**, and §8.1's spike
criteria carry over as its exit gate: on the store hardware profile, (a) 60fps
drag/marquee with 300+ objects including 10+ placed images; (b) live thumbnails for an
8-page document without jank; (c) zoom 10–400% crisp at devicePixelRatio; (d) memory
stable over a 30-minute session.

| Layer | Technology | Redraw cadence |
|---|---|---|
| **Furniture** — pasteboard, page fill/shadow, bleed, margins, column guides, slug | **Canvas** (Konva, cached) | Page-setup or zoom change only |
| **Content** — objects, text, images, master furniture beneath | **Canvas** (Konva) | Document mutation; `batchDraw` per frame |
| **Overlay** — selection frame + 8 handles, marquee, snap guides, node handles, overflow badges | **SVG** | Interaction rate |
| **Text editing** | **DOM** overlay (§6.4 phasing) | Only while editing |
| **Rulers** | **DOM** | Cheap; zoom/pan-aware off shared viewport state |

**Why SVG for the overlay:** the snap pipeline must intercept transforms mid-gesture
(ruling out `Konva.Transformer`), and interaction chrome — the exact thing being
specified — stays readable in devtools. Both surfaces share the stage transform; staying
in sync is applying zoom/pan to the SVG `viewBox`.

Coordinates stay canonical **inches, zoom-independent** (the repo convention), with zoom
as `stage.scale` and pan as `stage.position`, so every snap and geometry calculation is
render-agnostic pure math.

### 6.3 State — Redux Toolkit (org standard, affirmed)

RTK is the organization's standard and the dev team has already paid one Zustand→Redux
refactor; the model's store is RTK-native from the first commit. Redux core and RTK are
framework-free, so slices live in `core/store/`; `react-redux` appears only in the shell.

- **Gesture-clause ids are action types** (`rect/drawCommitted`,
  `selection/marqueeCommitted`) — the contract, the action, and the test share one string.
- **Redux DevTools time-travel is documentation**: a developer replays any gesture and
  watches exactly what the document did.
- RTK/Immer structural sharing makes snapshot-based undo cheap; history is a bounded
  snapshot stack of the document slice, **one entry per completed gesture** — the
  invariant the repo already enforces, preserved verbatim.

> **Hard rule: never dispatch per `pointermove`.** Gesture state lives in
> `core/gestures/` outside the store; the drag preview renders from it straight into the
> SVG overlay; **one action commits on pointer-up.**

**Coexistence with legacy Zustand:** the feedback tracker, `/layout`, and `/photo` keep
their Zustand stores — they are shipped surfaces, not handoff artifacts. The boundary
rule: **no store imports across the line in either direction**; the model talks to the
photo editor via the round-trip contract (§6.5) and to the importer via its Zod response
contract, never via each other's stores. Migrating `photo-store.ts` (539 lines) to RTK is
a backlog item for whenever the photo editor itself becomes part of the ported surface —
its portable contract today is the recipe schema, not the store.

### 6.4 Text — a real shaping engine (the decision that changed in v2.2)

**Requirement restated:** the complete §3.3 kit must be *evaluable by the SME* in this
model, and the text machinery must carry into the dev team's PDF output unchanged. The
v2.1 recommendation (Canvas `measureText` hybrid) structurally cannot do either —
`measureText` cannot toggle OpenType features, apply variable-font axes to measurement,
control justification spacing, or expose cluster/caret geometry. v2.2 therefore pulls the
real engine forward. This is the project's dominant cost and its most valuable artifact.

**Architecture (`core/text/`):**

1. **Shaping — HarfBuzz via WASM** (`harfbuzzjs`, MIT). Fonts load as ArrayBuffers
   (self-hosted, as the repo already does via `@fontsource`); shaping applies OpenType
   features (liga/dlig, smcp/c2sc, ss01–ss20, salt, swsh, onum/lnum, tnum/pnum, frac,
   ordn), language, and variable-font axis coordinates, returning glyph ids, advances,
   offsets, and **cluster maps**.
2. **Line breaking & H&J — our own composer.** UAX-14 break opportunities (the
   `linebreak` package or an in-core port), Liang-pattern hyphenation per language with a
   user exception list, then a **greedy fitter with H&J constraints**: hyphenation
   on/off, min word length, min chars before/after break, max consecutive hyphens,
   hyphenation zone, and min/desired/max word- and letter-spacing for justified text.
   Greedy matches Publisher's own composer, which is the comparison baseline; a
   Knuth-Plass multi-line composer is a named later slice, not v1.
3. **Rendering — glyph outlines, not `fillText`.** `harfbuzzjs` exposes glyph outline
   extraction (`glyphToPath`); the Konva content layer draws text as cached `Path2D`
   objects per `(font, glyphId)`, scaled per size, via a custom `sceneFunc`. This is the
   step that makes screen and PDF *structurally* identical: both consume the same
   outlines at the same positions.
4. **The contract — `PositionedGlyphRun`.** The engine's output type is the handoff:

   ```ts
   type PositionedGlyph = { glyphId: number; cluster: number; x: number; y: number };
   type GlyphRun  = { fontId: string; size: number; color: Ink;
                      features: Record<string, number>;
                      variations: Record<string, number>;
                      glyphs: PositionedGlyph[] };
   type LineBox   = { baseline: number; runs: GlyphRun[]; …breakInfo };
   type FrameLayout = { lines: LineBox[]; overset: boolean; anchors: ResolvedAnchor[] };
   ```

   Consumers: the canvas renderer, the overflow indicator, caret/selection/hit-testing,
   find-replace and spell-check highlight geometry, the anchor model — and the dev team's
   **PDF text path**, which turns the same glyph ids into `Tj` operations against
   embedded font subsets. The layout module stays DOM-free and isomorphic, so the server
   reproduces the screen by *sharing the code*, not by trusting two engines to agree.
5. **Fonts as data.** `doc.fonts` records family, source, axis coordinates, and the
   font's declared embedding permissions (`fsType`), surfaced in the resource manager and
   the design checker — the licensing seam the PDF path needs (§11.1).
6. **The evaluation font set.** Testing §3.3 needs fonts that actually carry the
   features. The catalog adds a curated libre set chosen for OpenType richness — e.g.
   EB Garamond (smcp, onum, swashes), Fraunces (variable: weight/optical-size/soft/wonk),
   Inter (tnum, stylistic sets), Source Serif 4 (variable, full figure sets) — beside the
   eight metric-compatible import stand-ins already self-hosted.

**Honest limits, named:**

- **Optical kerning is not a font feature** — no shaper provides it; InDesign computes it
  from glyph shapes. The contract exposes `kerning: 'metric' | 'optical' | manual`; v1
  ships metric + manual LIVE, and optical either lands as an outline-distance
  approximation (stretch slice) or stays SURFACE with the interface defined. Decision
  gate after the engine's first tranche (§9).
- **Editing-mode fidelity phases in.** T1 uses a `contentEditable` overlay for input
  (native IME/caret) accepting that edit-mode line breaks come from the browser and
  re-shape on commit — visible for justified text, tolerable briefly. T2 replaces it with
  a custom editing surface: hidden input for keystrokes/IME, caret and selection drawn
  from the engine's cluster maps, hit-testing from `FrameLayout`. **T2 is required before
  SME sign-off on typography** — evaluating H&J means watching it live while typing.

**Performance posture:** shaping is per-paragraph and cached by
`(text, style, width, fonts)` hash; reflow invalidates only affected paragraphs; glyph
`Path2D`s are cached per font. The §6.2 spike gates include a text-heavy page (a
newsletter spread of linked frames) at interactive framerates on the store profile.

### 6.5 Photo editing — two tiers plus standalone

The requirement: robust in-line photo editing keeps the user in the layout; advanced
operations hand off to the photo editor and pass back; the full photo editor remains
available standalone when no layout is involved. All three exist against **one recipe
vocabulary** — the photo editor's typed, ordered, non-destructive edit ops
(`src/lib/schema/photo.ts`), which becomes a shared contract in `core/image/`.

**Tier 1 — in-line Image adjust (LIVE).** Picture frames gain
`adjust: PhotoOp[]` in schema v3 — the *parametric subset* of the recipe vocabulary:
in-frame crop/pan/zoom, brightness, contrast, exposure, highlights/shadows, saturation,
temperature, auto-enhance, sharpen, transparency, recolor/tint, and **reset-to-original**
(free, because nothing is ever baked). The Image adjust panel and the Crop tool edit this
recipe; rendering applies `adjust-math.ts` (already pure, tested, framework-free — it
moves into `core/image/`) to the placed image's proxy on the Konva layer. Undo/redo is the
ordinary document history — an adjust commit is a gesture like any other.

**Tier 2 — round-trip for mask- and model-backed work (LIVE seam).** The boundary rule:
**parametric ops stay in-line; anything requiring a mask, a model, or product context
hands off** — content-aware erase, spot heal, background removal, upscale, bleed
expansion. "Edit photo" on a selected frame opens the existing `/photo` editor seeded
with the frame's asset **and its current recipe**; on return, the layout receives the
**live recipe, not flattened pixels** — upgrading the POC's PE10 round-trip, which
flattens. The frame stores the returned recipe; both editors can reopen and continue
non-destructively. Ops the layout canvas can't render live (a model-backed erase) carry
their approved patch exactly as the photo editor already stores them (the
stored-explicit pattern from PE9), so layout-side rendering is composition, not
re-inference.

**Standalone.** `/photo` remains a first-class suite surface, as shipped — the
no-layout-needed path. It is not rewritten for this project (see §6.3 on its store); its
recipe schema is the portable contract, and the model service seams it already declares
in `STUBS.md` are unchanged.

**Export note for the seams doc:** the PDF/image export path must replay frame adjust
recipes server-side at full resolution — the pattern `render-host.ts` already proves.
That contract line goes in `SEAMS.md`.

### 6.6 Document model — schema v3, as deltas on v2

The plan's most important deliverable is **evolution of this repo's proven schema, not a
fresh design**. Schema v2 already carries pages, masters, per-page size overrides,
per-run text, vector paths, an asset store, guides, rotation, and threading fields — and
has been validated by a `.pub` import pipeline scoring 100% element-level corpus
fidelity. v3 is a versioned migration (`v2→v3` loader, same pattern as the shipped
`v1→v2`), with every delta pulled in by a named consumer:

| Delta | Pulled in by | Shape (sketch) |
|---|---|---|
| **Layers** | Layers panel (§2.2) | `doc.layers: [{ id, name, color, visible, locked, printing, opacity, blend }]`; objects gain `layerId`. Document-scoped with per-page visibility overrides |
| **Object opacity/blend/effects** | Effects panel (§4.3, §2.2) | `opacity`, `blend`, `effects: { shadow?, glow?, softEdge?, bevel?, reflection? }` on the common frame |
| **Sections & numbering** | Sections panel (§1.5) | `doc.sections: [{ startPage, label, format, startValue, prefix }]`; page-number field object resolves against it |
| **Styles** | Styles panel (§3.6) | `doc.paragraphStyles / characterStyles` with `basedOn`, `nextStyle`; runs carry `styleId` + explicit overrides so the override indicator is derivable |
| **Anchors** | §3.8 phase-1 model rule | `doc.anchors: [{ id, storyId, position }]` — resolvable via the text engine's cluster maps; no consumer tool yet, by design |
| **Typography (run)** | Character panel (§3.3) | runs add `tracking`, `baselineShift`, `kerning`, `features`, `variations`, `language`, scaling |
| **Typography (paragraph)** | Paragraph panel (§3.3) | `hyphenation{…}`, `justification{min/desired/max word & letter}`, `tabs[]` (incl. leaders), bullets/numbering, `dropCap`, rules above/below, keep options, shading, baseline-grid lock |
| **Tables** | Table tool/panel (§8.1) | `Frame(type:'table')`: rows/cols, cells with spans, per-cell paragraphs, borders, shading. Flagged: **the second-hardest build item after text** — a cell is a text frame, so the engine is reused, but the tranche is not "days" |
| **Color model** | Swatches panel (§9.4), checker CMYK rules | `doc.swatches: [{ id, name, space:'rgb'\|'cmyk'\|'spot', values, spotName? }]`; fills/inks reference swatches or literals. Checker color math reuses the photo lib's lcms/GRACoL work |
| **Text wrap** | Text engine (§3.4) | `wrap: { mode, distance, boundary? }` on objects — consumed by the line breaker as exclusion geometry (why wrap belongs to the text tranche, not shapes) |
| **Picture adjust** | Image panel (§6.5) | `adjust: PhotoOp[]` + in-frame crop transform |
| **Document setup** | Setup panel (§1.4) | `slug` joins trim/bleed as first-class; per-page/per-spread setup values; baseline-grid settings; per-page guides |
| **Fonts** | Resource manager, PDF seam | `doc.fonts: [{ family, source, axes?, embeddingPermitted }]` |
| **Threading (activate)** | Link tool (§3.2) | `storyId/prevFrameId/nextFrameId` already in v2 — the editor finally consumes them |

**JSON round-trip (decision closed: in).** A debug export/import of the full document as
a file — the only proof the schema is complete, the fixture mechanism for tests, and the
bridge that lets the `/layout` importer's output (schema v2) migrate into the model as
seeded content. `core/model/` owns it; the shell exposes it in the debug bar.

### 6.7 Stack

| Layer | Choice |
|---|---|
| Core | TypeScript, strict, no framework imports (CI-enforced boundary) |
| State | **Redux Toolkit** in core; `react-redux` in the shell only |
| Content render | **Konva / react-konva** — furniture + content layers |
| Interaction overlay | **SVG** |
| Text | **harfbuzzjs (WASM shaping + glyph outlines)** · own UAX-14/Liang/H&J composer · Path2D glyph rendering · contentEditable→custom editing (T1→T2) |
| Image | Shared recipe vocabulary + `adjust-math` in core |
| Shell / host | React 19 under the repo's Next.js 15 (client-only surface at `/tool-model`) |
| Schema | **Zod** v3 (migrated from v2) → JSON Schema for the handoff |
| Tests | **Vitest** (core; golden text-layout fixtures) + **Playwright** (gesture clauses asserted via store) |
| Docs | Generator: registry → `TOOL_CONTRACTS.md` and friends |

New runtime dependencies: `konva`, `react-konva`, `@reduxjs/toolkit`, `react-redux`,
`harfbuzzjs`, a UAX-14 line-break package, hyphenation patterns. All MIT/BSD-class;
verified in T0.

---

## 7. Schedule

The v2.0 correction stands — this program ships tranches in days, not months, with review
cadence as the serializer — but **v2.2's text decision moves the text engine from "the
one hard problem" to the schedule's dominant term.** It is broad *and* deep: correctness
is iterated against golden fixtures, not inspected. Everything else remains
broad-but-shallow fan-out work.

### Phases

| Phase | Work | Shape |
|---|---|---|
| **A — Freeze the seams** | Registry · tool contracts · **schema v3 deltas + v2→v3 migration + JSON round-trip** · canvas foundation (Konva stage, SVG overlay, zoom/pan, rulers, pasteboard — the K-tranche, with its spike gates) · RTK store + gesture pipeline · dock, options bar, control panel rendering from the registry (both shape presentations) | **Serial.** Needs your review. The only real bottleneck. |
| **T0 — Text spike** (inside Phase A) | harfbuzzjs shaping + glyph-outline rendering proven on the store profile; composer interface frozen; evaluation font set chosen | Time-boxed; gates the text tranche |
| **B — Fan out** | Every tool and panel group, built against the frozen seams | **Parallel.** Disjoint surfaces, supervised and gated. |
| **T1–T3 — Text engine** (the long pole, runs through Phase B) | T1: shaped layout core + greedy H&J + contentEditable scaffold · T2: custom editing surface (caret/selection/IME from cluster maps) — **required before SME typography sign-off** · T3: full §3.3 kit surfaced (features, variable axes, drop caps, tabs/leaders, baseline grid) + optical-kerning decision | Its own track; golden-fixture-driven |

At the end of Phase A: **every tool visible in the dock with its complete option set and
written contract, nothing drawing yet** — the cheapest point to change your mind, and a
complete reviewable picture of the tool suite.

### Phase B groups

| Group | Delivers | Req |
|---|---|---|
| Selection & transform | Select, node select, marquee, move, 8-handle resize, rotate, snapping, smart guides; Transform + Align panels; group, lock, z-order | §2.1, §2.3, §5 |
| Shapes | Ten shape tools (both presentations), pen and node editing, fill/stroke/gradient, Eyedropper, Effects | §4.3, §4.4 |
| Text surfaces | Frame + Link tools, Character/Paragraph/Styles panels (styles with inheritance + override indicator), overset & autofit, wrap controls — all riding T1–T3 | §3.1–3.6 |
| Images & photo | Picture tool, Crop tool, **Image adjust panel (tier 1)**, **photo round-trip (tier 2)**, Resource manager *(link status LIVE; relink/package SURFACE)* | §4.1, §4.2, §4.5 |
| Document structure | Pages, spreads, mixed sizes, page rotation, masters, sections & numbering, trim/bleed/slug, guides & baseline grid | §1, §2.4, §2.5 |
| Tables & data | Table tool and panel (flagged: second-hardest item), cell operations, Merge field tool, data merge with record preview + sample sources | §7, §8 |
| Layers & colour | Layers panel with opacity/blend/lock/hide/non-printing; swatches, spot, CMYK (color math via the photo lib's lcms work) | §2.2, §9.4 |
| Validation | Live design checker — incremental for cheap rules (overflow, safe zone, bleed shortfall, empty frames) from day one; batch for expensive rules; severity, click-to-navigate, click-to-fix | §10.1 |
| Output surfaces | Print preview, booklet, marks, PDF and image export **settings** — all SURFACE, incl. the adjust-recipe replay and font-embedding seams | §9, §11 |
| Productivity | Find & replace incl. style-aware and pattern; spell-check interaction; templates, building blocks, themes; clipboard incl. paste special | §3.7, §6, §12 |
| Stretch | Footnotes, running headers, text variables, jump lines, cross-references — against the Phase A anchor model | §3.8 |

**Estimate:** Phase A remains days-scale (the schema head start is real). Phase B groups
remain days each in parallel. **The text engine is realistically half the total build**;
overall still low-single-digit weeks, with T2 (custom editing) the item most likely to
stretch — and the one least worth rushing, since it gates the typography evaluation this
model exists for.

---

## 8. Handoff bundle

1. **The running application** — plus a self-contained offline build, matching the
   existing `docs/handoff/` bundles.
2. **`TOOL_CONTRACTS.md`** — generated from the registry: every tool, options with types
   and defaults, gesture clauses with ids and action types.
3. **`DOCUMENT_MODEL.md`** + JSON Schema — schema v3, the storage/rendering contract,
   with the migration lineage (v1→v2→v3) documented.
4. **`TEXT_ENGINE.md`** — the `PositionedGlyphRun` contract, composer behavior spec, and
   the PDF-consumption notes (glyph ids → embedded subsets → `Tj`).
5. **`SEAMS.md`** — every SURFACE interface: what it's called with, what it returns, what
   the dev team owns — including adjust-recipe replay at export and font embedding.
6. **`CAPABILITY_MAP.md`** — every requirement § mapped to surface, tier, and owner. The
   gap analysis §14 asks for.
7. **The test suite** — golden text-layout fixtures + Playwright keyed to clause ids.
8. **Redux DevTools** — replayable gesture history as living documentation.
9. **The extraction script** — produces the standalone handoff repo from
   `src/publisher/core/` + this bundle, proving the §0 criterion.

---

## 9. Decisions

**Closed in v2.2:**

1. **Repo** — this repo, `src/publisher/` + `/tool-model` route, with
   extraction-readiness CI-enforced (§0).
2. **State** — Redux Toolkit (org standard). Legacy surfaces keep Zustand; boundary rules
   in §6.3.
3. **Text** — real shaping engine (harfbuzzjs + own composer + outline rendering),
   `PositionedGlyphRun` as the PDF-carrying contract (§6.4).
4. **Shape presentation** — both, behind a registry toggle; the prototype decides (§4.1).
5. **Photo** — both tiers + standalone, one recipe vocabulary (§6.5).
6. **JSON round-trip** — in (§6.6).
7. **Seeded content** — imported `.pub` corpus documents via the round-trip bridge, plus
   authored fixtures for capabilities Publisher files can't exercise (layers, spot
   colors, variable fonts).

**Open, with defaults (proceeding as stated unless redirected):**

1. **Design checker cadence** — default: live-incremental for cheap rules from day one,
   on-demand batch for expensive ones (§10.1 says live; this honors it without gating the
   canvas on color math).
2. **Optical kerning depth** — approximation slice vs SURFACE-with-interface; decided
   after T1 with real shaped text on screen (§6.4).
3. **Composer ambition** — greedy H&J (Publisher parity) is v1; Knuth-Plass multi-line
   composition is a named later slice. Confirm greedy is the right comparison baseline
   for your evaluation.
4. **`photo-store` RTK migration timing** — backlog until the photo editor joins the
   ported surface; the recipe schema is the contract meanwhile (§6.3).
