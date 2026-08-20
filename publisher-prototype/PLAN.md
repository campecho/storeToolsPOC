# Headless Layout Tool — Functional Model for Dev-Team Handoff

**Document type:** Implementation plan (standalone application)
**Status:** Draft v2.3 — plan of record
**Last updated:** 2026-08-18
**Source of truth:** [`docs/microsoft_publisher_feature_requirements.md`](docs/microsoft_publisher_feature_requirements.md)
(§1–§14) — **committed in this directory** so every § citation resolves inside the handoff
**Relationship to `storeToolsPOC`:** **reference implementation only.** The model is a
fully self-contained application with **zero runtime dependence** on the POC — no shared
code, no shared stores, no cross-app flows. The POC is consulted (and selectively copied
from) as prior art: its schema lineage, its proven edit-recipe architecture, its pure
geometry/snap/adjust math, and its Konva evaluation. Its home in this repo is temporary
and mechanical (§0).

**Changes in v2.3 (the break-out requirement wins):**

1. **Standalone application, cleanly extractable — final.** v2.2's repo-home decision is
   reversed. Everything lives under `publisher-prototype/`, a directory that *is* the
   future repo root: own `package.json`, own tooling, no imports reaching the host repo,
   CI-enforced. Breaking out to a new repo is copying the directory (§0).
2. **The photo toolset is rebuilt inside the model** — no dependency on the POC's
   `/photo` surface. In-line image adjust, a full-screen photo mode, and standalone
   single-image editing are all one engine over one recipe vocabulary, specified fresh in
   the core with the POC as reference (§6.5). The cross-app round-trip of v2.2 becomes a
   **mode switch over shared state** — a strictly cleaner architecture.
3. **The app is fully client-side again.** With no POC server routes to lean on, every
   process-boundary operation (full-res render, HEIC, ICC/CMYK, model services) is a
   declared SURFACE seam — restoring v2.1's headless purity. Vite replaces Next as the
   shell host (§6.7).
4. Carried forward from v2.2 unchanged: Redux Toolkit (org standard) · the real shaping
   engine with the `PositionedGlyphRun` PDF-carrying contract · shape presentation both
   ways behind a toggle · JSON round-trip · authored seeded fixtures · **publisher import
   entirely out** (dev team adds it after implementing the toolset — §0).
5. **Handoff hygiene checklist added (§0.1)** and the requirements doc committed into
   `docs/` — the registry's citations now resolve without any external document.

**Changes in v2.2:** decisions closed — RTK affirmed; text upgraded from measureText
hybrid to a real shaping engine; photo editing in scope (both tiers + standalone); shape
toggle; JSON round-trip; import excluded from the model.
**Changes in v2.1:** stack settled — Konva (Canvas 2D) content, SVG interaction overlay,
React, Redux Toolkit, framework-free TypeScript core.
**Changes in v2.0:** scope narrowed to a headless layout tool; three-tier build status;
schedule estimate corrected.

---

## 0. Standalone posture — how the clean break-out is guaranteed

The governing requirement: **the whole prototype must break out and hand off to the dev
team cleanly, tied to nothing.**

- **`publisher-prototype/` is the future repo, hosted here only for push access.** It is
  self-contained: its own `package.json` and lockfile, its own `tsconfig`, `vite.config`,
  test setup, and CI jobs. Nothing inside the directory imports from outside it; nothing
  outside imports from inside. A CI check walks the import graph and fails on any path
  escaping the directory (and on any dependency not declared in its own manifest).
  **Extraction = copy the directory to the new repo's root** (with `git subtree split`
  available if commit history should travel). The moment a target repo exists, the
  directory moves and this repo is untouched.
- **The POC is prior art, not a platform.** Where its pure modules fit the new
  architecture — the Zod schema lineage, geometry/snap/align math, the image adjust
  math — they are *copied in and owned*, never imported. Where its shipped subsystems
  prove a pattern — the edit-recipe architecture, the jailed render service, the Konva
  spike criteria — the pattern is specified in this model's contracts and the POC
  implementation is cited as the working reference for the dev team's side of the seam.
- **Publisher import stays out entirely.** Sequencing: this model specifies the
  publisher-clone toolset → the dev team implements the toolset in the new app → the dev
  team then adds the `.pub` import flow, in their architecture. Nothing import-related
  appears in the model or its handoff.
- **Open logistics item (the only one):** the target repo — name, org, and when to
  create it. Until then, work proceeds on this branch inside the directory; nothing about
  the code changes when it moves.

### 0.1 Handoff hygiene checklist

The standalone posture handles architectural cleanliness; these are the practical ways a
directory-in-a-host-repo handoff goes messy, with when each must be resolved.

**Resolved before the first code commit:**

- [x] **Requirements doc travels with the app.** Committed at
  `docs/microsoft_publisher_feature_requirements.md`; the plan, the registry, and every
  generated document cite § numbers that resolve inside this directory. No handoff
  artifact may cite a document that isn't in the directory.
- [ ] **Extraction mode decided: copy vs `git subtree split`.** *Default: copy* — a
  pristine new repo, with rationale carried by the generated docs and the review record
  rather than commit history. If history should travel instead, say so before code
  starts: subtree split drags along every commit that ever touched the directory, so the
  discipline below stops being good practice and becomes binding.
- [ ] **POC access question answered, recorded in `SEAMS.md`.** Does the dev team get
  read access to `storeToolsPOC`? Either answer is workable; an unrecorded answer is not,
  because the seam entries cite the POC's shipped implementations as references.

**Binding commit discipline (regardless of extraction mode):**

- **No mixed commits.** A commit touches `publisher-prototype/` or the host repo, never
  both.
- **Messages read standalone.** Commit messages for this directory assume no POC
  context — they describe the prototype change on its own terms.

**Phase A scaffold tasks (part of the scaffold's definition of done):**

- **Fence the host tooling.** Explicit excludes for this directory in the host's Vitest,
  Playwright, ESLint, and `tsc` configs so root runs neither lint, test, type-check, nor
  build anything in here; `.gitignore` coverage for this directory's `dist/`; a README
  note stating installs happen *inside* the directory (two lockfiles, one rule).
- **CI logic lives inside the directory.** Boundary check, tests, and build are scripts
  in this directory's own `package.json`; the host workflow is a thin cd-and-run shim.
  The new repo gets working CI by adding one small workflow file.
- **Toolchain pinned inside.** `engines` + `.nvmrc` declared here, not inherited from
  the host.

**Standing rules for the whole build:**

- **Assumption tags travel.** Any module seeded from the POC carries its `ASSUMPTION:`
  annotations (snap radius, zoom ranges, DPI mapping, undo depth) into this model's
  registry, flagged for SME validation — placeholder numbers must never read as
  decisions. Several of those numbers are precisely what this prototype exists to judge.
- **Fixture licensing.** Seeded documents use CC0/owned assets only; nothing from the
  POC's photo or `.pub` corpora. The rule is stated in `fixtures/README`.
- **Naming stays cheap to change.** "publisher-prototype" is a working name; if the
  handoff may reach external vendors, pick the neutral name before the handoff bundle is
  generated, not after.
- **The stopgap stays short.** Create the target repo early — even empty, right after
  the Phase A scaffold — and move the directory then. Every week in the host repo
  accrues mixed-PR risk, host-config drift, and heavyweight clones for anyone working
  only on the prototype.

---

## 1. What this is

A **standalone functional model of the layout tool's interaction surface** — every tool,
every panel, every option, and exactly what each does on the canvas — so a dev team can
implement the real product against it. Per v2.2/v2.3 it also models the photo-editing
capability in its three shapes: in-line on the layout canvas, as a focused photo mode,
and standalone with no layout at all.

It answers three questions per tool:

1. What is it?
2. What options does it have, with types, ranges, and defaults?
3. What exactly happens when you use it on the canvas?

The running app is the specification. The generated documents are its printed form.

**The reviewer is the instrument.** This model exists so a print/design SME can drive
every tool, compare against Publisher and its peers, and sign off before dev-team
implementation. Two affordances serve that directly, both in-app and standalone:

- **Contract checklists** — each tool's gesture clauses render as a checkable list beside
  the tool (generated from the registry), so a review session produces a record.
- **Review notes** — a lightweight per-tool notes field, exported together with checklist
  state as a JSON/markdown review report. No external tracker dependency.

---

## 2. The scope boundary

**The model builds:** anything a user can see, click, drag, or configure — and everything
that changes the document *in memory*. This includes real text shaping and real image
adjustment, because both are things the SME must evaluate, not stubs.

**The dev team builds:** anything that crosses a process boundary — network, disk,
printer, PDF bytes, model inference — plus the application shell around the tool.

| In scope (this model) | Out of scope (dev team) |
|---|---|
| Tool dock and every tool's canvas behavior | Application header, navigation, suite chrome |
| Control panels and every option they carry | Backend services, auth, catalog/product API |
| Canvas: geometry, selection, transform, snapping, guides | Storage — save, open, autosave, recovery |
| The in-memory document model (schema v3) | Native `.cdoc` format on disk (§13.2) |
| **Text engine: shaping, H&J, OpenType — LIVE (§6.4)** | PDF **bytes**: font subsetting/embedding, PDF/X-4 writer |
| **Image adjust + photo mode + mask interactions (§6.5)** | Model services (inpaint, upscale, bg removal); full-res render; HEIC; ICC/CMYK transforms |
| Live design-checker analysis over the model | Final file rendering — print output (§11.1) |
| Export/print **settings surfaces** and their presets | `.pub` import — added by the dev team after the toolset is implemented (§13.1) |
| Spell-check *interaction* (marks, suggestions, panel) | Dictionaries and proofing services (§3.7) |

**Two contracts are the load-bearing deliverables:**

1. **The document model (schema v3)** — what storage and rendering get implemented
   against. Seeded from the POC's corpus-proven v2 lineage, owned and evolved here (§6.6).
2. **The shaped-text output (`PositionedGlyphRun`, §6.4)** — what the PDF path consumes.
   The dev team's PDF text is the same glyph ids at the same positions from the same
   fonts; WYSIWYG is structural, not aspirational.

### Three regions, nothing else

```
┌──────────────────────────────────────────────────────────┐
│  tool options bar   (contextual — changes with the tool)  │
├──────┬─────────────────────────────────────┬─────────────┤
│ tool │     |                               │   control   │
│ dock │pages|          canvas               │    panel    │
│      │     |                               │             │
└──────┴─────────────────────────────────────┴─────────────┘
```

No header, no menus, no title bar, no status bar. Basic unstyled UI — default controls
with enough CSS to be usable and no more, so nothing is mistaken for design direction.
Photo mode (§6.5) reuses the same three regions with a photo-scoped dock and panel set.

---

## 3. Three-tier build status

Every capability carries one of three statuses, visible in the app beside the control:

| Tier | Meaning | Example |
|---|---|---|
| **LIVE** | Fully interactive. Real behavior on canvas or in the panel. | Rectangle tool, Layers panel, H&J controls, Image adjust |
| **SURFACE** | The control exists with its full option set, defaults, and a written contract — but the action stops at a declared interface the dev team implements. | Export PDF settings, Save, inpaint execution, HEIC open |
| **OUT** | Not represented. Named in the capability map with its owner. | PDF/X-4 writer, font activation service, `.pub` import |

SURFACE is not a stub — it is a specification with a named seam, declaring the interface
it would call and the data shape it would pass. Optical kerning is the one §3.3 item that
may land SURFACE (§6.4); mask-based photo ops are interaction-LIVE with execution-SURFACE
(§6.5).

---

## 4. Classification — the first artifact

The requirements document is organized by **capability area**; a tool dock by **what the
user picks up**. Most requirements are not tools:

| Surface | Count | Lives in |
|---|---|---|
| **Tool** | ~23 layout + ~8 photo-mode | The dock (per mode) |
| **Panel** | ~26 layout + ~6 photo-mode | The control panel |
| **Command** | ~30 | Keyboard / context menu (no dock slot) |
| **Dev-team seam** | ~12 | Named in the capability map, not built |

**The first artifact is a registry, not UI.** One machine-readable file classifying every
requirement with its § citation, tier, and contract. The dock, options bar, control
panel, checklists, and every generated document are *renderings of that one file*.

### 4.1 The layout tool set (~23)

| # | Tool | Group | Req |
|---|---|---|---|
| 1 | Select | Selection | §2.1, §5.1–5.3 |
| 2 | Node / direct select | Selection | §4.4 |
| 3 | Text frame | Content | §3.1 |
| 4 | Link text frames | Content | §3.2 |
| 5 | Picture frame | Content | §4.1 |
| 6 | Crop | Content | §4.2 |
| 7 | Table | Content | §8.1 |
| 8–16 | Rectangle · Rounded rectangle · Ellipse · Line · Arrow · Star/polygon · Callout · Banner · Pen/freeform | Shapes | §4.4 |
| 17 | Fill / gradient | Style | §4.4, §9.4 |
| 18 | Eyedropper / format painter | Style | §12.2 |
| 19 | Guide | Layout aids | §2.4 |
| 20 | Merge field | Data | §7.1 |
| 21 | Building block | Data | §6.2 |
| 22 | Zoom | Navigation | §9.1 |
| 23 | Pan | Navigation | — |

**Shape presentation (settled by prototype review, 2026-08-19):** **individual slots.**
The dock gives each of the nine shape tools its own slot. The alternative rendering — one
slot with a flyout, offered alongside it behind a debug-bar toggle while the question was
open — is gone, along with the toggle: the review found the flyout unnecessary, and a
choice nothing chooses between is only a second thing to keep working.

**Flowchart shapes (cut by prototype review, 2026-08-19):** the digest's §4.4 lists them
and the prototype drew all five, but the review found the tool unwanted and it is gone —
tool, shape kind, symbol parameter and all. §4.4 is unchanged as a record of what
Publisher does; this table is the record of what we build, and the two differ here on
purpose. Nothing else in the digest depends on the kind.

### 4.2 The photo-mode tool set (~8)

Crop & straighten · Adjust (tone/color) · Mask brush · Mask marquee · Text overlay ·
Image overlay · Eyedropper · Zoom/Pan — bound to the same recipe vocabulary as the
in-line Image panel (§6.5), with photo-scoped options bars.

### 4.3 The panel set (~26 layout + ~6 photo)

Layout: Transform · Character · Paragraph · Styles · Layers · Pages · Master pages ·
Sections & numbering · Document setup (trim/bleed/slug) · Guides & grid · Align &
distribute · Text wrap · Text fit & overflow · Colour & swatches · Effects · **Image
adjust (LIVE, §6.5)** · Resource manager · Design checker · Data merge · Templates ·
Building blocks · Themes · Language & proofing · Table properties · Find & replace ·
History.

Photo mode: Adjustments · Crop & geometry · History (recipe steps) · Overlays · Fix for
print (settings SURFACE) · Export (settings SURFACE).

Explicit in the registry (under-represented in v2.1): clipboard/paste-special (commands,
§12.2), object styles (Styles panel scope, §3.6), and the layers-scoping decision
(§2.2's "as configured" — the schema picks document-scoped layers with per-page
visibility overrides; the panel exposes it).

### 4.4 One requirement that must not be deferred

§3.8's **anchor model** — a stable reference to a text position surviving reflow — goes
into schema v3 from the first draft, with no tool using it yet. Retrofitting anchors into
a shipped text engine is substantially more expensive than accommodating them up front.
The shaping engine's cluster maps (§6.4) are what make anchors resolvable.

---

## 5. The tool contract

Every tool carries identical fields. Uniformity is the point — a reviewer can diff tool
17 against tool 3 and see exactly what differs.

```ts
type ToolContract = {
  id: string;
  label: string;
  mode: "layout" | "photo" | "both";
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

**Testing note (canvas reality):** with Konva rendering, Playwright cannot assert against
DOM for canvas content. Gesture-clause tests assert on **store state after dispatch**
(the clause-id action log makes this natural), plus targeted probes: hit-test unit tests
against `core/` directly, and a small pixel-sampling helper for render-level smoke
checks. The Playwright suite stays keyed to clause ids; what it *inspects* is the store.

---

## 6. Technical approach

### 6.1 Application layout — bounded core, thin shell

```
publisher-prototype/          # the future repo root — fully self-contained
  package.json  vite.config.ts  tsconfig.json  …
  src/
    core/          # ZERO framework imports — the ported artifact
      registry/    # capability registry + generated-doc sources
      model/       # schema v3 (Zod), JSON round-trip, fixtures loader
      geometry/    # seeded by copies of the POC's pure math, owned here
      hittest/     # hit-testing per the ToolContract specs
      gestures/    # gesture state machines (pointer streams → committed actions)
      text/        # the shaping engine (§6.4)
      image/       # the photo recipe vocabulary + adjust evaluation (§6.5)
      checker/     # design-checker rules over the model
      store/       # Redux Toolkit slices + actions (RTK is framework-free)
    shell/         # React 19: dock, options bar, panels, canvas binding,
                   # SVG overlay, text editing surface, photo mode chrome
  fixtures/        # authored seeded documents (§9)
  docs/            # generated handoff bundle output
```

The core/shell split is the §6.1 rule from v2.1, unchanged: the core is what the dev team
ports; the shell is scaffolding nobody carries forward. The extraction-boundary CI check
(§0) enforces both the directory boundary and the core's framework-free rule from the
first commit.

### 6.2 Render layers — Konva content, SVG overlay

The POC program evaluated render engines for exactly this class of surface and chose
Canvas 2D via Konva (store hardware profile: i5-8500/UHD 630, no GPU-feature dependency;
MIT licensing; convergence with sibling tools). This model adopts that decision — and its
**spike criteria carry over as the canvas foundation's exit gate**: (a) 60fps
drag/marquee with 300+ objects including 10+ placed images; (b) live thumbnails for an
8-page document without jank; (c) zoom 10–400% crisp at devicePixelRatio; (d) memory
stable over a 30-minute session.

| Layer | Technology | Redraw cadence |
|---|---|---|
| **Furniture** — pasteboard, page fill/shadow, bleed, margins (mirrored under facing binding), column guides, slug, spine | **Canvas** (Konva, cached) | Page-setup, binding, or zoom change only |
| **Content** — objects, text, images, master furniture beneath | **Canvas** (Konva) | Document mutation; `batchDraw` per frame |
| **Overlay** — selection frame + 8 handles, marquee, snap guides, node handles, overflow badges | **SVG** | Interaction rate |
| **Text editing** | **DOM** overlay (§6.4 phasing) | Only while editing |
| **Rulers** | **DOM** | Cheap; zoom/pan-aware off shared viewport state |

**Why SVG for the overlay:** the snap pipeline must intercept transforms mid-gesture
(ruling out `Konva.Transformer`), and interaction chrome — the exact thing being
specified — stays readable in devtools. Both surfaces share the stage transform; staying
in sync is applying zoom/pan to the SVG `viewBox`.

Coordinates are canonical **inches, zoom-independent**, with zoom as `stage.scale` and
pan as `stage.position`, so every snap and geometry calculation is render-agnostic pure
math. Photo mode runs the same stage in pixel space with the same overlay pattern.

**The canvas's display unit is the spread, not the page** (§6.8). Under single-page
binding a spread is one page and nothing changes; under facing binding the stage draws
both pages and the spine together, and object coordinates are spread-relative — which is
what lets an object cross the spine and stay one object (§1.2).

### 6.3 State — Redux Toolkit

RTK is the organization's standard; the store is RTK-native from the first commit. Redux
core and RTK are framework-free, so slices live in `core/store/`; `react-redux` appears
only in the shell.

- **Gesture-clause ids are action types** (`rect/drawCommitted`,
  `selection/marqueeCommitted`) — the contract, the action, and the test share one string.
- **Redux DevTools time-travel is documentation**: a developer replays any gesture and
  watches exactly what the document did.
- RTK/Immer structural sharing makes snapshot-based undo cheap; history is a bounded
  snapshot stack of the document slice, **one entry per completed gesture** — the
  invariant the POC proved, preserved here.
- Layout and photo mode share the one store: photo mode edits the same document slice
  (a picture frame's recipe, or a single-image document), which is what makes the mode
  switch lossless (§6.5).

> **Hard rule: never dispatch per `pointermove`.** Gesture state lives in
> `core/gestures/` outside the store; the drag preview renders from it straight into the
> SVG overlay; **one action commits on pointer-up.**

### 6.4 Text — a real shaping engine

**Requirement:** the complete §3.3 kit must be *evaluable by the SME* in this model, and
the text machinery must carry into the dev team's PDF output unchanged. Canvas
`measureText` structurally cannot do either — it cannot toggle OpenType features, measure
variable-font instances, control justification spacing, or expose cluster/caret geometry.
This engine is the project's dominant cost and its most valuable artifact.

**Architecture (`core/text/`):**

1. **Shaping — HarfBuzz via WASM** (`harfbuzzjs`, MIT). Fonts load as ArrayBuffers
   (self-hosted via npm font packages); shaping applies OpenType features (liga/dlig,
   smcp/c2sc, ss01–ss20, salt, swsh, onum/lnum, tnum/pnum, frac, ordn), language, and
   variable-font axis coordinates, returning glyph ids, advances, offsets, and **cluster
   maps**.
2. **Line breaking & H&J — our own composer.** UAX-14 break opportunities, Liang-pattern
   hyphenation per language with a user exception list, then a **greedy fitter with H&J
   constraints**: hyphenation on/off, min word length, min chars before/after break, max
   consecutive hyphens, hyphenation zone, and min/desired/max word- and letter-spacing
   for justified text. Greedy matches Publisher's own composer — the comparison
   baseline; a Knuth-Plass multi-line composer is a named later slice.
3. **Rendering — glyph outlines, not `fillText`.** `harfbuzzjs` exposes glyph outline
   extraction; the Konva content layer draws text as cached `Path2D` objects per
   `(font, glyphId)`, scaled per size, via a custom `sceneFunc`. This makes screen and
   PDF *structurally* identical: both consume the same outlines at the same positions.
4. **The contract — `PositionedGlyphRun`.**

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
   find-replace and spell-check highlight geometry, the anchor model — and the dev
   team's **PDF text path**, which turns the same glyph ids into `Tj` operations against
   embedded font subsets. The layout module is DOM-free and isomorphic, so a server
   reproduces the screen by *sharing the code*, not by trusting two engines to agree.
5. **Fonts as data.** `doc.fonts` records family, source, axis coordinates, and declared
   embedding permissions (`fsType`), surfaced in the resource manager and the design
   checker — the licensing seam the PDF path needs (§11.1).
6. **The evaluation font set.** Testing §3.3 needs fonts that actually carry the
   features — a curated libre set chosen for OpenType richness: e.g. EB Garamond (smcp,
   onum, swashes), Fraunces (variable: weight/optical-size/soft/wonk), Inter (tnum,
   stylistic sets), Source Serif 4 (variable, full figure sets), plus metric-compatible
   standins for the Publisher-era core faces.

**Honest limits, named:**

- **Optical kerning is not a font feature** — no shaper provides it; InDesign computes
  it from glyph shapes. The contract exposes `kerning: 'metric' | 'optical' | manual`;
  v1 ships metric + manual LIVE, and optical either lands as an outline-distance
  approximation (stretch slice) or stays SURFACE with the interface defined. Decision
  gate after the engine's first tranche (§9).
- **Editing-mode fidelity phases in.** T1 uses a `contentEditable` overlay for input
  (native IME/caret), accepting that edit-mode line breaks come from the browser and
  re-shape on commit. T2 replaces it with a custom editing surface: hidden input for
  keystrokes/IME, caret and selection drawn from the engine's cluster maps, hit-testing
  from `FrameLayout`. **T2 is required before SME sign-off on typography** — evaluating
  H&J means watching it live while typing.

**Performance posture:** shaping is per-paragraph and cached by
`(text, style, width, fonts)` hash; reflow invalidates only affected paragraphs; glyph
`Path2D`s are cached per font. The §6.2 spike gates include a text-heavy page (a
newsletter spread of linked frames) at interactive framerates on the store profile.

### 6.5 Photo editing — one engine, three shapes, rebuilt here

The requirement: robust in-line photo editing keeps the user in the layout; advanced
operations get a focused surface; full photo editing exists standalone when no layout is
involved. In v2.3 all three are **one engine inside this app**, over one recipe
vocabulary — no cross-app handoff, no dependency on the POC's photo editor.

**The recipe vocabulary (`core/image/`).** A typed, ordered, non-destructive list of
image operations — crop/rotate/straighten/flip, tone and color adjustments,
auto-enhance, sharpen, transparency, recolor/tint, overlays, and mask-scoped ops — with
**reset-to-original free by construction** (nothing is ever baked). The POC's shipped
edit-recipe architecture (proxy-edit client, deterministic full-res replay server-side,
stored-explicit model outputs) is the proven pattern this vocabulary re-specifies; the
POC remains the dev team's working reference for the server half.

**Shape 1 — in-line Image adjust (LIVE).** Picture frames carry `adjust: PhotoOp[]` in
schema v3. The Image adjust panel and the Crop tool edit the parametric subset in place
on the layout canvas: in-frame crop/pan/zoom, brightness, contrast, exposure,
highlights/shadows, saturation, temperature, auto-enhance, sharpen, transparency,
recolor, reset. Rendering applies the adjust math (seeded from the POC's pure
`adjust-math`, owned here) to the placed image's proxy on the Konva layer. An adjust
commit is an ordinary document gesture — same history, same undo.

**Shape 2 — photo mode (LIVE interactions, SURFACE execution where models are needed).**
"Edit photo" on a picture frame switches the app into a focused single-image surface —
same three regions, photo-scoped dock and panels (§4.2) — editing **the same recipe on
the same frame in the same store**. Returning to layout is a mode switch, lossless by
construction. Photo mode adds what doesn't fit in-line: large canvas, before/after
compare, named history steps, and **mask interactions** (brush and marquee) for
region-scoped operations. Mask *drawing* is LIVE; mask *execution* that needs a model —
inpaint/remove-object, spot heal, background removal, upscale — is SURFACE: the seam
declares the call (`inpaint(image, mask) → patch`), and the result slots into the recipe
as a stored-explicit patch exactly as the POC proved.

**Shape 3 — standalone (LIVE).** Opening or creating an image-only document lands
directly in photo mode with no layout document at all — same engine, same recipe, same
panels. A "place into layout" action wraps the image in a one-page document when the
user's job grows.

**Dev-team seams declared by this section** (each cites the POC's shipped implementation
as the reference for the other side): full-resolution recipe replay at export · HEIC and
camera-format decode · ICC/CMYK transforms and print-intent export · model services
(inpaint, spot heal, background removal, upscale). All are registered SURFACE with
payload shapes in `SEAMS.md`.

### 6.6 Document model — schema v3, seeded by the proven v2 lineage

The most important deliverable is designed here, from the first commit — but not from a
blank page. The POC's schema v2 (pages, masters, per-page size overrides, per-run text,
vector paths, asset store, guides, rotation, threading fields) was validated by a
conversion pipeline measuring 100% element-level fidelity against a real-document corpus;
v3 **copies that lineage in as its starting point and owns it**. No runtime migration
from v2 is required — the model's documents are its own fixtures — but the version field
and migrate-on-read posture ship from day one, because the dev team's storage will need
them.

What v3 carries beyond the v2 lineage, each delta pulled in by a named consumer:

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
| **Color model** | Swatches panel (§9.4), checker CMYK rules | `doc.swatches: [{ id, name, space:'rgb'\|'cmyk'\|'spot', values, spotName? }]`; fills/inks reference swatches or literals |
| **Text wrap** | Text engine (§3.4) | `wrap: { mode, distance, boundary? }` on objects — consumed by the line breaker as exclusion geometry (why wrap belongs to the text tranche, not shapes) |
| **Picture adjust** | Image panel / photo mode (§6.5) | `adjust: PhotoOp[]` + in-frame crop transform; single-image documents for standalone photo |
| **Document setup** | Setup panel (§1.4) | `slug` joins trim/bleed as first-class; per-page/per-spread setup values; baseline-grid settings; per-page guides |
| **Spreads & binding** | Pages panel (§1.2), Setup panel (§1.4) | `doc.binding: 'single' \| 'facing'`. Spread membership is **derived from page order, never stored** (§6.8); `page.keepWithPrevious?: true` extends the preceding spread for gatefolds and island spreads |
| **Mirrored margins** | Setup panel (§1.4), spread furniture (§6.2) | optional per-edge `margins: { top, bottom, inside, outside }` overriding the scalar `margin`; `inside`/`outside` resolve to left/right by each page's side within its spread |
| **Fonts** | Resource manager, PDF seam | `doc.fonts: [{ family, source, axes?, embeddingPermitted }]` |
| **Threading (activate)** | Link tool (§3.2) | `storyId/prevFrameId/nextFrameId` in the lineage — the editor finally consumes them |

**JSON round-trip (decision closed: in).** A debug export/import of the full document as
a file — the only proof the schema is complete, and the fixture mechanism for tests and
seeded content. `core/model/` owns it; the shell exposes it in the debug bar.

### 6.7 Stack

| Layer | Choice |
|---|---|
| App | **Fully client-side, standalone** — no server, no backend |
| Core | TypeScript, strict, no framework imports (CI-enforced boundary) |
| State | **Redux Toolkit** in core; `react-redux` in the shell only |
| Content render | **Konva / react-konva** — furniture + content layers |
| Interaction overlay | **SVG** |
| Text | **harfbuzzjs (WASM shaping + glyph outlines)** · own UAX-14/Liang/H&J composer · Path2D glyph rendering · contentEditable→custom editing (T1→T2) |
| Image | Recipe vocabulary + adjust evaluation in core; proxies via `createImageBitmap` |
| Shell | **React 19 + Vite** |
| Schema | **Zod** (v3, seeded from the v2 lineage) → JSON Schema for the handoff |
| Tests | **Vitest** (core; golden text-layout fixtures) + **Playwright** (gesture clauses asserted via store) |
| Docs | Generator: registry → `TOOL_CONTRACTS.md` and friends |

Dependencies: `react`, `react-dom`, `@reduxjs/toolkit`, `react-redux`, `konva`,
`react-konva`, `zod`, `harfbuzzjs`, a UAX-14 line-break package, hyphenation patterns,
npm font packages. All MIT/BSD/OFL-class; verified in T0. Everything declared in the
directory's own manifest — the §0 boundary check enforces it.

### 6.8 Pages and spreads — display and controls

§1.2 asks for facing-page documents that "look and behave the way the finished, folded
piece will read." That spans the schema, the canvas, and two panels, so the pairing rules
live here once and the other sections cite them. Everything in this section is **LIVE** —
it is all in-memory document state and canvas display. The one adjacent SURFACE is
export's reader-spreads-vs-single-trim-pages choice (§11.1), which reads this model but
does not belong to it.

**The pairing rules.** Spread membership is a **pure function of page order and the
binding flag, recomputed on every insert, delete, duplicate, and reorder** — never stored.
That is the whole reason the derived model was chosen over an explicit spread array: a
stored grouping can drift out of sync with page order, and §1.2 requires that duplication
and reordering preserve page-level state rather than quietly corrupt it.

1. Under `binding: 'single'`, every page is its own spread. This is the default, and
   nothing else in this section applies.
2. Under `binding: 'facing'`, the **first page sits alone on the recto**; pages 2–3, 4–5,
   and so on pair. A page's side within its spread (verso/recto) follows from its index.
3. `page.keepWithPrevious` appends a page to the preceding spread instead of starting a
   new pair, and consecutive flags extend it further — this is how §1.2's "island or
   multi-page spreads for gatefolds and multi-panel pieces" are expressed, without a
   second addressing scheme competing with page index.
4. Changing binding after creation is permitted (§1.2) and is **one gesture, one history
   entry** (§6.3) — it repaginates the whole document, so it must undo in one step.

**Display (canvas).** The stage draws a spread as one surface: both pages, their
furniture, and the **spine** between them (§6.2's furniture layer). Objects are
spread-relative, so one may cross the spine and remain a single object — §1.2 requires it
to "export and print as one continuous object, without a seam," which is a property of the
model here and of the dev team's output path, not of two glued page renders. The
pasteboard is **scoped to the spread**, so staged assets travel with the spread they were
parked beside — §2.5 says "per page or spread … as configured," and this picks the spread
half of it for the same reason §4.3 picks document-scoped layers: the model must choose one
and say so. §2.5's *shared* document-wide asset area is not decided here and remains open.
Mixed page sizes within one spread are legal (§1.2, §1.4): each page keeps its own
`sizeOverride` and the spread's extent is their union.
*ASSUMPTION: pages of unequal size in one spread align on their top edges — the standing
§0.1 rule applies, so this is flagged for SME validation and must not read as a decision.*

**Display (Pages panel, §1.2).** Thumbnails render "as spreads … not as unrelated single
pages," with the spine drawn and mixed sizes visible at their true relative proportions.
Two behaviors carry real weight:

- **Pairing-shift preview.** Adding or removing a page in a facing document reshuffles
  every downstream pair. §1.2 requires the tool to "make this shift visible before it is
  committed," so the panel previews the new pairing on the pending operation and commits
  only on confirmation. Drag-reorder previews the same way.
- **Page rotation is authoring-only.** A rotated page displays rotated for editing while
  its true output orientation is preserved and independently inspectable (§1.4). The
  navigation pane shows the output orientation, not the authoring rotation.

**Controls.** No new panel — the surfaces already registered in §4.3 carry these, and this
section is their contract:

| Control | Panel | Req |
|---|---|---|
| Binding toggle (single/facing), changeable after creation | Document setup | §1.2 |
| Mirrored margins — left/right fields become **inside/outside** under facing binding | Document setup | §1.2, §1.4 |
| `keepWithPrevious` — "join to previous spread," for gatefolds and island spreads | Pages | §1.2 |
| Add · insert before/after · delete · duplicate · drag-reorder, with pairing preview | Pages | §1.2 |
| Per-page and per-spread setup overrides in mixed-size documents | Document setup | §1.4 |
| Spread-scoped pasteboard extent | Document setup | §2.5 |

**Consumers already waiting on this.** Sections and numbering resolve page labels against
page order, not spread membership (§1.5) — binding changes must not renumber. The design
checker reads it for booklet-incompatible page counts and for objects straddling the spine
or the page/pasteboard boundary (§10.1). Booklet imposition (§9.5) and export's
reader-spread option (§11.1) are SURFACE settings that consume the same model.

---

## 7. Schedule

Tranches ship in days, with review cadence as the serializer — but **the text engine is
the schedule's dominant term**: broad *and* deep, iterated against golden fixtures
rather than inspected. The photo rebuild adds a Phase B group but rides well-understood
math and an already-proven architecture pattern. Everything else is broad-but-shallow
fan-out work.

### Phases

| Phase | Work | Shape |
|---|---|---|
| **A — Freeze the seams** | App scaffold + §0 boundary CI · registry · tool contracts · **schema v3 + JSON round-trip + first fixtures** · canvas foundation (Konva stage, SVG overlay, zoom/pan, rulers, pasteboard — with the §6.2 spike gates) · RTK store + gesture pipeline · dock, options bar, control panel rendering from the registry (both shape presentations; layout + photo modes) | **Serial.** Needs your review. The only real bottleneck. |
| **T0 — Text spike** (inside Phase A) | harfbuzzjs shaping + glyph-outline rendering proven on the store profile; composer interface frozen; evaluation font set chosen | Time-boxed; gates the text tranche |
| **B — Fan out** | Every tool and panel group, built against the frozen seams | **Parallel.** Disjoint surfaces, supervised and gated. |
| **T1–T3 — Text engine** (the long pole, runs through Phase B) | T1: shaped layout core + greedy H&J + contentEditable scaffold · T2: custom editing surface (caret/selection/IME from cluster maps) — **required before SME typography sign-off** · T3: full §3.3 kit surfaced (features, variable axes, drop caps, tabs/leaders, baseline grid) + optical-kerning decision | Its own track; golden-fixture-driven |

At the end of Phase A: **every tool visible in both docks with its complete option set
and written contract, nothing drawing yet** — the cheapest point to change your mind,
and a complete reviewable picture of the whole tool suite.

### Phase B groups

| Group | Delivers | Req |
|---|---|---|
| Selection & transform | Select, node select, marquee, move, 8-handle resize, rotate, snapping, smart guides; Transform + Align panels; group, lock, z-order | §2.1, §2.3, §5 |
| Shapes | Nine shape tools, pen and node editing, fill/stroke/gradient, Eyedropper, Effects | §4.3, §4.4 |
| Text surfaces | Frame + Link tools, Character/Paragraph/Styles panels (styles with inheritance + override indicator), overset & autofit, wrap controls — all riding T1–T3 | §3.1–3.6 |
| Images & photo | Picture tool, Crop tool, **Image adjust panel**, **photo mode** (dock, panels, mask interactions, compare, recipe history), **standalone image documents**, Resource manager *(link status LIVE; relink/package SURFACE)* | §4.1, §4.2, §4.5 |
| Document structure | Pages, spreads, mixed sizes, page rotation, masters, sections & numbering, trim/bleed/slug, guides & baseline grid | §1, §2.4, §2.5 |
| Tables & data | Table tool and panel (flagged: second-hardest item), cell operations, Merge field tool, data merge with record preview + sample sources | §7, §8 |
| Layers & colour | Layers panel with opacity/blend/lock/hide/non-printing; swatches, spot, CMYK | §2.2, §9.4 |
| Validation | Live design checker — incremental for cheap rules (overflow, safe zone, bleed shortfall, empty frames) from day one; batch for expensive rules; severity, click-to-navigate, click-to-fix | §10.1 |
| Output surfaces | Print preview, booklet, marks, PDF and image export **settings** — all SURFACE, incl. recipe replay and font-embedding seams | §9, §11 |
| Productivity | Find & replace incl. style-aware and pattern; spell-check interaction; templates, building blocks, themes; clipboard incl. paste special | §3.7, §6, §12 |
| Stretch | Footnotes, running headers, text variables, jump lines, cross-references — against the Phase A anchor model | §3.8 |

**Estimate:** Phase A days-scale; Phase B groups days each in parallel; **the text
engine realistically half the total build**; overall low-single-digit weeks, with T2
(custom editing) the item most likely to stretch — and the one least worth rushing,
since it gates the typography evaluation this model exists for.

---

## 8. Handoff bundle

The handoff **is the directory** — copied to the new repo, it builds and runs with no
other context. Inside it:

1. **The running application** — plus a self-contained offline build.
2. **`TOOL_CONTRACTS.md`** — generated from the registry: every tool, options with types
   and defaults, gesture clauses with ids and action types.
3. **`DOCUMENT_MODEL.md`** + JSON Schema — schema v3, the storage/rendering contract.
4. **`TEXT_ENGINE.md`** — the `PositionedGlyphRun` contract, composer behavior spec, and
   PDF-consumption notes (glyph ids → embedded subsets → `Tj`).
5. **`SEAMS.md`** — every SURFACE interface: what it's called with, what it returns,
   what the dev team owns — including recipe replay at export, model-service calls, and
   font embedding. Where the POC ships a working implementation of a seam's far side
   (jailed render, HEIC, ICC), the seam entry cites it as reference.
6. **`CAPABILITY_MAP.md`** — every requirement § mapped to surface, tier, and owner. The
   gap analysis §14 asks for. `.pub` import appears once: owner dev team, sequenced
   after toolset implementation.
7. **The test suite** — golden text-layout fixtures + Playwright keyed to clause ids.
8. **Redux DevTools** — replayable gesture history as living documentation.
9. **The review record** — exported checklist state + per-tool SME notes (§1).

---

## 9. Decisions

**Closed in v2.3:**

1. **Standalone, cleanly extractable** — `publisher-prototype/` is the future repo root;
   §0 boundary CI; the POC is reference-only.
2. **Photo toolset rebuilt in-app** — one engine, three shapes, one recipe vocabulary;
   photo/layout is a mode switch over shared state (§6.5).
3. **Fully client-side** — every process-boundary operation is a SURFACE seam (§6.7).

**Closed after v2.3 (recorded 2026-08-18, user-ratified):**

1. **Spread model — derived, with an override flag.** `doc.binding` plus
   `page.keepWithPrevious`; membership recomputed from page order, never stored (§6.8).
   Rejected: a stored `doc.spreads[]` array, which adds a second addressing scheme that
   must be kept in sync on every page operation.
2. **Mirrored margins — additive per-edge override.** The scalar `margin` stays the
   default; an optional `margins: { top, bottom, inside, outside }` wins where present
   (§6.6). Additive, so no version bump — the discipline already recorded in `SEAMS.md`.
   Rejected: deriving inside/outside at render time, which cannot express the wider
   inside margin that is the point of mirrored margins.

**Carried closed from v2.2:** Redux Toolkit · shaping-engine text with the
`PositionedGlyphRun` contract · shape presentation both ways behind a toggle · JSON
round-trip · authored seeded fixtures · publisher import out entirely (dev team, after
toolset implementation).

**Open, with defaults (proceeding as stated unless redirected):**

1. **Target repo** — name, org, and when to create it. Work proceeds in the directory on
   the current branch meanwhile; the move is mechanical (§0). Coupled decisions from
   §0.1: extraction mode (default: copy, no history) and whether the dev team gets POC
   read access (recorded in `SEAMS.md` either way).
2. **Design checker cadence** — default: live-incremental for cheap rules from day one,
   on-demand batch for expensive ones (§10.1 says live; this honors it without gating
   the canvas on color math).
3. **Optical kerning depth** — approximation slice vs SURFACE-with-interface; decided
   after T1 with real shaped text on screen (§6.4).
4. **Composer ambition** — greedy H&J (Publisher parity) is v1; Knuth-Plass multi-line
   composition is a named later slice. Confirm greedy is the right comparison baseline
   for your evaluation.
