# Handoff: Store Tools Suite — Photo Editor

## Overview
The **Photo Editor** is the raster quick-fix surface of the Staples in-store **Store Tools Suite** — a replacement for Photoshop Elements / Adobe Express used by associates at a print station. The mental model is deliberately narrow: **one image in, one print-ready image out.** An associate opens a customer's photo (often attached to a print order), makes fast corrections (crop, enhance, fix-for-print, add text/logo, clean up), and exports a file that will print correctly.

It shares its shell language with the sibling **Layout Editor** (title bar, red active states, guide colors, status bar) so the two tools feel like one product. This handoff also documents how the Photo Editor is entered *from* the Layout Editor when an associate edits a picture placed on a page.

Target environment: **desktop, in-store station** (mouse + keyboard, single large screen). Not responsive/mobile.

## About the Design Files
The file in this bundle — `Photo Editor Wireframes.dc.html` — is a **design reference created in HTML**, not production code to copy directly. It is a single interactive wireframe canvas showing the intended layout, structure, states, and behavior of the Photo Editor.

Your task is to **recreate these designs in the target codebase's existing environment** (React, Vue, native, etc.), using its established component library, state patterns, and conventions. If no environment exists yet, choose the most appropriate framework for an in-store desktop tool and implement there. Do **not** ship the HTML wireframe as-is.

`support.js` is the tiny runtime that renders the wireframe file; it is included only so the HTML opens standalone for reference. It is **not** part of what you build.

## Fidelity
**Low-fidelity → mid-fidelity wireframes.** These communicate **layout, structure, hierarchy, states, copy, and flow** — not final visual design. Placeholder gray rectangles (`#dcdcdc`/`#d3d3d3`) stand in for real photos and product imagery.

Apply the **Staples Print Design System** for all styling (colors, type, spacing, components, iconography). Treat exact pixel values below as *proportional intent*, not pixel-perfect targets. The one thing that is prescriptive and must be preserved: the **red active-state / print-check color logic** (see Design Tokens) — it is the core of the interaction model.

Icons in the wireframe are inline SVGs approximating **Lucide** (the design system's substitute set). Use the codebase's real icon set.

---

## Screens / Views

The wireframe is a single annotated canvas with six labelled sections (A–F). Each is documented below.

### A · The editor — full shell (the primary screen)
`data-screen-label="A · Photo editor — Crop active"`

**Purpose:** The everyday working surface. An associate lands here with a photo open and does the whole job without leaving.

**Layout:** A single application window (no floating palettes, no stacked dialogs). Top-to-bottom, then a three-column work area:

1. **Title bar** (40px, `#f0f0f0`, 1px `#e0e0e0` bottom border) — left→right: red "Staples" badge, filename (`IMG_4823.heic`), muted metadata (`· 4032 × 3024 px · 12.1 MP`), an **order-context chip** (`From order #58291 · S. Mitchell`, boxed `#f7f7f7`/1px `#ddd`). Right side: **Simple / Standard / Pro** segmented control (active = white pill with shadow), store label (`Store #1284`), circular help `?`, and window controls (`— ▢ ✕`).
2. **Action bar** (44px, `#fafafa`) — left: undo/redo (redo dimmed at 0.45 opacity), divider, **Auto-enhance** (red sparkle icon), **Compare** (with muted `hold` hint). Right, under a bold uppercase `QUICK FIXES` label: three pinned buttons — **Fix bleed**, **Fit to size**, **Convert format** (each 30px tall, 1px `#d6d6d6`, red icon + 600-weight label), divider, `⋯` overflow.
3. **Task rail** (78px, `#f4f4f4`, 1px `#e4e4e4` right border) — six 64×52px tiles stacked with 7px gap: **Crop**, **Adjust**, **Fix for print**, **Text & image**, **Clean up**; a `flex:1` spacer + 44px divider; then **Export** pinned at the bottom. Each tile = icon over 9px label. **Active tile** shows a red inset ring (`inset:-2px; border:2px solid #CC0000; background:rgba(204,0,0,.05)`).
4. **Print-correctness strip** (36px, white, 1px `#e6e6e6` bottom) — pinned above the canvas. Segments separated by 1px dividers: pixel dims (`4032 × 3024 px`), `Target: 4 × 6 in photo print` + blue `Change ▾` link, the **DPI check chip** (green/amber/red — see below), `Bleed: not set` + red `Add →`, `sRGB · converted for press at export`, and a right-pinned `History · 6` button.
5. **Canvas / pasteboard** (`flex:1`, `#d3d3d3`) — a centered photo proxy (600×400 gray with a camera glyph) with a top caption (`IMG_4823 · target 4 × 6 in · 38%`). Tool-specific overlays render on top (crop rule-of-thirds grid + handles; fix-for-print trim/bleed/safe dashed guides + a legend card bottom-right; text/logo bounding boxes; clean-up brushed-area highlight). Floating hint/approve cards appear per tool (adjust: "hold Space to see original"; clean up: Preview + Apply/Discard bar).
6. **Contextual panel** (268px, white, 1px `#ececec` left border) — **only present while a tool is active**; the `✕` in its header closes it (returns to no-tool state). Header = uppercase 11px task title. Body swaps per tool (documented under Interactions).

### B · The six contextual panels
`data-screen-label="B · Contextual panels"` — the panel bodies shown side by side for reference:

- **Crop & straighten:** Aspect grid (Free, Original, 1:1, **4 × 6** active, 5 × 7, 8 × 10, Letter, Business card) + "Product size from catalog…" dropdown; Shape segmented (Rectangle / Rounded / Circle); Straighten slider (centered detent) + Auto; Rotate & flip (4 icon buttons); footer **Apply crop** (red, flex 1.4) + **Reset** (outline).
- **Adjust:** **Auto-enhance** primary (red-tinted). **Light** group sliders: Brightness `+12`, Contrast `0`, Exposure `0`, Highlights `−20`, Shadows `+15`. **Color** group: Saturation `0`, Warmth `+5`. Collapsed **More · levels, curves, sharpen, noise** row with a `PRO` badge.
- **Fix for print:** Target print size dropdown (`4 × 6 in · glossy photo`) + "Pick a catalog product →"; Effective-resolution card with green `672 DPI` chip; **Bleed** primary "Expand to bleed · 0.125 in" + Edge fill dropdown (`Auto (mirror)`); **Fit to size** = Fit/Fill segmented + 3×3 anchor grid (center active); Upscale placeholder (offered only when resolution drops); "New to bleed? 60-second guide →".
- **Text & image:** **Add text** / **Add image** buttons; **On this image** layer list (active `SUMMER SALE` text layer red-tinted, `logo.png` layer); **Character** controls (Motiva Sans font dropdown, 24 pt size, B / I / color, align segment).
- **Clean up:** Tool grid — **Remove object** (active), Spot heal, Red-eye, Remove background; Brush size slider (`40 px`, red fill); explainer card; **Fix an AI-generated file** one-click card; note that heavy work runs server-side.
- **Export:** Format group (documented as the pExport panel; see `pExport` in source — same panel column pattern).

### C · Print-correctness strip — three states + Fix bleed
`data-screen-label="C · Print-correctness strip states"` and `"C · Fix bleed before/after"`

The DPI chip is **advisory, never blocking** — amber and red are clickable and offer a fix; the associate always decides.
- **Green** (`#EEF6EF` bg / `#cfe3d2` border / `#357040` text, `#4c9a5c` dot): `672 DPI — great at 4 × 6`.
- **Amber** (`#FCF3E6` / `#ecd9b8` / `#9a6a1a`, `#c98a2b` dot): `148 DPI — may look soft` + underlined `Fix →`.
- **Red** (`#FBEBEB` / `#f0c9c9` / `#9a1818`, `#CC0000` dot): `72 DPI — too low at this size` + underlined `Upscale →`.

**Fix bleed before/after:** Two 520×330 cards. *Before* — artwork ends at the trim line, red-dashed bleed zone empty, warning "white slivers when cut". *After* — one click extends edges into the bleed (hatched fill), with an **Edge fill** popover (Mirror·auto active / Smear / Solid + Apply) and a green "Edges extended 0.125 in — passes the cut check" confirmation.

### D · Working states — rescue, history, approve
`data-screen-label="D · Working states"` — three cards:
- **Low-res rescue:** amber `148 DPI at 8 × 10` badge over a pixelated proxy; honest upscale offer card ("Upscale on the server — about 10 seconds… It cannot invent detail that isn't there." → **Upscale to ~300 DPI** / **Print as-is**). Runs async.
- **Before/after + history:** split-view slider (Before / After handle) + press-and-hold to peek; **History** panel listing named steps (Open IMG_4823.heic → Auto-enhance → Crop to 4 × 6 → Brightness +12 → Straighten −1.2° → **Expand bleed 0.125 in** active). Click any step to go back. Autosaved continuously.
- **Clean up approve:** AI inpaint returns as a **previewed, approvable step** (Preview · date stamp removed → Apply / Discard). Applying adds a reversible "Remove object" history entry.

### E · Simple / Standard / Pro
`data-screen-label="E · Experience levels"` — three miniatures of the same file at different densities. The level changes **control density only, never the file** (progressive disclosure, never amputation — Pro always reachable from Standard).
- **Simple:** Crop + Auto-enhance + the three quick fixes. Rail holds Crop and Export only. Covers ~80% of counter jobs.
- **Standard (default, = Section A):** full six-task rail, contextual panel, undo/redo, compare.
- **Pro:** adds levels / curves-lite and numeric entry everywhere. Same panels, denser — no floating palettes, no workspace config.

### F · Editing an image placed in the Layout Editor
`data-screen-label="F · Edit placed image — flow options"` and `"F · Recommendation"` — the cross-tool flow, two options, **both recommended together**:
- **F1 · Stay in layout** (`#f1`): selecting a picture reveals a **"Picture" inspector tab** with the four most-used fixes (placed-size DPI check `318 DPI`, Auto-enhance, Brightness/Contrast, Crop to frame) + an **Edit in Photo Editor →** escape hatch. No context switch.
- **F2 · Round-trip** (`#f2`): double-click / "Edit in Photo Editor" opens the **full Photo Editor** with a red **return banner** ("Editing picture from 'Spring flyer' · returns as one step" + Done / Cancel). Export is hidden — **Done** replaces it and lands back on the page. Needs a <2 s open to feel instant.
- **Recommendation (REC card):** ship **F1 + F2 together**. Inline quick fixes for everyday cases; round-trip for everything else. The edit is a non-destructive **recipe on the placed instance** — original file untouched, "Revert photo edits" stays in the layout's history as one named, revertable step.

---

## Interactions & Behavior

- **Task selection (rail):** clicking a rail tile sets the active tool → highlights the tile (red inset ring), opens the contextual panel with that tool's body, and shows that tool's canvas overlay. In the source this is `state.tool` (`crop | adjust | fixprint | text | cleanup | export | none`).
- **Closing a panel:** the panel-header `✕` sets tool to `none` → panel hidden, no overlay, canvas shows "drag to pan, pick a task on the left".
- **Quick fixes (action bar):** `Fix bleed` and `Fit to size` open the **Fix for print** tool; `Convert format` opens **Export**.
- **Print-check chips:** amber/red chips are clickable and route to a fix (Fix → / Upscale →); never block export.
- **Compare:** press-and-hold to peek at the original (also available as press-and-hold anywhere in before/after view, plus a split-view slider).
- **Adjustments:** sliders preview live on the proxy; hold Space to see the original.
- **Clean up / AI operations:** run server-side, return as a **previewed step** the associate approves (Apply) or rejects (Discard); the canvas never freezes; async jobs (upscale) can be queued.
- **Non-destructive editing:** every operation is a **named history step**; nothing bakes until Export. Standard undo/redo shortcuts. Clicking a history step reverts to that point. Autosaved continuously (survives crash / station swap).
- **Round-trip (F2):** opening the editor from a layout shows a return banner and hides Export; Done applies the recipe as one history step in the layout and returns to the page.

**Animation:** minimal/functional per the design system — card hover shadow swap + 2px lift (200ms), image tile scale 1.03–1.04 (300ms), button bg crossfade (150ms). No bounce/spring/large transforms.

## State Management
Minimal for the wireframe; the real editor needs more. Core:
- `activeTool: 'crop' | 'adjust' | 'fixprint' | 'text' | 'cleanup' | 'export' | 'none'` — drives rail highlight, panel body, canvas overlay, and status text.
- `experienceLevel: 'simple' | 'standard' | 'pro'` — controls density (which rail tasks / panel controls are shown), not the file.
- `dpiState: 'green' | 'amber' | 'red'` — derived from effective resolution at the current target size; drives the print-check chip. (Exposed as a tweakable prop in the wireframe.)
- `history: Step[]` + `historyIndex` — non-destructive stack of named operations; the export is a render of this recipe.
- Document model: source file (untouched), current target size / product, bleed setting, crop rect, adjustment values, layers (text/image), pending AI-preview step awaiting approve/discard.
- `returnContext` (F2): when opened from the Layout Editor — origin doc name, hides Export, shows Done/Cancel, applies result as one step back in the layout.
- Real data: upscale/inpaint/background-removal are **async server jobs** with queued/running/done states.

## Design Tokens
From the **Staples Print Design System** (`_ds/…/colors_and_type.css`). Values used in the wireframe:

**Color**
- Brand / action / active / primary: `#CC0000` (`--brand`, `--staples-red`). Hover/pressed: `#A30000`.
- Active-tool tint: fill `#FBEBEB`, text/icon `#9a1818`, border `#CC0000` — the recurring "this control is engaged" treatment.
- Print-check **green**: bg `#EEF6EF`, border `#cfe3d2`, text `#357040`, dot `#4c9a5c`.
- Print-check **amber**: bg `#FCF3E6`, border `#ecd9b8`, text `#9a6a1a`, dot `#c98a2b`.
- Print-check **red**: bg `#FBEBEB`, border `#f0c9c9`, text `#9a1818`, dot `#CC0000`.
- Link blue: `#086DD2` (default `a`), hover `#CC0000`.
- Ink / headings: `#1a1a1a` (near-black). Body/secondary text: `#5a5a5a`, `#666`, `#777`; muted `#999`/`#aaa`.
- Surfaces: window white `#fff`; title bar `#f0f0f0`; action bar `#fafafa`; rail `#f4f4f4`; pasteboard `#d3d3d3`; media placeholder `#dcdcdc`.
- Borders / dividers: `#e0e0e0`, `#e2e2e2`, `#e4e4e4`, `#e6e6e6`, `#ececec`, `#dcdcdc`, `#d6d6d6`.

**Typography** — Motiva Sans (Light 300 body, Medium 500 emphasis, Bold 700 headings). Wireframe sizes: section titles 20/700, screen captions 11/600 `#777`, panel section heads 11px uppercase `.04em` `#5f5f5f` (`.wf-h`), body controls 11–13px. Apply the design system's real web type scale in production (H1 32/40 … Body 16/24).

**Radius** — buttons ~5–6px (`--r-sm`), cards 4–8px, chips/pills fully rounded (10px pill on check chips). Media placeholders in the DS use `10px 10px 20px 20px`.

**Shadow** — cards `0 1px 4px rgba(0,0,0,.12)` resting → `0 2px 8px / 0 3px 14px rgba(0,0,0,.16–.22)` for lifted proxies/popovers.

**Spacing** — 4px base grid; rail 78px, contextual panel 268px, gaps 5–20px.

## Assets
No external image assets — all product/photo imagery is intentionally **gray placeholder** (`#dcdcdc` proxies with a camera glyph). Icons are inline SVGs approximating **Lucide** (crop, sliders, printer, type, healing/eraser, download, undo/redo, sparkle, clock, etc.). In production, use the codebase's real icon set and real photography. The red "Staples" wordmark badge is a placeholder — use the official logo. The Staples Print Design System bundle lives at `_ds/staples-print-design-system-019e2687-1db4-7a98-aa24-6f47c5847cec/` in the source project for reference tokens.

## Files
- `Photo Editor Wireframes.dc.html` — the full annotated wireframe canvas (Sections A–F). Open in a browser to explore; the active-tool interaction (rail → panel/overlay) is live.
- `support.js` — wireframe runtime (reference only; not part of the build).
- `screenshots/` — rendered captures of the wireframe for quick reference.
