# Store Tools POC — Layout Editor Implementation Plan (Page Layout / Publisher Replacement)

**Scope of this plan:** the **freeform page-layout editor** — the suite's Microsoft Publisher replacement and its most-requested capability — mounted at `/layout` behind the homepage's **Layout** quick-jump card, built at the **same mid-fidelity as the design-handoff wires**.

The editor is explicitly **built over time**: the shell lands first, capability grows onto it in individually demoable steps, and not every feature is available immediately. Notably, the **Simple / Standard experience views arrive late in the sequence by design** — the editor ships Standard-only until step L14 (§4).

**Revision (v1.1):** this plan now carries the technical design for the *functional* editor beyond the POC — a **Konva (Canvas 2D) render layer** (§8), the **document-model v2 deltas** it and import require (§9), the **`.pub` import & conversion pipeline** built on `libmspub` per `PUB_TO_IDML_RESEARCH.md` (§10), and the **K-/P-tranche build order** that grows both onto the L1–L9 POC (§11). L1–L9 are unchanged: the POC still ships DOM/SVG-rendered; the Konva swap and the `.pub` on-ramp are the tranches that make it a complete, functional Publisher replacement.

**Revision (v1.2):** §10.1 now records the agreed **POC security posture** for the import pipeline. This is a *fully functional POC, not a production deployment*, and the threat model scales with what's wired in — so the security doc's controls split into **POC-enforced** (built in P1, tested in P5) vs. **production-deferred with recorded accepted risk**. The same section picks up the Debian-slim base-image requirement and a no-binary **fixture mode** for dev/CI.

**Revision (v1.3):** two scope changes from build-along review. (1) The experience model narrows to **two levels — Simple and Standard**; Pro is dropped (Standard is already the everything-visible surface, so the third tier added nothing; the disabled Pro segment leaves the title bar). (2) A user-directed toolset step lands **before** the levels as the new **L8**: the pages pane becomes a **collapsible side panel with vertical Pages / Assets / Layers tabs** — asset upload/import (images + PDFs; §9's asset model pulled forward *additively* into v1), click-to-place pictures, and a z-order layers list with drag-reorder — plus a **canvas declutter** (the name/size/zoom caption above the page and the bleed corner marks are removed). The old L8/L9 renumber to **L9/L10**; §6, §9, and §11 references are updated in place.

**Revision (v1.4):** the pre-Simple **toolset build-out** is planned as five user-directed steps, **L9–L13**, pulled from the §6 backlog with interaction updates: **L9** reworks picture import around the frame (the Picture tool draws an image box; clicking an empty box opens the device file picker; assets drag from the panel into any visible image container), **L10** rotation editing + a live Arrange tab, **L11** ruler-dragged guides + a unit toggle (in/mm/px/pt), **L12** facing-page spreads + per-page size overrides (§9's `sizeOverride` pulled forward), **L13** copy/cut/paste with keyboard shortcuts. Experience levels and hardening renumber to **L14/L15**. Each step stays independently demoable, one commit each; §6 and §9 rows are updated in place.

**Revision (v1.5, 2026-07-05):** pre-UAT pipeline updates, driven by the Publisher-import proof point. (1) **The P-tranche is cleared to lead the K-tranche.** Import correctness (parse → map → place) is render-agnostic by construction — the document model is the contract — so P1–P4 may run against the POC's DOM render to hit the import proof point now; a converted document that exceeds the DOM comfort zone (~150 objects on a page) gets an honest perf note in the import report rather than a blocked import. The K-tranche remains the **performance gate before import-heavy documents go to field UAT**, and §8.1's spike numbers still decide the engine with evidence — the sequencing changes, the gates don't. (2) **§10.5 (new; acceptance & testing renumbers to §10.6)** turns §10.4's remap-and-report posture into a concrete **font library & mapping plan**: a self-hosted open-license (Google Fonts) library with metric-compatible mappings for the Publisher-era core faces, lazy per-document loading, and measurement gated on font load. (3) The **customer proof station** is planned as a sibling slice in `docs/CUSTOMER_PROOF_STATION_PLAN.md` — it consumes this editor's documents (and, later, the §8.6 server render) but adds no editor scope; it shares §10.1's server-seam posture. (4) **§10.7 (new)** makes the prototype rules' swappable-backend requirement explicit **P1 acceptance criteria**: one-file subprocess seam, store-action entry, shared asset seam, STUBS registration — the POC import service must be replaceable by the production conversion service without touching the editor.

**Inputs reviewed:**

| Input | Where | Role |
|---|---|---|
| Layout-editor design handoff (README spec, runnable offline prototype, readable `.dc.html` source) | `docs/handoff/layout-editor/` | The design source of truth for the editor shell and its interaction model |
| Desktop Publishing Application design doc (Draft v0.1, "Project Compose") | `docs/Desktop_Publisher_Design_Doc.md` | Product context: target users, the novice→pro experience model (§3.3), capability targets (§4), explicit non-goals |
| Store Tools Suite implementation plan v0.1 | `docs/Store_Tools_Suite_Implementation_Plan.md` | Where this slice sits: Track B **custom-size layout/design core**, a Phase-2 vertical slice sequenced early for the **October 2026 Publisher retirement** |
| Store Tools POC implementation plan (steps 0–7, built) | `docs/IMPLEMENTATION_PLAN.md` | The shell this slice mounts into; `/layout` was reserved for it (§3.1, §6) |
| `.pub → IDML` converter research | `docs/PUB_TO_IDML_RESEARCH.md` | The parse/convert architecture §10 builds on: `libmspub` front end, intermediate layout model, conformance checklist |
| Security considerations & threat model | `docs/SECURITY_CONSIDERATIONS.md` | The controls the import pipeline must satisfy — `libmspub` is flagged **[CRITICAL]** (undocumented C++ binary parser); §10.1 inherits its checklist |

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
| §3.3 experience layers (two levels since v1.3: Simple / Standard) | **This plan, deliberately last** (L14) — control visible from day one, Standard-only until then |
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
- The **document model is the durable artifact**: pure data (Zod schemas, geometry in inches, zero DOM coupling). The functional editor exercises exactly this bet: §8 specifies the **react-konva render layer** that replaces the DOM canvas behind the same model and store — components above the canvas untouched. The POC's DOM render is the L1–L15 vehicle; the Konva layer is the K-tranche (§11).
- `@dnd-kit` (deferred in the tracker plan for "canvas/editor slices") turns out unnecessary here: canvas dragging is pointer math against the scaled surface, not sortable-list DnD. **No new runtime dependencies** for this whole plan.

---

## 2. What we're building (fidelity contract)

**Mid-fidelity wireframe, faithfully** — the same contract as the tracker build:

- **Follow exactly:** the information architecture, region layout and fixed dimensions, control grouping, the exact copy, the four prototype toggles, and the active-state patterns (red 2px underline on tabs, red ring + faint fill on tools/thumbnails, white pill on segmented controls).
- **Reproduce as-is:** the grayscale wireframe styling — chrome grays, Staples red `#CC0000` for actions/active/selected, guide blue `#9fb6df`, bleed red-brown `#b58686`. We match the wires, not the production Staples design system.
- **Handoff-sanctioned productionizations** (the README asks for these; they are not deviations): fluid work area with the canvas absorbing extra space; the page drawn at **true scale for the current zoom** (replacing the mock's 428×554 proxy); zoom-tracking rulers; hover states (~150ms ease, no spring); status-bar tool label tracking the active tool.
- **Deliberate deviations (5):**
  1. **The suite header stays** above the editor (the "one shared surface" requirement — Give feedback + bell must work everywhere). The editor's title bar therefore drops the wire's duplicated Staples chip, store label, and decorative window controls (`— ▢ ✕` are native-app chrome), and gains a **← Back** affordance at its left edge (the tracker sub-bar's pattern). If demos ever want the full-screen wire look, an "immersive" toggle that hides the suite header is a cheap later add.
  2. **Desktop-minimum gate:** below `lg` the editor shows an honest "this tool needs a bigger screen" card instead of reflowing. The suite's responsive pass reflows every *browsing* surface to phone; a precision layout canvas is a station tool and a broken squeeze would be worse than a gate.
  3. **The Simple segment renders but is disabled** (muted, tooltip "Coming later in the beta") until step L14 — per the built-over-time direction. Standard shows active from day one, matching the mock. (Pro rendered the same way until v1.3 dropped the third level; its segment came out in L8.)
  4. A small **"Reset demo document"** affordance at the status bar's right edge — a non-wire demo control, same pattern as the tracker's "Reset demo data".
  5. **Single-row command bands** (user-directed, post-L8): each ribbon group lays its controls in **one row** — the wire's stacked clusters (the big Paste tile, the Cut/Copy column, two-row Font/Paragraph) flatten to uniform inline controls — with the section dividers kept but the **9.5px section titles dropped** (Clipboard/Font/… are self-explanatory; the name survives as each group's `aria-label`); controls **wrap within their section** as the viewport narrows, so the band grows down instead of clipping (band height becomes auto, min 64px, replacing the wire's fixed 92px).
- **Static-by-design (as in the mock, until their slices land):** the File / View / Help ribbon tabs (**Arrange goes live in L10**); Find/Replace and Hyperlink controls; the font-color swatch; the Clipboard pills (**live in L13**); the status bar's two-page-spread toggle (**live in L12**); the Page tab's "Choose a product" catalog link.

---

## 3. Application architecture

### 3.1 Route & chrome integration

| Route | Surface | Notes |
|---|---|---|
| `/layout` | The layout editor | `src/app/layout/page.tsx` — a route segment folder, distinct from the root `src/app/layout.tsx` file (worth a comment; Next.js is fine with it) |

- The homepage **Layout** quick-jump card becomes a `Link` to `/layout` — the first quick-jump card with a real destination. The size tiles deep-link with a preset (`/layout?preset=legal`, `?custom=1`) in L3.
- The editor fills the viewport under the 52px suite header (`100dvh − 52px`), owning its internal layout as a vertical flex: title bar 40 · tab strip 32 · command band auto-height (min 64, single-row wrapping sections per deviation #5) · work area `flex-1` · status bar 28. Every fixed region is `shrink-0`; the editor never scrolls the document body.
- Work-area row: tool palette 52 · pages pane 188 · canvas `flex-1 min-w-0` · inspector 268, separators per the wire.
- **Overlay coexistence:** the report modal, notifications dropdown, and celebrate moment already render from the root layout and must open over the editor. The root `EscapeCloser` owns Escape for overlays; the editor's own Escape handling (deselect, exit text editing) checks the feedback store first and yields when any overlay is open.

### 3.2 Component map (mirrors the wire's numbered anatomy)

```
src/app/layout/page.tsx              // mounts <LayoutEditor /> (client-only surface)
src/components/layout-editor/
  EditorShell.tsx                    // vertical frame, work-area row, min-width gate
  TitleBar.tsx                       // back link · doc name (editable) · size hint ·
                                     // Simple/Standard segmented (v1.3) · help glyph
  ribbon/
    RibbonTabs.tsx                   // File(static) Home Insert Layout Text + muted rest
    RibbonGroup.tsx                  // [controls row] + [9.5px label] + right divider
    HomeBand.tsx  InsertBand.tsx  LayoutBand.tsx  TextBand.tsx
  palette/ToolPalette.tsx            // 9 tools, dividers, red active ring
  panel/
    SidePanel.tsx                    // collapsible panel + vertical Pages/Assets/Layers tabs (L8)
    AssetsPane.tsx LayersPane.tsx    // asset library + z-order list (L8)
  pages/
    PagesPane.tsx                    // Pages/Masters segmented + lists (a SidePanel tab since L8)
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
- **Experience** (persisted): `level: 'simple' | 'standard'` (v1.3 dropped `'pro'`; legacy persisted values coerce to `'standard'`) — `'standard'` until L14 enables switching. Surface-only; never mutates the file (design doc §3.3's hard rule).
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
| L8 | Side panel: Assets & Layers | Import images/PDFs and place them; drag-reorder z-order; decluttered canvas |
| L9 | Pictures: fill-on-click & drag-in | Click an empty image box to pick a device file; drag assets from the panel into any frame |
| L10 | Rotation & Arrange | Rotate handle + numeric field; the Arrange tab goes live (z-order, rotate 90°, align) |
| L11 | Guides & units | Ruler-dragged snap guides; in/mm/px/pt display everywhere |
| L12 | Spreads & mixed sizes | Two-page spread view; per-page size override |
| L13 | Clipboard | Copy / Cut / Paste with keyboard shortcuts; ribbon pills go live |
| L14 | Simple / Standard | The two-level experience model, surface-only |
| L15 | Hardening & ship shape | Full e2e + README demo script |

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

### L8 — Side panel: Assets & Layers, canvas declutter *(v1.3, user-directed)*
The pages pane grows into a **collapsible side panel** with three **vertical tabs** (titles rotated 90° clockwise): **Pages** (the L6 navigator, unchanged), **Assets**, and **Layers**. Clicking a tab opens the panel to it; clicking the active tab collapses the panel to just the tab strip.
- **Assets** — upload/import content to use in the layout: file picker + drag-drop for **images** (placed for real) and **PDFs** (library-only until the print pipeline can rasterize them — placement honestly disabled). Asset *metadata* lives in the document (`doc.assets` — the §9 asset-store delta pulled forward **additively** into v1, optional and `{}`-defaulted so existing docs keep parsing); asset *bytes* live in an IndexedDB blob store behind a one-file seam. Clicking an image asset places it on the active page at natural size fit within the margins — or binds it to the selected empty picture frame; picture frames render their bound image (cover-fit; the `fit` mode field stays v2) with a visible **missing-asset state** if the blob is gone.
- **Layers** — the editing surface's objects listed **top-to-bottom** (topmost first): type icon + label, click to select, **drag to reorder** the z-order (array order; one undo step per drop).
- **Canvas declutter** — the name/size/zoom caption above the page and the four bleed corner marks are removed (title bar and status bar already carry name, size, and zoom).
*Done when:* an associate imports a photo and a PDF, places the photo, restacks objects from the Layers tab, and it all persists through reload; asset + reorder ops unit-tested; e2e covers upload → place → reorder → reload.

### L9 — Pictures: fill-on-click & drag-in *(v1.4, user-directed)*
Image intake moves to the frame itself, on top of L8's asset infrastructure:
- **The Picture tool draws an image box** (as today — the gray placeholder frame).
- **Click-to-fill:** with the Select tool, a *dragless click on an empty picture frame* opens the device file picker; the chosen image joins the Assets library (same IndexedDB blob store + `doc.assets` metadata) **and binds to that frame**. A frame that already holds an image just selects on click — swap it via drag-in or the Assets panel. Picker cancel is a no-op; a non-image choice raises the visible skip note, never a silent fallback.
- **Drag-in from the Assets panel:** image asset tiles become draggable; picture frames on the canvas highlight as drop targets while an image asset is over them, and dropping binds (or swaps) that asset into the frame — empty or filled. PDF tiles don't drag (library-only, as before).
- L8's fast paths stay: clicking a tile still places centered or fills the selected frame.
*Done when:* e2e draws a frame → clicks it → picks a file → the image renders; drags a tile onto a second frame and the image lands there; both persist through reload; the dragless-click detection never fires after a move/resize gesture.

### L10 — Rotation & Arrange *(v1.4)*
- **Rotate handle** on a single selection (stemmed handle above the frame): drag rotates about the frame center, **Shift snaps to 15°**, per-gesture undo; the status bar reads the live angle. `rotation` already exists in the schema and renders — this adds the editing.
- The **selection overlay and resize handles rotate with the object**; resize keeps operating in the object's local axes; the text-edit overlay inherits the transform. Lines don't rotate (their endpoints define them).
- **Snapping with rotation** (honest simplification): a rotated object contributes and snaps by its axis-aligned bounds.
- **Properties tab** gains a Rotation field (degrees, round-trip like X/Y/W/H).
- **The Arrange ribbon tab goes live:** Order group (Bring to front / Bring forward / Send backward / Send to back — the store gains toFront/toBack beside L4's step-wise reorder), Rotate group (90° left / right / reset), and an Align group reusing the L7 actions. **Grouping and effects stay in the §6 backlog.**
*Done when:* handle + numeric field round-trip incl. undo; Arrange order commands verified against canvas paint order; e2e rotates a rect with Shift-snap and resets it from the tab.

### L11 — Ruler guides & units *(v1.4)*
- **Ruler-dragged guides:** drag out of the horizontal ruler to drop a horizontal guide, vertical ruler for vertical; guides render in the wire's guide blue over the page, drag to reposition, drag back onto the ruler to delete. Stored document-level (`doc.guides: { v: number[], h: number[] }` — additive, `{v:[],h:[]}`-defaulted so existing docs keep parsing), undoable, persisted, governed by the existing Guides visibility toggle, and **joined into `snapTargets`** (snap.ts was built for this).
- **Unit toggle** (status bar): **in / mm / px / pt**. Geometry stays canonical inches; rulers, the title-bar size hint, the Page tab, Properties/Transform fields, and status readouts display and parse the active unit (96 px/in · 25.4 mm/in · 72 pt/in). Persists per station beside the experience level.
*Done when:* a guide dragged from each ruler lands, moves, deletes, and objects snap to it with smart-guide feedback; switching units relabels rulers and round-trips field input; guides + unit survive reload.

### L12 — Spreads & mixed page sizes *(v1.4)*
- **Two-page spread view** — the status bar's spread toggle goes live: Publisher pairing (page 1 alone, then 2|3, 4|5, …); the partner page renders beside the active one and a click activates it; editing gestures target the active page exactly as today. View state is session-only.
- **Per-page size override** — `page.sizeOverride?: { w, h }` (§9's delta, pulled forward additively): the Page tab gains an **"Apply to: Whole document / This page"** choice; canvas, rulers, thumbnails, spreads, guides, and snap targets all use the page's *effective* size; clearing the override returns the page to the document size.
*Done when:* spread pairing is correct including the lone first page; a page with an override renders true-size in canvas + thumbnail + spread; e2e toggles the spread, overrides one page's size, and reloads.

### L13 — Clipboard: Copy, Cut & Paste *(v1.4)*
- **In-app object clipboard** (session): **Cmd/Ctrl+C / X / V** and the Home band's Clipboard pills go live with real enabled/disabled states. Works on multi-selections; cut = copy + delete in one undo step; paste lands on the *current editing surface* (any page or master — the clipboard survives navigation) with the L4 duplicate offset, and repeated pastes cascade; pasted objects get fresh ids; a copied picture keeps its `assetId` (the library is document-level, so the image comes with it).
- **Text sessions keep native behavior:** inside the contentEditable overlay the shortcuts stay the browser's — the object clipboard never intercepts them.
*Done when:* copy/cut/paste chains are unit-tested (fresh ids, offsets, one-step cut undo, cross-page paste) and e2e-verified from both the keyboard and the ribbon pills; pill enabled states track selection and clipboard content.

### L14 — Experience levels: Simple / Standard (the deferred view arrives)
**Two levels since v1.3 — Pro is dropped**; Standard is already the everything-visible surface, and the title bar's disabled Pro segment came out in L8. The segmented control goes fully live, **surface-only** per design doc §3.3 — switching never touches the file, and everything stays reachable (progressive disclosure, nothing permanently hidden):
- **Standard** — the wire as built (the default all previous steps shipped).
- **Simple** — curated, task-first surface: palette trimmed to Select/Text/Picture (whose fill-on-click flow from L9 is exactly the novice path); Home band reduced to Font/Paragraph with a "More options" affordance that expands the rest; Insert band reduced to Text box/Picture/Add page; inspector auto-follows selection (Properties on select, Text while editing, Page otherwise). The L8 side panel stays present — Pages and Assets are novice surfaces.
Level persists per station; persisted legacy `"pro"` values coerce to `"standard"`.
*Done when:* switching reflows the chrome instantly without mutating the document (assert doc-equality in tests); e2e sanity-checks each level's surface.

### L15 — Hardening & ship shape
Full **Playwright pass** as the demo script: home → Layout card → pick/custom size → draw shapes → styled text → fill a picture frame from a file → rotate → drag a guide and snap to it → copy/paste → add page + master → spread view → align/snap → restack via Layers → reload persists → reset. Cross-surface polish against the offline prototype; a11y pass on the chrome (focus order, `aria-pressed` on toggles, keyboard reachability); drag-performance sanity on a modest machine; README update (run/demo/where the docs live).
*Done when:* e2e green; `docker run` still serves the whole POC; the README demo script lets a teammate demo the editor cold.

**Commit cadence:** one commit per step, each leaving the branch demoable — same convention as the tracker build.

---

## 5. Testing strategy

- **Unit (Vitest, colocated):** geometry (in↔px at zoom, fit-zoom, nudge math); preset table; snap-candidate detection and priority; align/distribute/z-order ops; object reducers (add/transform/props/duplicate/delete); undo/redo invariants (bounded, per-gesture, redo cleared on new edit); page/master operations incl. master propagation; overflow measurement; experience-level switching leaves the document byte-identical.
- **E2E (Playwright, extending `e2e/smoke.spec.ts` patterns):** the L15 demo flows, accumulated step by step — they double as the stakeholder demo script, exactly as the tracker's do.
- **Fidelity checks (manual):** side-by-side with `docs/handoff/layout-editor/Layout Editor (offline).html` per step — it runs in any browser and is the behavioral source of truth for the shell.

---

## 6. Deferred backlog (how the editor keeps growing)

Explicitly **not** in L1–L15, with where each lands later — the affordances stay visible-but-static per the wire so the ceiling reads as reachable:

| Capability | Lands | Notes |
|---|---|---|
| Linked text frames, autoflow, story threading; text wrap | Editor, next tranche | Text band's "Link boxes ⟶ / Wrap" controls exist, stay static; the model's per-frame text is forward-compatible |
| Tables | Editor, next tranche | Palette + Insert buttons present; status-bar "coming later in the beta" until then |
| Groups, effects | Editor, later | **Rotation editing + the live Arrange tab land in L10 (v1.4)**; the layers panel landed in L8 (v1.3); grouping and effects stay here |
| Real picture import + asset storage | **Landed in L8 (v1.3)** — the upload path; **L9 (v1.4)** adds fill-on-click and drag-into-frame; P3 still lands `.pub` image *extraction* into the same store | Asset model per §9, pulled forward additively; PDF assets stay library-only until the print pipeline can rasterize them |
| Open/save/export, File tab, PDF & preflight | Print-production slice | Suite plan §8.7/§8.12 backbone; editor gains "Export" once the spine exists in the POC; §8.6 defines the render-parity contract |
| Catalog SKU binding ("born correct") | Catalog/spec-sync slice `[INT]` | Page tab's Product card + "Choose a product →" link render now, act later; ties to the homepage product grid |
| `.pub` import | **P-tranche (§10–§11, this plan)** | Pipeline now specified here: sandboxed `libmspub` → intermediate model → `LayoutDocument` + import report |
| Sections (page ranges, numbering restarts) | Editor, later | **Spreads + mixed page sizes land in L12 (v1.4)** — the status bar's spread toggle goes live there; sections stay here |
| Data merge / VDP · AI-assisted creation & help | Their own suite slices | Design doc §4.7 / §3.3; AI assist is a suite-wide service |
| Publisher-familiar shortcut map, savable workspaces | With experience-model deepening | A basic shortcut set ships in L4; the full veteran map is a deliberate later pass |
| Unit toggle (in/mm/px/pt), guides dragged from rulers | **Lands in L11 (v1.4)** | Geometry helpers are unit-ready; ruler-drag guides slot into `snap.ts` exactly as designed |

---

## 7. Open questions / assumptions (proceeding with the recommendation unless redirected)

1. **Suite header + editor title bar** — keeping the persistent suite header and de-duplicating the editor title bar (deviation #1). An "immersive" full-screen toggle is a cheap later add if demos want the exact wire frame.
2. **DOM/SVG rendering** for the POC (§1.4). For the functional editor, **react-konva is now the recommended render layer** (§8.1) — recorded here as the engine recommendation this slice feeds into the suite plan's Phase-0 spike, with the spike's pass/fail criteria defined in §8.1 so the decision is confirmed with evidence on the store hardware, not assumed.
3. **Single working document**, autosaved to `stp-layout-v1`; opening a new size from Home replaces it (with a confirm when the current doc has content). Multi-document / open / save-as is backlog.
4. **Desktop-minimum gate** below `lg` rather than a phone reflow — a precision canvas is a station tool; the gate card keeps small screens honest.
5. **Simple disabled until L14** — per the built-over-time direction; the control renders from L1 so the title bar matches the wire. *(v1.3: the experience model is two levels — Pro dropped, its segment removed in L8.)*
6. **Fonts** — system stack + a curated family list until Motiva Sans licensing is confirmed (same posture as `public/fonts/README`). *(v1.5: the import library is now planned in §10.5 — self-hosted Google Fonts, metric-compatible remap; Motiva remains a separate licensing question.)*
7. **Inches only** at first; the unit toggle is handoff-mentioned and cheap to add later because all geometry is canonical-inches behind helpers.

---

## 8. Functional-editor render architecture — Konva

### 8.1 Decision: react-konva as the production render layer

**Recommendation: adopt Konva (via react-konva) — a Canvas 2D scene graph — as the functional editor's render layer, swapped in behind the unchanged document model and store.**

Why Konva specifically:

- **Canvas 2D, not WebGL.** Konva renders through the plain 2D canvas API, which the store hardware profile (i5-8500, integrated UHD 630) handles comfortably; there is no GPU-feature dependency to gate on, unlike WebGL-first engines (PixiJS, Fabric's WebGL mode). This is the same hardware argument that drives the suite's server-side-rendering preference — Konva is the lightest client-side render commitment that still scales past DOM.
- **Scales where DOM stops.** The POC's tens of objects are fine in DOM; a converted `.pub` newsletter is not — real Publisher files carry hundreds of shapes, images at print resolution, and multi-page furniture. A scene graph with layer-level caching, node-level hit graphs, and `toDataURL` export handles that class of document; per-object DOM reflow does not.
- **Licensing is clean.** Konva and react-konva are MIT — no AGPL posture question (the recurring suite blocker), no commercial seat cost.
- **Convergence, not divergence.** The sibling AI Design Studio already runs Konva/react-konva; the promo-product module plan's 2D imprint editor is the same class of surface. One canvas stack across the suite means shared interaction code, shared testing patterns, and one engine to security-patch.
- **The swap validates §1.4's bet.** Nothing above the canvas changes: the Zod `LayoutDocument`, the Zustand store and its per-gesture history, `geometry.ts` / `snap.ts` / `arrange.ts` (pure math), the ribbon, inspector, and pages pane are all render-agnostic by construction. The K-tranche replaces `PageSurface`/`ObjectNode`/`SelectionOverlay` internals and nothing else.

**Spike criteria (feeding the suite plan's Phase-0 engine decision — confirm with evidence, per the plan's own rule):** on the store hardware profile, (a) 60fps drag/marquee with **300+ objects** on a page including 10+ placed images; (b) live thumbnails for an 8-page document without jank; (c) zoom 10–400% with crisp text at devicePixelRatio; (d) memory stable across a 30-minute editing session. Fail any → PixiJS (WebGL w/ canvas fallback) is the named alternate; the model and store still don't change.

### 8.2 Stage & layer architecture

One `Stage` fills the canvas viewport region; **zoom is `stage.scale`, pan is `stage.position`** — `geometry.ts`'s `px = inches × 96 × zoom` becomes the stage transform, and object coordinates stay in canonical inches × 96 (zoom-independent), which keeps every store action and snap calculation untouched.

Konva layers are separate `<canvas>` elements — keep to **four**, ordered:

| Layer | Contents | Redraw cadence |
|---|---|---|
| **Furniture** | Pasteboard, page fill/shadow, bleed outline + corner marks, margin box, center/column guides, guide legend | Cached (`layer.cache()`); invalidated only on page-setup change or zoom |
| **Content** | Master objects (non-listening) beneath page objects — rects, ellipses, lines, pictures, committed text | On document mutation; `batchDraw` per gesture frame |
| **Overlay** | Selection frames + 8 handles, marquee, smart-guide snap lines, overflow badges | At interaction rate; `listening(false)` on the guide lines |
| **Text-edit** *(DOM, not Konva)* | The `contentEditable` editing surface, absolutely positioned over the stage | Only while `editingTextId` is set |

**Rulers stay DOM** — they're cheap, already zoom/pan-aware off shared viewport state, and gain nothing from canvas. The wire's chrome (ribbon, panes, inspector, status bar) is untouched.

**HiDPI:** set layer `pixelRatio` to `devicePixelRatio` (cap 2 on the store profile) so text and hairlines stay crisp; thumbnails export at a reduced ratio (§8.5).

### 8.3 Objects & interaction

- `ObjectNode` maps 1:1 onto Konva primitives: `rect` → `Konva.Rect` (corner radii ready), `ellipse` → `Konva.Ellipse`, `line` → `Konva.Line`, `picture` → `Konva.Image` inside a clipping `Group` (fit modes: fill/fit/stretch as transform math), text → §8.4. Z-order remains array order; `locked` sets `listening(false)`.
- **Interaction flows through the same store actions.** Konva's pointer events replace the POC's hand-rolled pointer math for hit-testing and drag deltas, but every gesture still commits via `transformObject` + one history snapshot at pointer-up — undo/redo invariants and their tests carry over verbatim.
- **Keep the custom 8-handle `SelectionOverlay`, not `Konva.Transformer`.** The wire specifies the selection chrome exactly (frame color, handle size, marquee style), and the snap pipeline needs to intercept transforms mid-gesture; a custom overlay drawing on the overlay layer preserves both. Revisit `Transformer` only when rotation *editing* lands (§6) — it's the natural host for a rotation handle.
- **Snapping is unchanged**: `snap.ts` stays pure inch-space math fed by the drag deltas; matched candidates render as lines on the overlay layer in the wire's guide colors.

### 8.4 Text: hybrid canvas-render / DOM-edit

Text is the one place a canvas engine costs something, and the design pays it deliberately:

- **Committed text renders in Konva; editing stays `contentEditable`.** On `editingTextId`, the Konva text node hides and the DOM overlay appears at the frame's stage-transformed position — native caret, selection, IME, and spellcheck for free (the overlay gymnastics §1.4 warned about are confined to one well-defined swap). On commit, the store updates and Konva redraws.
- **`text.ts` grows into a shared text-layout module** — the single source of truth for line breaking and metrics. It measures with the Canvas 2D `measureText` API only (no DOM dependency), takes a frame's text + style + width, and returns positioned **line boxes** consumed by three clients: (1) the Konva renderer (each line drawn as a `Konva.Text` node — sidestepping Konva's limited built-in wrapping control), (2) the **overflow indicator** (content height vs. frame height — same red badge, now computed from real metrics), and (3) any future server-side render (§8.6).
- **Per-frame styling now, per-run ready.** The v1 layout module consumes the POC's per-frame text props; the v2 schema's paragraph/run structure (§9) slots in as richer input to the same module — `.pub` import (§10) is what forces that upgrade.
- **Fonts gate measurement.** Layout runs only after `document.fonts.load()` resolves for the frame's family (curated list per §7.6); un-loaded families measure with the fallback and re-layout on load. The import pipeline's font-remap table (§10.4, library per §10.5) maps foreign `.pub` fonts into the self-hosted library.

### 8.5 Performance & thumbnails on the store profile

- Furniture layer cached; content layer `batchDraw` throttled to animation frames; smart guides and marquee on the overlay layer so drags never repaint the document.
- **Only the active page mounts a live stage.** Pages-pane thumbnails become `stage.toDataURL({ pixelRatio: ~0.15 })` snapshots taken on mutation debounce — replacing L6's mini-DOM renders with cheaper, pixel-accurate ones. Master editing renders the master's objects to the same stage with a mode banner, exactly as L6 specifies.
- Placed images decode once into `ImageBitmap`s keyed by asset id (§9); downscaled draws let Konva's canvas smoothing handle print-resolution sources.
- Budget check in L15's drag-performance pass moves to the K-tranche's exit gate with the §8.1 spike numbers.

### 8.6 Print/export parity (forward pointer, honest scope)

Print-grade output (PDF/X, preflight) remains the **print-production slice** on the suite's shared backbone — this editor does not grow its own PDF engine. The parity contract this plan *does* own: the **text-layout module and geometry math are isomorphic** (pure Canvas-2D-measure + pure math, no DOM), so the server render — whether Konva-under-Node (`konva` + `skia-canvas`) for raster proofs or the backbone's PDF path consuming `LayoutDocument` directly — reproduces the screen exactly. WYSIWYG is guaranteed by sharing the layout code, not by trusting two engines to agree.

---

## 9. Document model v2 — schema deltas for the functional editor

Additive, versioned (`version: 2` with a v1→v2 loader migration; the POC's persisted docs keep opening). Each delta is pulled in by a named consumer — nothing speculative:

| Delta | Pulled in by | Shape |
|---|---|---|
| **Asset store** | Picture import (**upload path shipped early in L8**, v1.3; `.pub` extraction P3), Konva image render | `assets: Record<id, { mime, width, height, source }>` — `source` is an IndexedDB blob ref client-side or a server asset URL for imported docs; document JSON stays small. *L8 ships it additively in v1 (optional, `{}`-defaulted) so existing docs keep parsing* |
| **Picture frame binding** | Same | `Frame(type:'picture')` gains `assetId: string \| null` (null = the POC's gray placeholder) + `fit: 'fill' \| 'fit' \| 'stretch'`. *`assetId` shipped in L8; `fit` remains v2 (L8 renders cover-fit)* |
| **Path object** | `.pub` polygons/freeform shapes (P2) | `{ type:'path', x, y, w, h, rotation, d: PathSeg[], fill, stroke }` — normalized segment array, not raw SVG strings |
| **Per-run text** | `.pub` character formatting (P2), Text band v2 | `text.paragraphs: { props: ParaProps, runs: { text, font, color }[] }[]` — supersedes the per-frame flat model; layout module (§8.4) consumes both during migration |
| **Text color** | Per-run model, import fidelity | `color` joins the run/font props (the v1 schema styles the frame, not the ink) |
| **Threading (schema only)** | `.pub` linked text boxes — *conversion deferred, model ready* | `Frame(type:'text')` gains `storyId?: string`, `prevFrameId?/nextFrameId?: string`; the editor ignores them until the threading tranche (§6), but import preserves the links losslessly |
| **Per-page size override** | `.pub` mixed page sizes; **pulled forward to L12 (v1.4)** with Page-tab editing | `Page.sizeOverride?: { w, h }` — additive/optional, so it ships in v1 the same way `assets` did |
| **Ruler guides** | Guide editing (**L11, v1.4**) | `doc.guides: { v: number[], h: number[] }` — document-level in the POC (additive, defaulted); per-page guides can layer on later without breaking the shape |

Everything else — inches, array z-order, masters, `rotation` — already carries forward from §3.4 unchanged.

---

## 10. `.pub` import & conversion

The pipeline is the `PUB_TO_IDML_RESEARCH.md` architecture with one substitution: **the generator target is `LayoutDocument`, not IDML.** The research doc's front half (`libmspub` parse → intermediate layout model) is adopted as-is; the intermediate model becomes the **shared hub** that can emit *both* outputs — `LayoutDocument` for this editor, IDML for the interchange/migration deliverable — so the parse investment is made once.

### 10.1 Where it runs: server-side, sandboxed [CRITICAL] — with an explicit POC posture (v1.2)

`libmspub` is the security doc's highest-parser-risk engine — C++ over an undocumented OLE2/Escher binary. Import therefore runs **server-side only**, as an out-of-process job behind a Next.js route handler in the POC's existing container. The runtime image moves to a **Debian-slim base** (`node:22-bookworm-slim` + `apt-get install libmspub-tools` — the research doc's own install path; `libmspub-tools` is not an Alpine package); `docker run` still serves everything.

**POC posture.** This is a fully functional POC, not a production deployment, and the threat model scales with what's wired in: `SECURITY_CONSIDERATIONS.md`'s verdict is that the risk follows from the parser being connected to *customer PII, order systems, and the production queue* — the POC touches none of those (no integrations, no PII stores, no write-back, no meaningful container secrets, ephemeral demo deploy). The checklist therefore splits into what the POC **enforces now** — the portable, our-own-code half, which is exactly what P5's adversarial tests exercise — and what is **deferred to production as recorded accepted risk**. Deferred ≠ dropped: every deferred line is a named launch gate for the production tranche.

**POC-enforced (built in P1, tested in P5):**

- **Content-sniff, never trust the extension**: OLE2/CFBF container magic first, then the `Contents`-stream markers (`E8 AC 22 00` / `E8 AC 2C 00`; `E7 AC 2C 00` for the rare v1 flat blob), CAB magic for `.puz`.
- **Out-of-process subprocess with caps**: per-file size cap, wall-clock timeout with kill (a hang *is* a finding), CPU/memory rlimits via a `prlimit`/`ulimit` wrapper.
- **Scratch-dir jail** created per job and wiped after — parse inputs/outputs never touch application storage.
- **Harden `.puz` (CAB) extraction**: path canonicalization + confinement, entry-count/size/ratio caps, reject symlinks and absolute paths; the inner `.pub` re-enters the same pipeline.
- **Content-disarm on the way out**: imported assets are re-encoded (image transcode), never served back as original bytes.
- **AV scan hook on ingest** — present from P1 as a logging stub so the seam exists (the suite's ClamAV-or-commercial decision lands later).

**Production-deferred (accepted risk for the POC, recorded here):**

- Namespace/microVM-grade isolation and privilege separation beyond the container — the security doc's open decision #1 (container-per-parse vs. gVisor/Firecracker-class) is made for the production tranche, not now.
- Per-subprocess **network-egress jail**. The POC-grade story, stated honestly: `libmspub`/`pub2raw` make no network calls by design, and the deploy's container-level egress policy is the backstop; the enforced jail is a production control (unprivileged Cloud Run-class containers can't create network namespaces anyway).
- A **real AV engine** behind the ingest hook, and re-scan on export/write-back (no write-back path exists in the POC).

**Exposure guard (holds regardless of posture):** the import endpoint ships behind the demo deployment with the size cap, timeout, and rate limiting — it is never advertised as a public anonymous upload surface. Behind the demo, the residual risk is a crashed ephemeral container; on the open internet it would be a free fuzzing service against a C++ parser, which the POC does not accept.

**Dev/CI without the binary — fixture mode:** because the pipeline consumes `pub2raw`'s *text trace*, the golden traces §10.6 specifies double as a dev fallback: when the binary is absent, the import route serves a canned demo trace through the real trace-parser → mapper → report → editor path. `npm run dev` and Playwright therefore run everywhere with no native dependency; the binary is required only where live conversion is exercised (the Docker image, and P5's full-pipeline lane).

### 10.2 Pipeline

```
.pub / .puz upload
  ▼  content-sniff → size cap → AV hook → (.puz: hardened CAB unpack → inner .pub)
pub2raw  (sandboxed subprocess — Option A per the research doc; the
  ▼       native librevenge generator remains the later fidelity upgrade)
Trace parser  →  Intermediate Layout Model
  ▼               (pages, frames, shapes, images, runs, threading links —
  ▼                the research doc's model, verbatim)
LayoutDocument mapper                    IDML generator (sibling consumer,
  • schema-v2 doc + extracted assets       out of scope here)
  • font remap against the curated list
  • fidelity tiering + import report
  ▼
{ doc, assets[], report }  →  editor opens the doc; report panel shows alongside
```

`pub2xhtml` runs as a **cross-check render** in the test harness only (visual diff source + image-extraction verification), not in the serving path.

### 10.3 Callback → `LayoutDocument` mapping

| `libmspub` callback | `LayoutDocument` target | Tier |
|---|---|---|
| `startPage` (w, h) | `Page`; first page sets `doc.size`, deviations → `Page.sizeOverride` | 1 / 2 |
| `startTextObject` (bbox) | `Frame(type:'text')` at the bbox | 1 |
| `openParagraph` / `openSpan` / `insertText` | `paragraphs[].runs[]` (schema v2); font remapped per §10.4 | 1 |
| `insertLineBreak` / `insertTab` | Run breaks / tab chars in the run text | 1 |
| `drawRectangle` / `drawEllipse` | `Frame(type:'rect' \| 'ellipse')` + fill/stroke from `setStyle` | 1 |
| `drawPolygon` / `drawPolyline` / `drawPath` | `path` object (§9); P1 fallback: bounding-box rect + report note | 1 (P2) / 2 (P1) |
| `drawGraphicObject` (bytes + MIME) | Asset (transcoded) + `Frame(type:'picture', assetId)` | 1 |
| Linked text boxes | Separate frames carrying `storyId`/`prev`/`next` (§9); rendered **unthreaded** + report note until the threading tranche | 2 |
| `setStyle` gradients / effects | Nearest flat fill + report note | 2 |
| `openTable…` | **Flag-only**: placeholder frame at the table's bbox + report entry ("table not converted") until the tables tranche | 3 |
| Layers | Flattened into z-order + report note (editor has no layers panel yet, §6) | 2 |
| WordArt-class objects | Text frame with nearest style, or picture fallback if libmspub emits a raster | 2 |

**Tiers:** **1** convert clean · **2** degrade with a report note · **3** flag-only (visible placeholder + report; nothing silently dropped). The tiering rule is the design doc's import-report requirement (§5.1) made mechanical.

**What libmspub does *not* expose — page margins, layout/ruler guides, columns, bleed (corpus-verified, v1.5).** Across the real corpus (`fixtures/pub-corpus/`), the `startPage` callback carries **only `svg:width`/`svg:height`** — no page-level margin, guide, column, or bleed properties appear anywhere in the trace (librevenge's drawing interface is shape-oriented; Publisher's layout guides live in document-structure records libmspub doesn't surface). So these are **not a later P-step** — the data isn't in the parse path:

- **Imported docs get editor defaults** — `margin 0.5in`, `bleed 0`, `columns 1`, no ruler guides — and the page **size** (per-page) is the one page-setup value that *is* imported. Text-frame column gaps (`fo:column-gap`) and paragraph indents (`fo:margin-left`/`fo:text-indent`) *are* in the trace but are frame/paragraph-level, not page guides.
- **The right source for print margins/bleed/safe-area is the product spec, not the customer's `.pub`.** For a print shop these belong to the SKU the job is bound to ("born correct", §6 catalog/spec-sync) — more reliable than whatever arbitrary guides a customer's file happened to carry. So margins/guides effectively *arrive with catalog binding*, not with `.pub` import.
- **Recovering the `.pub`'s own guides** would require going below libmspub to the page-setup records (the research doc's reverse-engineering appendix) — high effort, low value given the line above. Recorded as a non-goal for the P-tranche unless a corpus need forces it.

### 10.4 Import report & font remap

The response's `report` is structured JSON rendered as a panel when the converted doc opens (and stored with the doc):

`{ fidelity: { converted, degraded, flagged }, fonts: [{ source, mappedTo, reason }], notes: [{ objectId, pageId, tier, message }], overset: [frameIds] }`

- **Fonts:** every `.pub`-referenced family maps into the curated list (§7.6) via a maintained remap table (metric-compatible choices first: Arial↔Helvetica-class, Times-class, etc.); unmapped families fall to the default with a named entry. No font embedding — remap-and-report, mirroring the Markzware behavior the research doc endorses.
- **Overset:** after mapping, the §8.4 layout module measures every text frame with the *remapped* fonts; overflowing frames are listed in the report and badged on canvas — remapped metrics are the #1 cause of post-conversion overflow, so this check is not optional.
- Report items deep-link: clicking a note selects the object and navigates to its page.

### 10.5 Font library & mapping (v1.5)

§10.4's remap table needs an actual library to map *into*. The decision:

- **Self-hosted, open-license — Google Fonts as the source.** WOFF2 files served from `public/fonts/` with `@font-face`/`FontFace` registration — **no CDN fetch** (store networks and the proof station's kiosk posture want zero external dependencies, and rendering must be deterministic offline at the counter). Google Fonts' OFL/Apache licensing is clean for a deployed tool; the Motiva Sans question stays separate and pending (§7.6). Practical note: the download artifact is the font files themselves (via `@fontsource/*` packages or google-webfonts-helper), vendored into the repo — not a runtime dependency.
- **Two lists, one seam.** The **UI pick list** (`FONT_FAMILIES` in `text.ts`) stays short and curated — associates choose from an opinionated set. The **import library** is broader: every family the remap table can land on registers **lazily** and loads only when an open document references it, so the extensive library costs nothing until an import needs it.
- **The remap table, tiered like the conversion itself:**

  | Tier | Rule | Mappings |
  |---|---|---|
  | 1 — metric-compatible | Same metrics by design; text reflows identically | Arial / Helvetica → **Arimo** · Times New Roman → **Tinos** · Courier New → **Cousine** · Calibri → **Carlito** · Cambria → **Caladea** · Georgia → **Gelasio** |
  | 2 — close match | Same class, near metrics; overset check decides | Verdana → Open Sans · Comic Sans MS → Comic Neue · Impact → Anton · Book Antiqua / Palatino → Lora · Century Schoolbook → PT Serif · Franklin Gothic → Libre Franklin · Garamond → EB Garamond |
  | 3 — class fallback | Bucket by class (serif / sans / script / mono / display) | script → Caveat · display → Oswald · mono → Cousine · else the document default |

  Every mapping lands in the import report's `fonts` array with its tier and reason (§10.4); **tier ≥ 2 makes the overset check mandatory** for the affected frames. The table is data (one module), grown from what the corpus actually references — not exhaustively up front.
- **Weights & styles:** regular/bold + italics minimum per family; import clamps intermediate weights to the nearest registered weight and reports the clamp.
- **Measurement gating:** the §8.4 rule applies even pre-Konva — text measurement (DOM today, canvas after K3) runs only after `document.fonts.load()` resolves for the mapped family; frames re-measure on late load so overset verdicts are computed with the real metrics.
- **Publisher metric quirks the mapper owns:** Publisher's "single" line spacing (`1sp`) ≈ **1.19× the point size**, not 1.0 — convert to the model's multiplier honestly or every imported frame reads overset; Publisher text boxes carry default **internal insets (~0.04 in)** the v1 schema doesn't model — the mapper shrinks the frame's text area on import, and schema v2 gains an optional text-frame `inset` (§9) so the value survives round-trip; Publisher's **"shrink text on overflow" autofit** means the declared point size may exceed what Publisher actually rendered — the overset report is the honest catch-all, and a "shrink to fit" quick action on a reported frame is a cheap later add.

### 10.6 Acceptance & testing

- **Corpus:** real store `.pub` files (flyers, signage, newsletters, the template library) — the suite plan's standing real-file corpus, plus adversarial samples (malformed OLE2, fuzzed Escher records, zip/CAB attack files) exercising §10.1's controls.
- **Golden traces:** unit-test the trace parser and the mapper against checked-in `pub2raw` outputs — deterministic, no `libmspub` needed in the unit lane.
- **Render diff:** converted doc rendered via the §8 stack vs. the `pub2xhtml` reference render; element-level fidelity scored against the design doc's **≥90%** target (§2.3), with the Markzware supported-elements list as the conformance checklist (page size · positioning · colors · fonts+remap · text attributes · flow · images; tables/threading/wrap tracked as tier-2/3 until their tranches).
- **E2E:** upload a corpus file at the homepage's `.pub` callout (which finally goes live, replacing the inert placeholder noted in §1.2) → doc opens in the editor → report panel lists expected notes → edit + undo + persist hold.

### 10.7 Swap seams — rules conformance (v1.5)

The import service is the POC's first real backend, and the prototype rules' swappable-backend requirement applies to it exactly as it did to the client-side stubs: **the POC pipeline must be replaceable by the production backbone's conversion service without touching the editor.** The architecture above already carries the seams (the `LayoutDocument` contract, the intermediate model, fixture mode); this section makes them **P1 acceptance criteria** rather than intentions:

1. **Thin route, fat lib.** The route handler is a few lines of plumbing; the pipeline lives as pure functions under `src/lib/import/` (trace parser · mapper · report builder), and the **subprocess invocation is confined to one file** — the `blob-store.ts` pattern. That file is the seam where "shell out to `pub2raw` in the POC container" later becomes "call the backbone's sandboxed conversion service"; nothing else changes.
2. **The editor consumes imports through a store action** (`openImportedDocument(doc, assets, report)`), and the upload UI reaches the endpoint through a **single client module** (`src/lib/import/client.ts`). No component fetches `/api/import` directly — if one ever does, swappability is lost.
3. **Extracted assets ride the existing asset seam.** Server-extracted images (P3) land through the same `doc.assets` metadata + IndexedDB blob-store path L8's upload ships — no parallel asset plumbing. The id → bytes mapping stays the one seam `STUBS.md` already registers.
4. **STUBS.md registers the new seams** in the same commit that creates them: the import client/service boundary and its swap story, the subprocess wrapper file, fixture mode, in-memory job handling and the single-server-instance constraint it implies.

The conformance property, stated once: **the backend stays optional and replaceable.** Fixture mode is the proof — `npm run dev`, CI, and the demo run the full import path with zero native or server-state dependency, and the Docker image is the only place live conversion executes. The Zod contracts at the API boundary (`{ doc, assets, report }` against `LayoutDocumentSchema`) are the portable interface any production stack implements against, exactly as the schema comment in `src/lib/schema/layout.ts` promises.

---

## 11. Extended build order — K- and P-tranches

Both tranches follow the L-steps' contract: one commit per step, demoable after each, the L1–L15 tests staying green throughout. ~~**K before P**~~ *(v1.5)*: **P may lead K for the import proof point** — import correctness is render-agnostic (the document model is the contract), so P1–P4 run against the DOM render now, with an honest perf note on documents past the DOM comfort zone; **K remains the gate before import-heavy documents go to field UAT** (a converted newsletter still needs the render layer that can carry it).

| Step | Lands | Newly available |
|---|---|---|
| K1 | Konva stage + furniture/content layers, parity render | The document draws in canvas; every L-step e2e passes unchanged |
| K2 | Interaction migration: draw/select/drag/resize/marquee/snap on Konva events | Full editing parity; DOM canvas components deleted |
| K3 | Text-layout module + Konva text render + edit overlay swap | Text parity incl. overflow badge; schema-v2 migration ships |
| K4 | Perf pass + `toDataURL` thumbnails; §8.1 spike numbers recorded on store-profile hardware | The engine decision is *evidenced*, closing §7.2 |
| P1 | Import service per §10.1's POC posture (Debian-slim image; fixture mode for binary-less dev/CI) and §10.7's swap seams: sniff → `pub2raw` → trace parser → geometry-only mapping | A `.pub` opens as correctly-sized, correctly-placed frames (the research doc's Milestone-1 bar) |
| P2 | Text runs + styles + font remap; paths | Real content: text in the right boxes, right sizes; polygons faithful |
| P3 | Image extraction → assets + picture frames | Image-bearing publications convert — extracted images land in the same asset store L8's upload path ships |
| P4 | Import report UI + overset check + `.puz` handling | The associate sees exactly what to review — the design doc's §5.1 report requirement |
| P5 | Corpus + fidelity harness + adversarial security tests wired to CI | The ≥90% fidelity metric is measured, not asserted; §10.1 controls proven |

*K-tranche exit gate:* L1–L15 e2e green on Konva; spike criteria met and recorded. *P-tranche exit gate:* corpus fidelity ≥90% element-level on tier-1 categories; every degradation reported, nothing silent; the §10.1 **POC-enforced** controls pass the adversarial set (the production-deferred controls remain launch gates for the production tranche, not this one); the §10.7 swap seams hold as built (thin route, one-file subprocess seam, store-action entry, shared asset path, STUBS registered).

---

*This plan grows the POC's second product surface onto the shell the tracker build established — same stack, same fidelity contract, same step-per-commit rhythm — and now carries it to a functional Publisher replacement: a Konva-rendered editor proven on the store hardware, fed by a sandboxed `libmspub` import pipeline that opens real `.pub` files with an honest fidelity report, keeping the suite plan's sequencing promise well ahead of the October 2026 Publisher retirement.*
