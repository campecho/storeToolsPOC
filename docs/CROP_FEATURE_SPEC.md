# Crop & Straighten — Portable Feature Specification

**Status:** self-contained, repo-agnostic. This document distills the crop feature of the
Store Tools POC Photo Editor (sources: `docs/PHOTO_EDITOR_PLAN.md`,
`docs/PHOTO_EDITOR_IMPLEMENTATION_PLAN.md`, `docs/handoff/photo-editor/`) into a single
spec that can be dropped into another codebase. Nothing below references files, stores, or
conventions of the source repo; where the source design was silent, the decision is made
explicit here and flagged in §14.

**What it is:** the "Crop & straighten" tool of a single-image raster editor — freeform and
fixed-ratio crop, shape crop (rectangle/rounded/circle), straighten, quarter-rotate, and
flip — implemented **non-destructively**: every action is a typed operation in an ordered
edit recipe; nothing bakes into pixels until export.

---

## 1. Purpose & scope

Cropping/resizing is the single most common task at the counter this tool was designed for
(97% of surveyed jobs). The bar is speed: instant open, instant crop, direct manipulation.

In scope:

- Crop rectangle with drag handles, ratio presets, and ratio lock
- Shape crop: Rectangle / Rounded / Circle (applied as a mask at export)
- Straighten (fine rotation, ±15°) with slider and live grid
- Quarter rotate (CW/CCW) and flip (horizontal/vertical)
- Named-step history with cursor undo/redo for all of the above
- Effective-DPI feedback while cropping (advisory, never blocking)

Out of scope (integration seams, see §15): catalog/product-size crop binding,
auto-straighten (horizon detection), upscaling, any AI feature.

## 2. Host assumptions

The feature is specified against a minimal host contract, not a specific stack:

1. **A document model** holding a source image reference (immutable original), an ordered
   `recipe` of typed ops, and a `cursor` (ops `[0..cursor)` are applied; the rest is the
   redo tail). Undo = `cursor − 1`, redo = `cursor + 1`, a new edit truncates the tail.
2. **A client canvas** rendering a screen-sized proxy of the image (the POC caps the proxy
   at ~2048 px long edge — small enough for instant redraw, large enough to judge a crop).
   Plain Canvas 2D is sufficient; no canvas library is required. Crop handles and grid are
   DOM overlays positioned above the canvas, not canvas-drawn.
3. **An export path that replays the recipe** against the full-resolution original — ideally
   server-side through a real image engine (e.g. sharp/libvips). Determinism is the
   contract: same recipe + same bytes + same engine → same output.
4. Optionally, a **target print size** concept (inches) — it powers the DPI chip (§8). If
   the host has no print context, omit the chip; everything else stands.

Geometry math must live in a **pure, dependency-free module** (no DOM, no canvas), so the
same code can run client-side for preview and server-side for replay, and so it is
trivially unit-testable — this is the property that makes the feature portable.

## 3. Operation model

Ops are a discriminated union on an `op` tag. The crop tool emits four kinds:

```ts
type GeometryOp =
  | { op: "rotate";     quarter: 1 | -1 }                 // 90° CW / CCW
  | { op: "flip";       axis: "horizontal" | "vertical" }
  | { op: "straighten"; degrees: number }                 // fine rotation, -15..15, 0.1° steps
  | { op: "crop";       rect: Rect;                       // px, in current-image space (§4)
                        ratio?: { w: number; h: number }; // present when a preset locked it
                        shape: "rect" | "rounded" | "circle" };

type Rect = { x: number; y: number; w: number; h: number }; // integers, px
```

Rules:

- **Array order is application order.** No implicit reordering.
- **Ops are stored explicit.** Anything computed (e.g. a future auto-straighten) writes the
  concrete value it chose, so replay never re-derives.
- **Every op carries a human label** for the history UI (canonical strings, §10).
- While a gesture is live (handle drag, slider drag), the trailing op is mutated
  *transiently*; it is committed as one history step on release — a drag is one undo step,
  not sixty.
- Repeated adjustments to the *pending* crop (before Apply) edit the same pending state;
  **Apply crop** is what appends the committed `crop` op (§7). Straighten/rotate/flip
  commit immediately on release/click, each as its own step.

## 4. Geometry semantics

These conventions remove every ambiguity a reimplementation would otherwise hit:

1. **Current-image space.** Each geometry op is interpreted in the coordinate space of the
   image *as of that point in the recipe* — i.e. after all prior ops. A `crop.rect` is in
   the pixel space produced by the ops before it. This keeps every op self-describing and
   replay a simple left fold: `image = apply(op, image)`.
2. **EXIF orientation is not an op.** The host normalizes orientation at intake; the recipe
   starts from an upright image.
3. **Straighten rotates about the image center** and conceptually enlarges the canvas
   (no pixels are lost by the rotation itself — loss happens only via crop).
4. **Auto-shrink on straighten:** while the straighten slider moves with a crop pending,
   the pending crop rect is scaled (about its own center, ratio preserved) to the largest
   size that stays fully inside the rotated image — the standard "no blank corners"
   behavior. The largest-inscribed-rectangle math for a w×h rect rotated by θ is part of
   the pure geometry module and is unit-tested.
5. **Ratio lock:** when a ratio preset is active, handle drags solve for the locked
   aspect; corner handles scale both axes, edge handles scale the locked counterpart axis.
   Presets with a physical orientation (4×6, 5×7, 8×10, Letter, Business card) adopt the
   orientation of the current pending rect (landscape source → 6×4), and swapping
   orientation is done by dragging past square or picking the preset again.
6. **Ratio presets map to:** Free (unlocked) · Original (source aspect) · 1:1 · 4×6 · 5×7 ·
   8×10 · Letter (8.5×11) · Business card (3.5×2).
7. **Shape** is metadata on the crop op; the rect geometry is identical for all three:
   - `rect` — plain rectangular crop.
   - `rounded` — corner radius = 8% of the rect's short side (baked into replay so client
     and server agree).
   - `circle` — an ellipse inscribed in the rect (a true circle when the ratio is 1:1; the
     UI nudges by auto-selecting 1:1 when Circle is chosen and the ratio is Free).
   Non-rect shapes export with alpha where the format supports it (PNG); formats without
   alpha (JPEG) composite on white. See flags in §14.
8. **Effective DPI** at a target print size uses min-axis arithmetic with orientation
   matched (long image side against long print side):
   `dpi = floor(min(longPx / longIn, shortPx / shortIn))`.

## 5. UI — the Crop & straighten panel

One contextual panel (the source design: 268 px right-hand panel, present only while the
tool is active; a `✕` in its header deactivates the tool). Body, top to bottom:

1. **Aspect** — a 2-column grid of preset chips: `Free · Original · 1:1 · 4×6 · 5×7 ·
   8×10 · Letter · Business card`. One active at a time (active = brand-tinted chip).
   Below the grid, a full-width **"Product size from catalog…"** dropdown — an integration
   seam for hosts with a product catalog; render disabled/hidden otherwise.
2. **Shape** — a 3-way segmented control: `Rectangle / Rounded / Circle`.
3. **Straighten** — a slider with a centered detent, current value readout (`0.0°`,
   0.1° precision, range ±15°), and an **Auto** button beside it (auto-straighten is a
   seam: render disabled until a horizon detector exists).
4. **Rotate & flip** — four icon buttons in a row: rotate CCW, rotate CW, flip
   horizontal, flip vertical.
5. **Footer** — **Apply crop** (primary, ~1.4× the width of its neighbor) + **Reset**
   (outline).

## 6. UI — the canvas overlay

Rendered above the image whenever the tool is active:

- **Mask:** the area outside the pending crop rect is dimmed (`rgba(23,23,23,.30)`), drawn
  as four rectangles (top/bottom/left/right) so the crop window itself stays untinted.
- **Crop border:** 1.5 px white with a subtle 1 px dark outline for visibility on any image.
- **Rule-of-thirds grid:** two vertical + two horizontal 1 px lines at 1/3 and 2/3
  (`rgba(255,255,255,.6)`), always shown while the tool is active.
- **8 handles:** 9×9 px white squares with a 1 px gray border — 4 corners + 4 edge
  midpoints.
- **Floating size/DPI chip** just below the rect: current crop expressed against the
  target (e.g. `4 × 6 in · still 300+ DPI`) or, with no print target, the pixel size
  (`1830 × 1220 px`). Advisory only.
- For `rounded`/`circle` shapes, the border preview follows the shape (rounded outline /
  inscribed ellipse) while mask and handles keep tracking the bounding rect.

## 7. Interactions

- **Activate** (rail tile / toolbar entry): overlay appears with a pending rect = full
  image (or the last committed crop when re-entering), panel opens, status line updates.
- **Drag a handle** to resize (pointer capture; ratio lock per §4.5; min size 32×32
  source px; clamped to image bounds). **Drag inside the rect** to move it. Cursor
  feedback per handle direction.
- **Pick an aspect preset**: pending rect snaps to the largest rect of that ratio that
  fits the current image, centered on the previous rect's center.
- **Straighten slider**: image rotates live behind the overlay with the grid visible;
  auto-shrink per §4.4. Commits a `straighten` op on release. The straighten value shown
  is cumulative (the sum of committed straighten ops), and moving the slider *replaces*
  the trailing straighten op rather than stacking a new one — one slider, one step,
  amendable until another op type intervenes.
- **Rotate/flip buttons**: commit `rotate`/`flip` ops immediately, one step each. The
  pending crop rect is transformed along with the image (it stays over the same pixels).
- **Apply crop**: commits the `crop` op, overlay collapses to the new image bounds, chip
  and any DPI indicators recompute. The button is disabled while the pending rect equals
  the full image and no shape other than `rect` is selected (nothing to apply).
- **Reset**: clears the pending (uncommitted) state back to full image / Free / Rectangle /
  0.0°. It does **not** revert committed ops — that is what undo/history is for.
- **Keyboard:** arrows nudge the pending rect 1 px (Shift = 10 px); Enter = Apply crop;
  Esc = Reset (first press) / deactivate tool (second).
- **Compare peek** (if the host has it): press-and-hold shows the unedited original.

## 8. Print feedback (optional but recommended)

If the host knows a target print size, cropping drives an **effective-DPI check** that is
*advisory, never blocking*:

| State | Condition (default thresholds) | Copy pattern |
|---|---|---|
| green | dpi ≥ 300 | `672 DPI — great at 4 × 6` |
| amber | 100 ≤ dpi < 300 | `120 DPI — may look soft` |
| red | dpi < 100 | `56 DPI — too low at this size` |

Thresholds are configuration, not law. The chip (or strip segment) recomputes live as the
crop rect changes; amber/red may link to a fix (resize target, upscale) but must never
prevent applying the crop or exporting.

## 9. History & undo

- Committed ops appear in the host's history UI as named steps; clicking a step moves the
  cursor to that point (the canvas re-renders the recipe prefix).
- Undo/redo = cursor moves with standard shortcuts (⌘Z / ⌘⇧Z or Ctrl equivalents).
- A new committed op while the cursor is mid-recipe truncates the redo tail.
- The document (recipe + cursor) autosaves continuously and survives reload mid-recipe.

## 10. Canonical copy strings

History step labels (used verbatim in tests):

- `Crop to 4 × 6` (preset name; `Crop to free` → `Crop` with pixel size, e.g. `Crop to 1830 × 1220 px`; shape suffix when not rect: `Crop to 1:1 · circle`)
- `Rotate 90° right` / `Rotate 90° left`
- `Flip horizontal` / `Flip vertical`
- `Straighten −1.2°`

Status line while the tool is active: `Crop · drag the handles — rule-of-thirds shown`.
Non-destructive reassurance (host status bar): `Autosaved · edits are steps, nothing bakes
until export.`

## 11. Visual tokens

The source design system is replaceable; restyle to the target codebase's system. Two
things carried semantic weight in the original and are worth preserving *as roles*:

- **Active-tool / active-preset treatment:** a single unmistakable "engaged" tint used for
  the active rail tile ring and the active aspect chip (source values: border `#CC0000`,
  fill `#FBEBEB`, text `#9a1818`).
- **Check-state palette** for the DPI chip: distinct green/amber/red chip styles (source:
  green `#EEF6EF/#357040`, amber `#FCF3E6/#9a6a1a`, red `#FBEBEB/#9a1818`).

Motion is minimal/functional: ~150–300 ms fades and small lifts; no spring/bounce.

## 12. Worked examples (commit these as test fixtures)

DPI math (§4.8):

| Source px | Target | Computed DPI | State |
|---|---|---|---|
| 4032 × 3024 | 4 × 6 in | **672** | green |
| 1280 × 960 | 8 × 10 in | **120** | amber |
| 1200 × 900 | 16 × 20 in | **56** | red |
| 1272 × 954 | 4 × 3 in | **318** | green |

(The source wireframe printed 148 and 72 for rows 2–3; those numbers do not survive the
min-axis arithmetic and were flagged back to the designer. Tests assert the computed
values — the UI must never display a number the math can't reproduce.)

Geometry cases to pin down in unit tests:

- Quarter-rotate: `rect{x,y,w,h}` in a W×H image maps to `{H−y−h, x, h, w}` under 90° CW
  and `{y, W−x−w, h, w}` under 90° CCW; flips mirror `x` (horizontal: `x → W−x−w`) or `y`.
  Assert all four on asymmetric fixtures.
- Straighten auto-shrink: a locked 3:2 rect in a 6000×4000 image at θ = 5° scales to the
  largest inscribed 3:2 rect — assert against a hand-computed value.
- Ratio snap: picking `1:1` in a 4032×3024 image with a full-image pending rect yields a
  centered 3024×3024 rect.
- Clamping: dragging any handle past the image edge clamps; min size 32×32 holds.

## 13. Acceptance criteria

1. The chain **crop → straighten → undo → redo** is solid: each step lands as one named
   history entry, undo/redo traverse it exactly, and the document persists mid-recipe
   across a reload.
2. History shows the canonical step names of §10.
3. A full-resolution export replays the recipe and matches the client preview within a
   pixel-diff tolerance (geometry may resample differently client vs. server; a committed
   golden-image harness gates drift).
4. Same recipe + same bytes ⇒ byte-identical export across two runs.
5. All §12 fixtures pass as unit tests of the pure geometry module.
6. An end-to-end test drives open → set aspect → drag a handle → apply → straighten →
   undo → redo → export through the real UI (stable `data-testid` hooks on the handles,
   presets, slider, and footer buttons).
7. Every drag responds within a per-frame budget on a low-end target (source budget:
   <100 ms per proxy repaint on integrated graphics; the proxy cap of §2.2 is what makes
   this achievable).
8. DPI chips are advisory: red/amber never disable Apply crop or export.

## 14. Decisions made here (flag if your product disagrees)

The source design left these unspecified; this spec resolves them so two implementations
agree. Change them consciously, not accidentally:

1. Crop rects in **current-image space** (§4.1) — the alternative (always source space)
   makes ops non-local and replay stateful.
2. Straighten **auto-shrinks** the pending crop (§4.4) rather than exposing blank corners
   or auto-filling them.
3. Straighten slider **amends** its trailing op until another op type intervenes (§7).
4. Rounded radius = **8% of short side**; Circle = **inscribed ellipse** (§4.7).
5. Non-alpha export formats composite shaped crops **on white** (§4.7).
6. Reset clears **pending** state only, never committed history (§7).
7. Default DPI thresholds **300/100** (§8) — chosen to reproduce every worked example's
   verdict; make them configuration.

## 15. Integration seams (design for them, don't build them)

- **Catalog crop:** the "Product size from catalog…" dropdown binds a crop ratio to a
  product SKU. Keep the preset list data-driven (a `{label, w, h}` table) so catalog
  entries can join it later.
- **Auto-straighten:** the panel's Auto button; wire to a horizon detector when one
  exists, disabled until then. When it lands it must *write the explicit degrees* it
  chose (§3).
- **Upscale / low-res rescue:** the red DPI state may offer an upscale action; the crop
  feature only needs to route to it, never to implement it.
- **Placed-image round-trip:** if a sibling layout tool embeds this editor, the committed
  recipe (not flattened pixels) is what returns, applied as one named, revertable step in
  the host document.
