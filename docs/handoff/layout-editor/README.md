# Handoff: Page-Layout Editor (Microsoft Publisher replacement)

## Overview

This is the **freeform page-layout editor** for the Staples In-Store Print & Design Tool Suite — the replacement for Microsoft Publisher (which reaches end of support in October 2026). It is the suite's most-requested capability (§8.3 in the feature requirements; page layout with preset & custom sizes was the #1 associate ask at ~78%).

An in-store associate uses it to lay out and edit a print publication — placing and styling text, images, shapes, and tables on a page with precise, measurement-driven control, master pages, and print-correct bleed/margin guides. The design pairs **Affinity Publisher's docked-panel structure** (left tool palette, page-navigator, right inspector) with **Microsoft Publisher's approachable tabbed ribbon**, so it serves both novice and veteran associates. This bundle documents the editor **at rest** — a brand-new, blank Letter publication.

> This editor is the *freeform layout canvas*. Two adjacent surfaces are specified separately and are **out of scope here**: the resize/rescale + N-up **imposition** tool, and the file-intake/quick-fix utilities.

## About the design files

The files in this bundle are **design references created in HTML** — a prototype showing intended layout, structure, and interaction behavior. **They are not production code to copy directly.**

The task is to **recreate this design in the target codebase's environment** (React, Vue, etc.), using its established component library, patterns, and styling. If no environment exists yet, choose the most appropriate framework for the project and implement there. The HTML/CSS here communicates *what to build and how it should behave*, not the literal markup to ship.

The prototype is built as a "Design Component" — a small template + a logic class holding UI state. Treat the logic class as a plain description of the state model and event handlers, not as an API.

## Fidelity

**Low / mid-fidelity wireframe (structure-first).**

- The design is intentionally **grayscale**, with **Staples red (`#CC0000`) used only for actions, active/selected states, and warnings**, plus **guide-blue** for page guides. It is not a final visual comp.
- Use it as the authority for **layout, information architecture, control grouping, and interaction behavior**.
- Apply the **codebase's / Staples' real design system** for final visual styling (color, elevation, iconography, motion). The concrete values in the *Design Tokens* section below are the wireframe's values — match structure to them, but defer to the production design system for finish.
- Icons are **Lucide-style monochrome SVGs** standing in for the real Staples icon set — swap for the production icon library.

## Screens / Views

There is **one view** (the editor shell). It is a fixed desktop layout designed for the in-store station (HP ProDesk, landscape). The prototype canvas is **1460 × 904 px**; in production it should be **fluid/responsive to the window**, with the center canvas absorbing all extra space and the side panels holding fixed widths.

### Overall layout (top → bottom)

A single column; the middle work area is a horizontal flex row.

| Region | Size | Notes |
|---|---|---|
| 1. Title bar | height **40px** | Fixed |
| 2a. Ribbon tab strip | height **32px** | Fixed |
| 2b. Ribbon command band | height **92px** | Fixed; content swaps per active tab |
| 3–7. Work area | **flex: 1** (fills remaining height) | Horizontal flex row |
| 8. Status bar | height **28px** | Fixed |

Work-area row (left → right):

| Column | Width | Flex |
|---|---|---|
| 3. Tool palette | **52px** | fixed |
| 4. Pages pane | **188px** | fixed |
| 5+6. Canvas (rulers + page) | — | **flex: 1** |
| 7. Inspector | **268px** | fixed |

Panel separators are `1px solid #ececec` (vertical) / `#e0e0e0`–`#e6e6e6` (horizontal). Every fixed region uses `flex-shrink: 0`.

---

### 1. Title bar
- Background `#f0f0f0`, bottom border `1px #e0e0e0`, horizontal padding 14px, gap 12px, vertically centered.
- **Left:** Staples wordmark (red chip: bg `#CC0000`, white text 11px/700, padding `3px 6px`, radius 3px) · document name ("Untitled publication", 13px/600, `#333`) · size hint ("· Letter · 8.5 × 11 in", 12px, `#9a9a9a`).
- **Right (in order):** experience-level segmented control **Simple / Standard / Pro** (track `#e7e7e7`, radius 6, active segment = white pill with `0 1px 2px rgba(0,0,0,.12)` shadow; **Standard** active in this mock) · store label ("Store #1284", 12px `#8a8a8a`) · help glyph (18px circle, `1.5px #b6b6b6` border) · window controls (— ▢ ✕, 11px `#9a9a9a`, gap 15px).
- The experience control maps to §7 "Approachable → Pro": it changes the UI surface only, never the file. This mock shows **Standard**.

### 2. Ribbon (Publisher-style)
- **Tab strip (32px):** bg `#f0f0f0`, bottom border `1px #e4e4e4`, items bottom-aligned. Tabs: **File** (red `#CC0000`/600, static), **Home · Insert · Layout · Text** (interactive, `#3d3d3d`), **Arrange · View · Help** (muted `#8f8f8f`, static). Active interactive tab shows a **2px `#CC0000` underline** inset 12px from each side, pinned to the strip bottom.
- **Command band (92px):** bg `#f7f7f7`, bottom border `1px #e6e6e6`, `overflow:hidden`. Content **swaps with the active tab**. Each band is a horizontal row of **groups**; a group is a centered vertical stack of `[controls row] + [group label]` with `padding:6px 14px` and a right divider `1px #ececec`. Group labels: 9.5px `#a6a6a6`.
  - **Home:** Clipboard (large *Paste* button 46×54 + Cut/Copy) · Font (family dropdown 118px, size 44px, **B / I / U** 26×24 buttons, font-color **A** with red underline swatch) · Paragraph (align L/C/R/J, bullets, numbering, ¶) · Styles ("Body · Normal" dropdown, *Heading*, *+ New*) · Editing (Find, Replace…).
  - **Insert:** Pages (Add page, Masters — 52×52 buttons) · Text & media (Text box, Picture) · Illustrations (Shapes, Table) · Links (Hyperlink).
  - **Layout:** Page size ("Letter · 8.5 × 11 in" dropdown 150px) · Orientation (portrait active = red `#CC0000`/`#FBEBEB`, landscape) · Guides & bleed (Margins, Bleed 0.125) · Columns (count dropdown + Guides toggle switch, red when on).
  - **Text:** Character (family, size) · Styles ("Paragraph · Normal") · Spacing (Line 1.2, Space) · Text flow (Link boxes ⟶, Wrap).
- Control chrome: dropdowns/inputs = `1px #d6d6d6`, radius 5, white, 11–12px `#555`, `▾` in `#b0b0b0`. Icon buttons = `1px #dcdcdc`, radius 5, white, icon `#555`/`#666`.

### 3. Tool palette (Affinity-style)
- Width 52px, bg `#f4f4f4`, right border `1px #e4e4e4`, vertical stack, `padding:9px 0`, gap 6px, centered.
- **9 tools**, single-select: **Select** (cursor) · **Text** (serif "T") · — divider — · **Rectangle** · **Ellipse** · **Line** · — divider — · **Picture** · **Table** · — divider — · **Zoom** · **Move/Pan**.
- Each button: 36×34, `1px #e0e0e0`, radius 6, white, icon `#555`. Dividers: 24×1px `#e0e0e0`.
- **Active tool** = a 2px `#CC0000` ring (`inset:-2px`, radius 7) with a faint `rgba(204,0,0,.05)` fill overlay. Default active: **Select**.

### 4. Pages pane
- Width 188px, right border `1px #ececec`, vertical.
- **Header (padding 12px, bottom border `1px #efefef`):** `PAGES` label (`.wf-h` style: 11px/700, uppercase, `#5f5f5f`, letter-spacing .04em) + a **Pages / Master pages** segmented control (track `#ececec`, radius 6; active segment = white pill w/ shadow). Default: **Pages**.
- **Body (flex:1, padding 14px):** swaps with the segmented control.
  - **Pages:** page 1 thumbnail (88×114 white, **`1.5px #CC0000`** active border, `0 1px 3px rgba(0,0,0,.14)`) with red "1" caption; then an "Add page" tile (88×114, `1.5px dashed #cfcfcf`, centered "+", `#b0b0b0`).
  - **Master pages:** Master **A · applied** (88×114, red active border, faint dashed inner margin + footer bar) and Master **B · blank** (grey border); "+ New master" affordance.

### 5. Rulers
- **Top ruler row (18px):** an 18px corner box (`#ededed`, right+bottom border) + a horizontal ruler filling the rest — bg `#ededed`, bottom border `1px #e0e0e0`, tick marks via `repeating-linear-gradient(90deg, #c4c4c4 0 1px, transparent 1px 24px)`.
- **Left ruler (18px):** bg `#ededed`, right border `1px #e0e0e0`, vertical ticks `repeating-linear-gradient(0deg, #c4c4c4 0 1px, transparent 1px 24px)`.
- In production, ruler units follow the document unit toggle (in / mm / px / pt) and tick spacing tracks zoom.

### 6. Publication page (canvas)
- Pasteboard: `#d3d3d3`, page centered, `overflow:hidden`.
- Top-center caption: "Untitled publication · Letter 8.5 × 11 in · 100%" (11px `#7a7a7a`).
- **Page:** 428×554 px in the mock (a Letter 8.5×11 portrait proxy — **not** to scale; production draws the true page at the current zoom). White, `0 3px 16px rgba(0,0,0,.22)`, **sharp corners**.
  - **Bleed:** dashed outline `1.5px dashed #CC0000`, `outline-offset: 9px` (0.125 in bleed).
  - **Margin / safe area:** `1px dashed #9fb6df`, inset 26px (0.5 in).
  - **Guides:** center vertical `1px #9fb6df` (opacity .5) + center horizontal (opacity .35).
  - **Bleed corner marks:** small L-shaped `#b58686` marks at each page corner, offset 15px.
- **Guide legend** (bottom-right of pasteboard): white card, `1px #e2e2e2`, radius 7 — a red dashed swatch "Bleed 0.125 in" and a blue dashed swatch "Margin 0.5 in".

### 7. Inspector (Affinity-style)
- Width 268px, left border `1px #ececec`, vertical.
- **Tab strip (38px, bottom border `1px #ececec`):** 4 equal tabs **Properties · Text · Align · Page** (11.5px `#555`). Active = 2px `#CC0000` underline (inset 14px). Default: **Page**.
- **Body (flex:1, padding 16px):** swaps per tab; sections use the `.wf-h` label style with 8px bottom margin.
  - **Page (default):** *Product* card ("Custom size — not bound to a SKU" + blue link "Choose a product to make it born-correct →", `#086DD2`) · *Page size* (Width 8.5 in / Height 11 in inputs + "Letter" preset dropdown) · *Orientation* segmented (Portrait active / Landscape) · *Bleed & margins* (Bleed 0.125 in / Margin 0.5 in).
  - **Properties:** empty state — dashed `#d8d8d8` card on `#fafafa`: "Nothing selected / Select an object on the page to edit its position, size, fill, and stroke." Below, a **disabled (opacity .5)** *Transform* group (X/Y, W/H inputs). Populates when an object is selected.
  - **Text:** *Character* (family dropdown, size + B/I) · *Paragraph* (align L/C/R/J — Left active in red `#CC0000`/`#FBEBEB`; line-spacing dropdown) · *Style* ("Body · Normal").
  - **Align:** *Align* (6 buttons: left/center/right + top/middle/bottom, each a guide line + two grey object rects `#d0d0d0`) · *Distribute* (Horizontal / Vertical) · *Relative to* ("Page" dropdown).
- Input rows: label 10px `#999` above a 30px field (`1px #d6d6d6`, radius 5, white, 12px `#444`).

### 8. Status bar
- Height 28px, bg `#ececec`, top border `1px #e0e0e0`, padding 0 12px, gap 14px.
- **Left:** page nav (◀ "Page 1 of 1" ▶, 11px `#777`, chevrons `#aaa`) · divider · tool status ("Select tool · ready").
- **Right:** view buttons (single-page = red active `#CC0000`/`#FBEBEB`; two-page spread = two mini rects) · divider · **zoom** (− · 96px track `#d0d0d0` with white knob at center · + · "100%").

---

## Interactions & behavior

All interactions in the prototype are **synchronous UI-state toggles** (no async, no animation). In production, add subtle transitions per the Staples motion guidance (≈150ms ease on hover/active; no bounce/spring).

- **Ribbon tabs** (Home/Insert/Layout/Text): clicking sets the active tab → the command band content swaps and the tab's red underline moves. File/Arrange/View/Help are non-interactive in this mock.
- **Tool selection**: clicking a palette tool makes it the sole active tool (red ring). In production this also sets the canvas cursor/interaction mode and should update the status-bar tool label.
- **Pages / Master pages toggle**: swaps the navigator list.
- **Inspector tabs** (Properties/Text/Align/Page): clicking swaps the panel body and moves the red underline.
- **Hover states** (to add in production, not in mock): buttons/inputs lighten to `#f2f2f2`-ish or show a `1px` border emphasis; primary/red actions darken to `#A30000`; text links underline and shift to `#CC0000`; page thumbnails lift with a heavier shadow.
- **Not yet wired (real editor must add):** object drag/drop/resize/rotate on the canvas, marquee select, guides drag from rulers, snapping, zoom via slider/scroll, page add/reorder, master-page apply, text entry & flow, undo/redo, keyboard shortcuts (ship a Publisher-familiar map for veterans).

## State management

Prototype UI state (defaults in **bold**):

- `ribbon`: `home*` | `insert` | `layout` | `text`
- `tool`: `select*` | `text` | `rect` | `ellipse` | `line` | `pic` | `table` | `zoom` | `move`
- `insp`: `props` | `text` | `align` | `page*`
- `pages`: `pages*` | `masters`

Production state the real editor needs (not in the mock):

- **Document model**: pages[] (each with geometry, bleed, margins, orientation, applied master), objects[] (type, x/y/w/h, rotation, z-order, style refs, locked, layer), master pages[], layers[].
- **Selection**: current selection set (drives the Properties tab), active page.
- **Viewport**: zoom level, scroll/pan, guides visibility, unit (in/mm/px/pt), snapping on/off.
- **Styles**: paragraph/character/object style registry (edits propagate across the doc).
- **History**: undo/redo stack, optional version history.
- **Catalog binding**: optional SKU → trim/bleed/safe-area/color-profile ("born correct"); Custom when unbound.
- **Experience level**: Simple/Standard/Pro (surface only; never mutates the file).
- **Data fetching**: catalog product specs & templates; open/save the publication; (later) fetch artwork from an order.

## Design tokens

**Color**
- Brand red `#CC0000` (actions, active/selected, warnings) · red tint `#FBEBEB` (active fills) · pressed red `#A30000` (hover on primary, per DS).
- Link blue `#086DD2` · guide blue `#9fb6df` · bleed-mark `#b58686`.
- Chrome greys: title/tabs `#f0f0f0` · ribbon band `#f7f7f7` · tool palette `#f4f4f4` · status/segmented track `#ececec` · rulers `#ededed` · empty-state `#fafafa` · pasteboard `#d3d3d3`.
- Borders/dividers: `#e0e0e0` `#e2e2e2` `#e4e4e4` `#e6e6e6` `#ececec` `#efefef` · input border `#d6d6d6` · button border `#dcdcdc` · dashed-tile `#cfcfcf` · ruler ticks `#c4c4c4`.
- Text: primary `#333` · controls/icons `#555`/`#666` · muted `#777`/`#888` · placeholder/hint `#999`/`#aaa` · label `#5f5f5f`.

**Typography** — Staples **Motiva Sans** (Light 300 body, Regular 400, Medium 500, Bold 700; loaded via `_ds/.../colors_and_type.css`). UI text in this desktop tool runs dense: labels 9.5–11px, controls 11–12px, doc name 13px. Section labels (`.wf-h`): 11px/700, uppercase, letter-spacing .04em, `#5f5f5f`.

**Radius** — card 4 · buttons/inputs/pills 5 · tool buttons 6 (active ring 7) · (DS scale: xs 4, sm 6, md 8, lg 12). Page corners are **sharp**.

**Elevation** — card `0 1px 4px rgba(0,0,0,.12)` · page `0 3px 16px rgba(0,0,0,.22)` · segmented/knob `0 1px 2px rgba(0,0,0,.12)`.

**Spacing** — 4px base grid.

**Active-state pattern** — red 2px underline (tabs), red 2px ring + faint red fill (tools/thumbnails), white pill w/ shadow (segmented).

## Assets

- **Icons:** inline **Lucide-style** monochrome SVGs (stroke ≈1.6, `currentColor`), stand-ins for the real Staples icon set — replace with the production icon library. Used: cursor/select, T (text), rectangle, ellipse, line, image, table (grid), magnifier (zoom), 4-way move, scissors (cut), copy, clipboard (paste), find (magnifier), alignment glyphs, add-page, master-pages, text-box, shapes, hyperlink (chain).
- **Staples wordmark:** rendered as a red text chip placeholder. Real mark: `_ds/staples-print-design-system-…/assets/staples-logo.svg`.
- **Font:** Staples Norms Pro / **Motiva Sans** per the bound design system.
- No photography or raster assets (blank publication).

## Files

In this bundle:
- **`Layout Editor (offline).html`** — self-contained, **runnable** reference. Open in any browser to interact with the prototype (ribbon tabs, tools, pages toggle, inspector tabs). Start here.
- **`Layout Editor.dc.html`** — the annotated **source** for the same editor (template + logic class). Human-readable reference; it depends on project runtime/design-system files, so it won't run standalone from this folder — use the offline HTML to run it.

In the wider project (for context, not in this zip):
- **`Store Tools Wireframes.dc.html` › Section J** — the same editor inside the full suite wireframe set, with numbered anatomy annotations (Title bar, Ribbon, Tool palette, Pages pane, Rulers, Publication page, Inspector, Status bar).
- **`uploads/Store_Tools_Suite_Feature_Requirements.md` › §8.3** — the functional requirements this editor serves (master pages, linked text flow, styles, tables, custom/large-format sizes, born-correct catalog binding, multi-surface pages).

## Functional scope this editor grows into (§8.3)

The at-rest shell here is the foundation for: measurement-driven placement with **guides, snapping, rulers**; **master pages** with per-page overrides; **linked text boxes with automatic text flow** (story threading); **text wrap** around objects; **paragraph/character/object styles** that propagate across a multi-page job; **tables**; **multi-page & multi-surface** navigation (front/back/flap, each with its own geometry/bleed/orientation); drag-and-drop WYSIWYG, layers, grouping, alignment, **undo/redo**, version history; **custom, odd, and large-format sizes** (posters/banners) beyond the old image-tool ceiling; and **re-laying a supplied file to a different target size** as a first-class workflow. Sizes should be **born correct** from catalog SKU specs where the publication is tied to a product.
