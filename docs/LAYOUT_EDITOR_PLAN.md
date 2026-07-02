# Store Tools POC — Layout Editor Implementation Plan (Page Layout / Publisher Replacement)

**Scope of this plan:** the **freeform page-layout editor** — the suite's Microsoft Publisher replacement and its most-requested capability — mounted at `/layout` behind the homepage's **Layout** quick-jump card, built at the **same mid-fidelity as the design-handoff wires**.

The editor is explicitly **built over time**: the shell lands first, capability grows onto it in individually demoable steps, and not every feature is available immediately. Notably, the **Simple / Standard / Pro experience views arrive late in the sequence by design** — the editor ships Standard-only until step L8 (§4).

**Inputs reviewed:**

| Input | Where | Role |
|---|---|---|
| Layout-editor design handoff (README spec, runnable offline prototype, readable `.dc.html` source) | `docs/handoff/layout-editor/` | The design source of truth for the editor shell and its interaction model |
| Desktop Publishing Application design doc (Draft v0.1, "Project Compose") | `docs/Desktop_Publisher_Design_Doc.md` | Product context: target users, the novice→pro experience model (§3.3), capability targets (§4), explicit non-goals |
| Store Tools Suite implementation plan v0.1 | `docs/Store_Tools_Suite_Implementation_Plan.md` | Where this slice sits: Track B **custom-size layout/design core**, a Phase-2 vertical slice sequenced early for the **October 2026 Publisher retirement** |
| Store Tools POC implementation plan (steps 0–7, built) | `docs/IMPLEMENTATION_PLAN.md` | The shell this slice mounts into; `/layout` was reserved for it (§3.1, §6) |

---

## 1. Review findings

### 1.1 The handoff package is a complete at-rest spec — and an explicit growth roadmap

- The bundle's `README.md` fully specifies **one view** (the editor shell, blank Letter publication): 8 regions with exact geometry — title bar 40px · ribbon tab strip 32px · command band 92px · work-area row (tool palette 52px / pages pane 188px / rulers+canvas flex / inspector 268px) · status bar 28px — plus every control group, the design tokens, and the four-toggle state model (`ribbon`/`tool`/`insp`/`pages`), verified against the `class Component` logic in the `.dc.html` source.
- The prototype's interactivity is deliberately **synchronous UI toggles only**. Everything that makes it an *editor* is listed under "not yet wired (real editor must add)": object drag/resize, marquee select, snapping, zoom, page add/reorder, master apply, text entry & flow, undo/redo, shortcuts. The handoff also enumerates the **production state model** (document, selection, viewport, styles, history, catalog binding, experience level) — that section is effectively the schema brief for §3.4.
- The README instructs productionization, not pixel-copying: **fluid to the window** (the 1460×904 frame is prototype chrome), the mock's 428×554 page is a **not-to-scale proxy** ("production draws the true page at the current zoom"), rulers become unit- and zoom-aware, and hover states get added per the ~150ms-ease motion guidance.
- Adjacent surfaces are **out of scope by the handoff's own note**: the resize/rescale + N-up **imposition** tool and the **file-intake/quick-fix** utilities are specified separately.

### 1.2 Fit with the suite plan and the POC so far

- In the suite plan this is **Track B, "custom-size layout/design core"** — the Phase-2 slice called out (with the `.pub` on-ramp) as needing to reach a usable state **before associates lose Publisher in October 2026**. Building it immediately after the tracker (Track C) follows the plan's sequence.
- This POC remains a **UI/flow prototype, not a Phase-0 engine spike**. The suite plan reserves engine/build-vs-adopt decisions (render engine, text layout, color pipeline) for evidence-based spikes; nothing here pre-empts them. The durable artifact is the **document model and interaction flows**, not the renderer (§1.4).
- `docs/IMPLEMENTATION_PLAN.md` already reserved the mount point: quick-jump cards become sibling route groups (`/layout` among them), and the **persistent suite header rides along** — so Give feedback + the notification bell stay reachable inside the editor, satisfying the tracker's "one shared surface" requirement without new work.
- The homepage's other intake affordances stay honest placeholders: the **size tiles** (Letter/Legal/Ledger/Custom) become real deep links into this editor (step L3); the **`.pub` callout** belongs to the separate `.pub` on-ramp slice and remains inert.

### 1.3 What the design doc adds — and which of its capabilities live here

The design doc frames the product this editor is the heart of: a Publisher replacement benchmarked against Affinity Publisher, for in-store associates spanning 20-year Publisher veterans to novices (§3.1), with a **single document model under multiple experience layers** (§3.3). Capability disposition for this plan:

| Design-doc capability | Disposition |
|---|---|
| §4.1 Multi-page docs, master pages, custom sizes, bleed/margins as first-class properties | **This plan** (L3, L6) |
| §4.2 Rulers, guides, snapping, smart alignment, distribution | **This plan** (L1, L3, L7) |
| §4.3 Frame text, paragraph basics, minimal styles | **This plan** (L5) — threading/autoflow, text wrap, OpenType/variable fonts deferred |
| §3.3 Simple / Standard / Pro experience layers | **This plan, deliberately last** (L8) — control visible from day one, Standard-only until then |
| §4.5 Image frames with placeholder frames | **This plan** (L4, placeholder frames only; real image import deferred) |
| §4.4 Tables · §4.5 pen/Bézier/booleans/effects · §4.6 CMYK/spot/preflight · §4.7 data merge | **Deferred** (§6) — print production and VDP are separate suite slices |
| §5.1 `.pub` import | **Separate Track B slice** (`.pub` on-ramp); this editor eventually just opens its output |
| §3.3 AI-assisted creation & help | **Deferred** — the AI-assist layer is a suite-wide backbone service |
| §4.1 Sections, facing pages/spreads, mixed page sizes | **Deferred** (§6) |

### 1.4 Technical approach: DOM-rendered canvas, engine-agnostic document model

**Recommendation: render the page and its objects as absolutely-positioned DOM/SVG inside a scaled page surface — no canvas engine for this POC.**

- The wires are specified entirely in CSS terms (dashed outlines, inset guides, gradient ruler ticks); DOM keeps fidelity trivial and hover/selection chrome free.
- Text editing stays native (`contentEditable` overlay) instead of the overlay gymnastics a canvas engine forces.
- POC documents hold tens of objects, far below DOM performance limits on the store hardware profile.
- The **document model is the durable artifact**: pure data (Zod schemas, geometry in inches, zero DOM coupling). If a later slice needs canvas/WebGL rendering (the sibling AI Design Studio's Konva/react-konva stack is the known alternate), that's a render-layer swap behind the same model and store — components above the canvas untouched.
- `@dnd-kit` (deferred in the tracker plan for "canvas/editor slices") turns out unnecessary here: canvas dragging is pointer math against the scaled surface, not sortable-list DnD. **No new runtime dependencies** for this whole plan.

---

## 2. What we're building (fidelity contract)

**Mid-fidelity wireframe, faithfully** — the same contract as the tracker build:

- **Follow exactly:** the information architecture, region layout and fixed dimensions, control grouping, the exact copy, the four prototype toggles, and the active-state patterns (red 2px underline on tabs, red ring + faint fill on tools/thumbnails, white pill on segmented controls).
- **Reproduce as-is:** the grayscale wireframe styling — chrome grays, Staples red `#CC0000` for actions/active/selected, guide blue `#9fb6df`, bleed red-brown `#b58686`. We match the wires, not the production Staples design system.
- **Handoff-sanctioned productionizations** (the README asks for these; they are not deviations): fluid work area with the canvas absorbing extra space; the page drawn at **true scale for the current zoom** (replacing the mock's 428×554 proxy); zoom-tracking rulers; hover states (~150ms ease, no spring); status-bar tool label tracking the active tool.
- **Deliberate deviations (4):**
  1. **The suite header stays** above the editor (the "one shared surface" requirement — Give feedback + bell must work everywhere). The editor's title bar therefore drops the wire's duplicated Staples chip, store label, and decorative window controls (`— ▢ ✕` are native-app chrome), and gains a **← Back** affordance at its left edge (the tracker sub-bar's pattern). If demos ever want the full-screen wire look, an "immersive" toggle that hides the suite header is a cheap later add.
  2. **Desktop-minimum gate:** below `lg` the editor shows an honest "this tool needs a bigger screen" card instead of reflowing. The suite's responsive pass reflows every *browsing* surface to phone; a precision layout canvas is a station tool and a broken squeeze would be worse than a gate.
  3. **Simple / Pro segments render but are disabled** (muted, tooltip "Coming later in the beta") until step L8 — per the built-over-time direction. Standard shows active from day one, matching the mock.
  4. A small **"Reset demo document"** affordance at the status bar's right edge — a non-wire demo control, same pattern as the tracker's "Reset demo data".
- **Static-by-design (as in the mock, until their slices land):** the File / Arrange / View / Help ribbon tabs; Find/Replace and Hyperlink controls; the font-color swatch; the status bar's two-page-spread toggle; the Page tab's "Choose a product" catalog link.

---

## 3. Application architecture

### 3.1 Route & chrome integration

| Route | Surface | Notes |
|---|---|---|
| `/layout` | The layout editor | `src/app/layout/page.tsx` — a route segment folder, distinct from the root `src/app/layout.tsx` file (worth a comment; Next.js is fine with it) |

- The homepage **Layout** quick-jump card becomes a `Link` to `/layout` — the first quick-jump card with a real destination. The size tiles deep-link with a preset (`/layout?preset=legal`, `?custom=1`) in L3.
- The editor fills the viewport under the 52px suite header (`100dvh − 52px`), owning its internal layout as a vertical flex: title bar 40 · tab strip 32 · command band 92 · work area `flex-1` · status bar 28. Every fixed region is `shrink-0`; the editor never scrolls the document body.
- Work-area row: tool palette 52 · pages pane 188 · canvas `flex-1 min-w-0` · inspector 268, separators per the wire.
- **Overlay coexistence:** the report modal, notifications dropdown, and celebrate moment already render from the root layout and must open over the editor. The root `EscapeCloser` owns Escape for overlays; the editor's own Escape handling (deselect, exit text editing) checks the feedback store first and yields when any overlay is open.

### 3.2 Component map (mirrors the wire's numbered anatomy)

```
src/app/layout/page.tsx              // mounts <LayoutEditor /> (client-only surface)
src/components/layout-editor/
  EditorShell.tsx                    // vertical frame, work-area row, min-width gate
  TitleBar.tsx                       // back link · doc name (editable) · size hint ·
                                     // Simple/Standard/Pro segmented · help glyph
  ribbon/
    RibbonTabs.tsx                   // File(static) Home Insert Layout Text + muted rest
    RibbonGroup.tsx                  // [controls row] + [9.5px label] + right divider
    HomeBand.tsx  InsertBand.tsx  LayoutBand.tsx  TextBand.tsx
  palette/ToolPalette.tsx            // 9 tools, dividers, red active ring
  pages/
    PagesPane.tsx                    // PAGES header + Pages/Masters segmented
    PageThumb.tsx MasterThumb.tsx    // live mini-renders (L6); AddPageTile
  canvas/
    CanvasViewport.tsx               // rulers + corner box, pasteboard, caption,
                                     // guide legend, zoom/pan handling
    PageSurface.tsx                  // true-scale page: bleed outline, corner marks,
                                     // margin box, center/column guides
    ObjectNode.tsx                   // rect / ellipse / line / picture / text renderers
    SelectionOverlay.tsx             // selection frames, 8 handles, marquee, snap lines
    TextEditOverlay.tsx              // contentEditable editing layer (L5)
  inspector/
    Inspector.tsx                    // 4-tab strip (Properties · Text · Align · Page)
    PropertiesTab.tsx TextTab.tsx AlignTab.tsx PageTab.tsx
    Field.tsx                        // 10px label + 30px input row, unit-aware numeric
  StatusBar.tsx                      // page nav · tool status · view buttons · zoom · reset
src/lib/layout/
  presets.ts                         // page-size presets (Letter, Legal, Ledger/Tabloid…)
  geometry.ts                        // in↔px, fit-zoom, handle/nudge math
  snap.ts                            // snap candidates: margins, centers, columns, objects
  arrange.ts                         // align / distribute / z-order operations
  text.ts                            // overflow measurement helper
src/lib/schema/layout.ts             // LayoutDocument, Page, MasterPage, LayoutObject
src/lib/store/layout-store.ts        // Zustand + persist("stp-layout-v1") + history
```

### 3.3 State (one new Zustand store, separate from the feedback store)

Prototype UI-state names are kept verbatim so the `.dc.html` source stays a usable reference: `ribbon: home*`, `tool: select*`, `insp: page*`, `pages: pages*` (defaults starred, as in the mock).

Production state per the handoff's own list:

- **Document** (persisted): `doc` — the `LayoutDocument` below; `activePageId`; `masterEditingId: string | null` (non-null = canvas edits that master).
- **Selection** (session): `selectedIds: string[]`, `editingTextId: string | null` — drives the Properties/Text tabs exactly as the handoff describes ("populates when an object is selected").
- **Viewport** (session, except zoom prefs): `zoom` (0.1–4, default = fit), `pan {x,y}`, `guidesVisible`. Unit is fixed to inches for now (§7.7).
- **History** (session): bounded snapshot stacks (`past`/`future`, cap 50) of the document slice, pushed **once per completed gesture** (pointer-up, input commit) — never per pointer-move. `undo()` / `redo()`.
- **Experience** (persisted): `level: 'simple' | 'standard' | 'pro'` — `'standard'` until L8 enables switching. Surface-only; never mutates the file (design doc §3.3's hard rule).
- **Actions** grouped by domain: page setup (`setPageSize/setOrientation/setBleed/setMargin/setColumns`), objects (`addObject/transformObject/setObjectProps/deleteSelection/duplicateSelection/reorder`), text (`setTextContent/setTextProps`), pages & masters (`addPage/selectPage/removePage/applyMaster/addMaster`), selection, viewport, history, `resetDoc()`.

Persistence: `localStorage` key **`stp-layout-v1`** (versioned, own key beside the tracker's `stp-feedback-v1`), storing `doc` + experience level. Selection, history, and viewport stay session-scoped.

### 3.4 Document model (Zod, engine-agnostic, inches)

```ts
LayoutDocument: { version: 1, name: string,               // "Untitled publication"
                  product: null | { sku: string; label: string },   // null = "Custom size — not bound to a SKU"
                  size: { w: number; h: number },          // inches; Letter 8.5×11 default
                  orientation: 'portrait' | 'landscape',
                  bleed: number, margin: number,           // 0.125 / 0.5 defaults per wire
                  columns: number,                         // 1 default; guides derive from it
                  pages: Page[], masters: MasterPage[] }
Page:       { id, masterId: string | null, objects: LayoutObject[] }
MasterPage: { id, label: string, objects: LayoutObject[] }         // seed: "A" (applied), "B" (blank)
LayoutObject =
  | Frame:  { id, type: 'rect'|'ellipse'|'picture'|'text',
              x, y, w, h, rotation: number,               // rotation in schema now, editing UI later
              locked: boolean,
              fill: string | null, stroke: { color: string; width: number } | null,
              // type === 'text' only:
              text?: { content: string,
                       font: { family, size, bold, italic, underline },
                       align: 'left'|'center'|'right'|'justify', lineSpacing: number } }
  | Line:   { id, type: 'line', x1, y1, x2, y2, stroke: { color; width } }
```

All geometry is **canonical inches** (every wire label is inch-denominated); z-order is array order. Page size is document-level — per-page mixed sizes are a design-doc §4.1 target, deferred (§6). Rich per-run text styling is deferred; text props are per-frame for the POC.

### 3.5 Geometry, zoom & rendering

- `px = inches × 96 × zoom`. `PageSurface` is a positioned element of that size; objects position absolutely inside it; a single scale factor flows down via context.
- **Default zoom = fit** (~85% of the canvas area for the page + bleed), recomputed when the page size changes; range 10–400%. Adjust via the status-bar slider and ± buttons, the Zoom tool (click = in, Alt-click = out), and Ctrl/Cmd+scroll. Move/Pan tool drags the pasteboard.
- **Rulers** track zoom and pan: ticks every 1/8 in, heavier every 1 in (numbered when spacing permits), origin locked to the page's top-left corner. The mock's `repeating-linear-gradient` ticks are the L1 static stand-in; L3 replaces them with the real scale.
- Bleed = dashed outline offset by `bleed × scale`; margin box inset by `margin × scale`; center guides and column guides derive from the model — all in the wire's colors and dash patterns, including the four bleed corner marks and the bottom-right guide legend.

### 3.6 Design-token additions

Small additive set in `globals.css` `@theme` (wire values, per the handoff token tables): pasteboard `#d3d3d3`, guide blue `#9fb6df`, bleed-mark `#b58686`, and the editor chrome grays that recur (title/tab strip `#f0f0f0`, band `#f7f7f7`, palette `#f4f4f4`, rulers `#ededed`, status `#ececec`). One-off borders stay inline as arbitrary values, matching the codebase's convention. No new keyframes — editor motion is hover/active easing only (~150ms), per the handoff.

---

## 4. Build order (grown over time, each step demoable)

Principle: **shell first, then the document model, then editing capability** — vertical steps, one commit each, the app runnable and demoable after every one. "Available after" states what an associate can newly do.

| Step | Lands | Newly available |
|---|---|---|
| L1 | Shell: frame, chrome, Home band | Editor opens from the Layout card; chrome navigable |
| L2 | Shell: all bands, tabs, panes | Full parity with the offline prototype's toggles |
| L3 | Document model + true-scale page | Real page setup: any size incl. custom; zoom/pan; persistence |
| L4 | Objects: draw, select, transform | Shape/frame layout with mouse + numeric precision; undo/redo |
| L5 | Text frames & typography | "Make a sign": styled text on the right page size |
| L6 | Multi-page & masters | Multi-page pubs with shared master furniture |
| L7 | Multi-select, align & snapping | Measurement-driven precision layout |
| L8 | Simple / Standard / Pro | The experience-level model, surface-only |
| L9 | Hardening & ship shape | Full e2e + README demo script |

### L1 — Editor shell: frame, chrome & Home band
Route + desktop gate; the **Layout card wired** (first real quick-jump destination); title bar per deviation #1 (back link, doc name, size hint, experience segmented — Standard active, Simple/Pro disabled, help glyph); ribbon tab strip with working active-tab logic + the **Home** band (static controls); tool palette with single-select red ring and the status-bar tool label; pages pane (Pages view, static thumbs); rulers (static ticks), pasteboard, page proxy with bleed/margin/guides/corner marks/legend/caption; inspector frame + **Page** tab body (static); status bar.
*Done when:* side-by-side faithful to `Layout Editor (offline).html` at 1440; tool selection and ribbon-tab switching work; e2e opens the editor from the homepage card.

### L2 — Shell completion: every band, tab & pane
**Insert / Layout / Text** command bands; inspector **Properties** (empty state + disabled Transform), **Text**, **Align** bodies; **Master pages** pane view (A · applied, B · blank, + New master affordance); all segmented toggles.
*Done when:* every ribbon tab, inspector tab, and the Pages/Masters toggle matches the prototype click-for-click — full at-rest parity.

### L3 — Document model & the true-scale page
Schemas + layout store + persistence (`stp-layout-v1`) + reset affordance. The page renders at **true scale** with fit-zoom on mount; zoom slider/±/%/Zoom tool/Pan tool live; rulers become real (zoom- and pan-tracking, inch-numbered). The **Page inspector tab and Layout ribbon band go live**: size presets, W/H inputs (custom sizes — including large-format beyond the old tooling ceiling), orientation, bleed, margin, columns count + Guides toggle (column guides render). Title-bar name (now editable) + size hint and the pasteboard caption reflect the model. **Home deep links:** size tiles → `/layout?preset=…`, Custom tile → `/layout?custom=1` (opens with the Page tab focused).
*Done when:* size/orientation/bleed/margin/columns changes reflect live in page, guides, captions, and hint; unit tests cover geometry + fit + presets; deep links create the right document; reload restores it.

### L4 — Objects: draw, select, transform
Rect/Ellipse/Line/Picture tools **draw-to-create** (drag on canvas; Picture creates a gray placeholder frame per §4.5 — real image import deferred); tool auto-returns to Select after a draw (Publisher behavior); Insert band's Text box/Picture buttons arm the matching tools. **Select tool:** click-select, drag-move, 8-handle resize (Shift = preserve aspect), line-endpoint handles. **Properties tab populates**: Transform X/Y/W/H round-trip, plus minimal Fill and Stroke rows (the tab's own empty-state copy promises "position, size, fill, and stroke"; palette = grayscale ramp + brand red + none, staying inside the wireframe language). Keyboard: Delete/Backspace, Cmd/Ctrl+D duplicate, arrow nudge 1/32 in (Shift ×10), Cmd/Ctrl+Z / Shift+Z **undo/redo** (per-gesture snapshots), Cmd/Ctrl+]/[ z-order, Esc deselect (overlay-aware per §3.1). Status bar tracks tool + selection ("Rectangle tool · drag to draw", "Select tool · 2 objects"). Selecting the Table tool sets an honest status: "Table tool · coming later in the beta."
*Done when:* draw → move → resize → numeric-edit → undo chain is solid and persists; reducer + undo invariants unit-tested; e2e covers the chain.

### L5 — Text frames & typography
Text tool draws a text frame; **double-click to edit** (contentEditable overlay at current zoom); Home band **Font/Paragraph groups**, the **Text band**, and the **Text inspector tab** go live against the selection: curated family list (system faces until Motiva licensing, §7.6), size, B/I/U, alignment L/C/R/J, line spacing. **Overflow indicator** (red badge at the frame's bottom edge) when content exceeds the frame — the print-tool-authentic cue. Minimal **styles**: "Body · Normal" and "Heading" apply preset bundles ("+ New" stays static; a real style registry with propagation is deferred).
*Done when:* the novice use case works end-to-end — a promo sign with a styled headline and body text on a custom-size page; typing/styling/overflow/undo/persist all hold; e2e makes the sign.

### L6 — Multi-page & masters
**Add page** (pages-pane tile + Insert band); **live thumbnails** (mini-render of each page's model, red active border); page select/switch; remove; status-bar **page nav** (◀ Page N of M ▶) live. **Masters:** seed A (applied) / B (blank); master objects render beneath page objects (non-selectable from a page); **apply master** per page; **edit a master** via the Masters segment (canvas banner indicates master-editing mode); "+ New master" creates a blank.
*Done when:* thumbnails track edits; master edits propagate to every applied page; nav/undo/persistence hold; page/master ops unit-tested.

### L7 — Multi-select, align & snapping
Shift-click + **marquee** multi-select, group drag. **Align inspector tab live**: 6 align buttons, Distribute H/V, "Relative to" Page/Selection. **Snapping** during draw/drag/resize: page margins, page centers, column guides, and other objects' edges/centers, with wire-colored smart guide lines; the Layout band's Guides toggle governs column guides and their snap targets.
*Done when:* snap/align/distribute math is unit-tested; smart guides appear and clear correctly; e2e aligns two objects and verifies geometry.

### L8 — Experience levels: Simple / Standard / Pro (the deferred views arrive)
The title-bar segmented control goes fully live, **surface-only** per design doc §3.3 — switching never touches the file, and everything stays reachable (progressive disclosure, nothing permanently hidden):
- **Standard** — the wire as built (the default all previous steps shipped).
- **Simple** — curated, task-first surface: palette trimmed to Select/Text/Picture; Home band reduced to Font/Paragraph with a "More options" affordance that expands the rest; Insert band reduced to Text box/Picture/Add page; inspector auto-follows selection (Properties on select, Text while editing, Page otherwise).
- **Pro** — everything Standard exposes, always-dense: full palette and bands (Arrange/View tabs stay static — their slices haven't landed), no simplification affordances.
Level persists per station.
*Done when:* switching reflows the chrome instantly without mutating the document (assert doc-equality in tests); e2e sanity-checks each level's surface.

### L9 — Hardening & ship shape
Full **Playwright pass** as the demo script: home → Layout card → pick/custom size → draw shapes → styled text → add page + master → align/snap → reload persists → reset. Cross-surface polish against the offline prototype; a11y pass on the chrome (focus order, `aria-pressed` on toggles, keyboard reachability); drag-performance sanity on a modest machine; README update (run/demo/where the docs live).
*Done when:* e2e green; `docker run` still serves the whole POC; the README demo script lets a teammate demo the editor cold.

**Commit cadence:** one commit per step, each leaving the branch demoable — same convention as the tracker build.

---

## 5. Testing strategy

- **Unit (Vitest, colocated):** geometry (in↔px at zoom, fit-zoom, nudge math); preset table; snap-candidate detection and priority; align/distribute/z-order ops; object reducers (add/transform/props/duplicate/delete); undo/redo invariants (bounded, per-gesture, redo cleared on new edit); page/master operations incl. master propagation; overflow measurement; experience-level switching leaves the document byte-identical.
- **E2E (Playwright, extending `e2e/smoke.spec.ts` patterns):** the L9 demo flows, accumulated step by step — they double as the stakeholder demo script, exactly as the tracker's do.
- **Fidelity checks (manual):** side-by-side with `docs/handoff/layout-editor/Layout Editor (offline).html` per step — it runs in any browser and is the behavioral source of truth for the shell.

---

## 6. Deferred backlog (how the editor keeps growing)

Explicitly **not** in L1–L9, with where each lands later — the affordances stay visible-but-static per the wire so the ceiling reads as reachable:

| Capability | Lands | Notes |
|---|---|---|
| Linked text frames, autoflow, story threading; text wrap | Editor, next tranche | Text band's "Link boxes ⟶ / Wrap" controls exist, stay static; the model's per-frame text is forward-compatible |
| Tables | Editor, next tranche | Palette + Insert buttons present; status-bar "coming later in the beta" until then |
| Rotation editing, groups, layers panel, effects | Editor, next tranche | `rotation` already in schema; Arrange ribbon tab is the natural home |
| Real picture import + asset storage | With the intake slice | IndexedDB deferral carried over from the tracker plan |
| Open/save/export, File tab, PDF & preflight | Print-production slice | Suite plan §8.7/§8.12 backbone; editor gains "Export" once the spine exists in the POC |
| Catalog SKU binding ("born correct") | Catalog/spec-sync slice `[INT]` | Page tab's Product card + "Choose a product →" link render now, act later; ties to the homepage product grid |
| `.pub` import | `.pub` on-ramp slice | Homepage callout already points there; its output opens as a `LayoutDocument` |
| Facing pages/spreads, sections, mixed page sizes | Editor, later | Status bar's spread toggle stays static until then |
| Data merge / VDP · AI-assisted creation & help | Their own suite slices | Design doc §4.7 / §3.3; AI assist is a suite-wide service |
| Publisher-familiar shortcut map, savable workspaces | With experience-model deepening | A basic shortcut set ships in L4; the full veteran map is a deliberate later pass |
| Unit toggle (in/mm/px/pt), guides dragged from rulers | Editor, later | Geometry helpers are unit-ready; ruler-drag guides slot into `snap.ts` |

---

## 7. Open questions / assumptions (proceeding with the recommendation unless redirected)

1. **Suite header + editor title bar** — keeping the persistent suite header and de-duplicating the editor title bar (deviation #1). An "immersive" full-screen toggle is a cheap later add if demos want the exact wire frame.
2. **DOM/SVG rendering** for the POC (§1.4); the suite's real engine choice stays with Phase-0 spikes. react-konva is the known fallback if a future slice's object counts demand it — a render-layer swap behind the same model.
3. **Single working document**, autosaved to `stp-layout-v1`; opening a new size from Home replaces it (with a confirm when the current doc has content). Multi-document / open / save-as is backlog.
4. **Desktop-minimum gate** below `lg` rather than a phone reflow — a precision canvas is a station tool; the gate card keeps small screens honest.
5. **Simple/Pro disabled until L8** — per the built-over-time direction; the control renders from L1 so the title bar matches the wire.
6. **Fonts** — system stack + a curated family list until Motiva Sans licensing is confirmed (same posture as `public/fonts/README`).
7. **Inches only** at first; the unit toggle is handoff-mentioned and cheap to add later because all geometry is canonical-inches behind helpers.

---

*This plan grows the POC's second product surface onto the shell the tracker build established: same stack, same fidelity contract, same step-per-commit rhythm — and it keeps the suite plan's sequencing promise that the layout core is field-demoable well ahead of the October 2026 Publisher retirement.*
