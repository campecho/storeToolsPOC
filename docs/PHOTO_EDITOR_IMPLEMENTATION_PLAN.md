# Photo Editor — POC Implementation Plan

**Scope of this plan:** the build plan for the **Photo Editor** (the raster quick-fix surface, `docs/PHOTO_EDITOR_PLAN.md`) inside this POC — mounted behind the homepage's **Photo Edit** card at the reserved `/photo` route. It maps the feature plan's E0–E8 tranche model onto this codebase's actual state and conventions, reconciles the places where the feature plan's assumptions and the repo diverge (§1.2), and sequences the work as PE0–PE10: one commit per step, each demoable, walking-skeleton first.

**Revision (v1.0, 2026-07-07):** initial plan, written against the L13/P5-era codebase (layout editor DOM/SVG-rendered, `.pub` import live, no server image stack, no export path anywhere in the repo yet).

**Revision (v1.1, 2026-07-07):** **the design handoff package landed** (`docs/handoff/photo-editor/` — README spec + `Photo Editor Wireframes.dc.html`, Sections A–F), replacing v1.0's mid-fidelity-from-spec posture. (1) **§2 is re-baselined on the wires**: the fidelity contract now follows the wireframe's shell anatomy exactly (action bar with the pinned "Quick fixes" group, six-tile task rail with Export pinned, print-correctness strip with the right-pinned History button, status bar, no-tool state), and the deviations are re-derived. (2) **The component map is restructured** (§3.2): the three quick fixes live in the action bar and *navigate to panels* rather than applying operations; Fix for print and Text & image are each one consolidated panel; Export is the rail-task contextual panel, not a dialog; history docks from the strip button. (3) **Section F adds new scope**: editing a picture placed in the Layout Editor — the round-trip (F2: return banner, Done/Cancel, Export suppressed, edit applied back as one named revertable layout step) is the new **PE8**; the inline Picture inspector tab (F1) is layout-editor scope, recorded in that plan's backlog. Clean up and hardening renumber to **PE9/PE10**. (4) Wire-derived details adopted throughout: bleed gains the **smear** strategy, crop gains **Shape (Rectangle/Rounded/Circle)** and the Free/Original/Letter aspect set (wallet dropped), the adjust panel's display label is **Warmth** (schema param stays `temperature`), and the DPI worked examples (672/148/72/318) become test fixtures. (5) Newly designed-but-deferred controls (Pro level, CMYK-intent toggle, model-backed Clean up tools, upscale, order chip/save-back) render as **visible-but-inert** per the wires, each with an honest state — deviations #2–#7.

**Inputs reviewed:**

| Input | Where | Role |
|---|---|---|
| Photo Editor feature plan | `docs/PHOTO_EDITOR_PLAN.md` | The what: features, UI requirements, E-tranches, recipe architecture, security §5.3 |
| **Photo Editor design handoff** | `docs/handoff/photo-editor/` (README + `Photo Editor Wireframes.dc.html` + `support.js`) | **The how it looks and behaves: shell anatomy A, six contextual panels B, print-check states C, working states D, experience levels E, placed-image flow F, design tokens** |
| Suite implementation plan | `docs/Store_Tools_Suite_Implementation_Plan.md` | Phase/track model; Photo Editor = Track B, Phase-2 vertical slice ("quick-fix utilities: image crop/resize/convert, one-click bleed") |
| Layout Editor plan | `docs/LAYOUT_EDITOR_PLAN.md` | Sibling-tool conventions: schema/store patterns, guide visuals, §8 Konva decision, §10.1 sandbox posture, §10.7 seam registry rule; receives the F1 backlog entry |
| POC plan | `docs/IMPLEMENTATION_PLAN.md` | Route-group convention (`/photo` reserved, §3.1); homepage mount points (§1.2) |
| Security considerations | `docs/SECURITY_CONSIDERATIONS.md` | Binding image-stack requirements: sandboxed decode [CRITICAL], content-sniff, CDR, AI content-only rules |
| `.pub` import pipeline | `src/lib/import/*`, `src/app/api/import/route.ts` | The repo's only realized "sandboxed native engine behind an API route" — the template PE copies |
| Stub registry | `STUBS.md` | Seams to reuse (blob store, identity, AV hook) and the register-in-same-commit rule |

---

## 1. Review findings

### 1.1 How this fits the suite plan

The Photo Editor is a **Track B vertical slice** onto the Phase-1 walking skeleton. In this POC the "skeleton" it lands on is the same one the `.pub` import proved: a Next.js API route fronting a jailed native engine, a Zod-validated contract between client and server, a Zustand store per tool surface, and the shared suite header/overlay chrome that every route under `src/app/` inherits. The homepage already reserves its mount points — the **Photo Edit** quick-jump card (`src/components/home/QuickJumpRow.tsx`, currently inert) and the `/photo` route group (`docs/IMPLEMENTATION_PLAN.md` §3.1) — and the design handoff now specifies the surface behind them. Wiring the card is a one-line change; everything behind it is this plan.

Suite-plan slice framing: the wireframe's three pinned quick fixes (**Fix bleed · Fit to size · Convert format**) are exactly the suite plan's Phase-2 "quick-fix utilities (image crop/resize/convert, one-click bleed)" — this slice is that capability, grown into the full P1 surface. Note the wire's interaction model: the quick-fix buttons **navigate** (Fix bleed and Fit to size open the Fix for print panel; Convert format opens Export) — they are guaranteed entry points to the fix, not one-shot operations.

### 1.2 Reconciling the feature plan with this codebase (two findings for the doc owner)

1. **The Konva premise is ahead of reality.** `PHOTO_EDITOR_PLAN.md` §5.1 (E0) reads "Canvas 2D via Konva (already the layout-editor choice — reuse the interaction layer)". In this repo Konva is the layout editor's **specified functional-tier** render target (`LAYOUT_EDITOR_PLAN.md` §8, K-tranche) — **not built**. The POC layout editor renders DOM/SVG with a hand-rolled pointer-gesture state machine (`src/components/layout-editor/canvas/CanvasViewport.tsx`); `package.json` contains no canvas library at all. **Resolution (§3.2):** the Photo Editor proxy renders on a plain Canvas 2D `<canvas>` (a raster tool needs a bitmap surface regardless of scene-graph choice), with crop/overlay handles as DOM overlays reusing the layout editor's gesture patterns. No Konva dependency enters at POC; convergence onto the suite Konva stack is tracked as open question #1 alongside the K-tranche. This also answers E0's fallback question the conservative way: **everything stays Canvas 2D; no WebGL** on the UHD 630 fleet.
2. **The server image stack is net-new, not shared.** The feature plan's proxy/recipe/re-render spine assumes a server image engine exists; the app has none — no image dependency in `package.json`, no ImageMagick, no libheif, and **no export/download path anywhere** (open/save/export is a ❌ across the POC). One encouraging footnote: `sharp`/libvips already sits in the lockfile as Next.js's optional image-optimization dependency, resolved to prebuilt linux-x64 binaries — evidence, before PE0 even runs, that the primary engine candidate installs cleanly on this exact runner.

Neither finding changes the feature plan's architecture — the edit-recipe model (§5.2 there) survives intact and is adopted as binding here. They change only what "reuse" means at POC fidelity.

*(One suite-consistency note for the doc owners, from the handoff review: the wires specify a real **Pro** level for this tool — curves, numeric entry — while the Layout Editor deliberately narrowed to two levels in its v1.3 because its Standard was already everything-visible. The two positions are compatible (Pro adds genuine controls here), but the contrast is worth an explicit line in the suite experience-model guidance so it reads as a decision, not drift.)*

### 1.3 Stack review — engine choices to validate in PE0

Per the stack-agnostic rule these are **candidates with a recorded rationale**, confirmed or replaced by PE0 benchmarks:

- **Server raster engine: `sharp` (libvips)** — the feature plan's own primary candidate; npm-installable prebuilt (Node 22, glibc — the Docker runner is already `node:22-bookworm-slim` for exactly this reason), fast, streaming, MIT-licensed (no AGPL exposure, unlike ImageMagick's ecosystem — the suite's recurring licensing concern). Covers JPG/PNG/WEBP/GIF/TIFF/BMP decode+encode, resize, rotate, extend, composite, raw-pixel access, ICC embed.
- **HEIC: `heif-convert` (libheif-examples) as an ingest subprocess**, exactly like `pub2raw` — prebuilt `sharp` does not ship HEIC (patent posture), and building libvips from source is not POC-shaped. Docker installs the package; where absent (plain `npm run dev` on a laptop), HEIC intake degrades honestly (§3.5). SVG likewise rasterizes at ingest via the jailed engine with external entities/scripts disabled.
- **Client proxy surface: Canvas 2D `<canvas>`**, no library. Adjustments compile to per-channel LUTs + a color matrix applied in one pass over proxy `ImageData` (§3.3); geometry uses canvas transforms. Proxy capped at ~2048 px long edge (≈2.6 MP) — small enough for <100 ms single-pass math on the ProDesk, large enough to judge a crop.
- **Parity by shared code, not twin engines:** every pixel-math operation lives in a pure, isomorphic TypeScript module (`src/lib/photo/ops.ts`) that runs on raw RGBA buffers — client feeds it `ImageData`, server feeds it `sharp(...).raw()` buffers. This is the same principle the layout plan uses for text layout ("WYSIWYG is guaranteed by sharing the layout code, not by trusting two engines to agree"). Geometry ops (crop/rotate/resize) run through sharp's resampler server-side; golden tolerance tests own that seam.
- **Upscale / background-removal / inpaint models: out of POC.** Async server-model jobs (Real-ESRGAN-class, rembg-class) are a hosting/cost/DPA decision (feature plan §5.5 #1) the POC can't settle. The POC ships the *seams* (async job contract, previewed-step UX the wires make a hard requirement) and one honest stand-in (§4 PE9).

### 1.4 Technical approach — what the recipe model buys here

**Non-destructive recipe, proxy-edit client, full-res render server** (feature plan §5.2) — adopted verbatim, with the POC twist that the server is stateless:

- **Intake normalizes.** `POST /api/photo/intake` content-sniffs (reusing `src/lib/import/image-meta.ts`, already isomorphic), decodes **in the jail**, applies EXIF orientation, **strips all metadata**, and re-encodes a **working master** (decoded, oriented, sanitized) plus a screen proxy. The original bytes are discarded — this is the CDR posture ("the conversion pipeline is also your best sanitizer") and the PII-ephemerality posture in one move. Master + proxy bytes live client-side in the existing IndexedDB blob store; only their ids and dimensions enter the document.
- **The recipe is the document.** `PhotoDocument` = source ref + target (product/photo size + bleed) + ordered typed ops + cursor. Undo/redo = cursor moves; the history dock = the recipe, named per op (the wires' canonical steps: "Open IMG_4823.heic · Auto-enhance · Crop to 4 × 6 · Brightness +12 · Straighten −1.2° · Expand bleed 0.125 in"); autosave = Zustand `persist` of a small JSON object — all three requirements fall out of one structure, no snapshot stacks (a deliberate divergence from `layout-store.ts`'s snapshot undo, recorded in §3.4). The wire's status bar states it as copy: "Autosaved · edits are steps, nothing bakes until export."
- **Export replays.** `POST /api/photo/render` receives master bytes + recipe (+ pre-rasterized overlay PNGs, §3.3) and replays the ops at full resolution in the jailed render host. Deterministic: same recipe, same engine, same bytes → same output, drift-gated by golden tests. The server holds nothing between requests — consistent with the single-instance, no-backend POC posture.

---

## 2. What we're building (fidelity contract)

The design handoff package is `docs/handoff/photo-editor/` — README spec + `Photo Editor Wireframes.dc.html` (one annotated canvas, Sections A–F, with the rail→panel→overlay interaction live). Fidelity per the package: **low-to-mid-fidelity wireframes — follow layout, structure, hierarchy, states, copy, and flow exactly; apply the suite's shipped styling** (the handoff itself instructs applying the Staples Print Design System rather than the wireframe grayscale). The one prescriptive visual: the **red active-state / print-check color logic** (active tint `#FBEBEB`/`#9a1818`/`#CC0000`; print-check green/amber/red chip palette) — preserved exactly.

**Follow exactly (Sections A–F):**

- **Shell anatomy (A), seven regions top-to-bottom:** title bar (Staples badge · filename · dimensions/MP metadata · order-context chip · Simple/Standard/Pro segmented control · store label · help `?`) → **action bar** (undo/redo · **Auto-enhance** · **Compare (hold)** — and right-aligned under the uppercase **"Quick fixes"** label: **Fix bleed · Fit to size · Convert format**, plus `⋯` overflow) → three-column work row: **task rail** (six tiles: **Crop, Adjust, Fix for print, Text & image, Clean up**, spacer, **Export** pinned at the bottom; active tile = red inset ring) · canvas/pasteboard · **contextual panel** (present only while a tool is active; header `✕` returns to the no-tool state) → **status bar** (per-tool status string · "Autosaved…" · "Editing a screen proxy · full res renders on export" · zoom).
- **Print-correctness strip** pinned above the canvas: pixel dims │ `Target: …` + `Change ▾` │ **DPI check chip** (green/amber/red, size-qualified copy, **advisory never blocking**; amber `Fix →`, red `Upscale →` click through to Fix for print) │ `Bleed: …` + `Add →` │ color-profile note │ right-pinned **`History · N`** button. **History opens from this strip button as a docked panel** — it is not a rail task and not the contextual panel.
- **Quick fixes navigate:** Fix bleed → Fix for print panel; Fit to size → Fix for print panel; Convert format → Export panel.
- **The six contextual panels (B), contents as drawn:** *Crop & straighten* (Aspect grid: Free · Original · 1:1 · 4×6 · 5×7 · 8×10 · Letter · Business card + "Product size from catalog…" dropdown; **Shape**: Rectangle/Rounded/Circle; Straighten slider + Auto; rotate ×2 / flip ×2; **Apply crop** + Reset footer) · *Adjust* (Auto-enhance primary; **Light**: Brightness/Contrast/Exposure/Highlights/Shadows; **Color**: Saturation/**Warmth**; collapsed "More · levels, curves, sharpen, noise" row with `PRO` badge) · *Fix for print* (target print size + catalog link; effective-resolution card; **Bleed** expand + **Edge fill: Auto (mirror) / Smear / Solid**; **Fit to size** Fit/Fill + 3×3 anchor; upscale placeholder; "New to bleed? 60-second guide →") · *Text & image* (Add text / Add image; **"On this image" layer list**; Character controls) · *Clean up* (tool grid: Remove object · Spot heal · Red-eye · Remove background; brush size; "Fix an AI-generated file" card) · *Export* (format grid JPG/PNG/TIFF/**PDF·print**; Quality; **sRGB/CMYK-intent** segment; **Strip photo metadata** toggle; **Export file** + "Save back to order…"; **Send to another tool**: "Open in Layout Editor →", "Resize & imposition · N-up →").
- **Working states (D):** low-res rescue with the honest upscale offer ("Improves smoothness. It cannot invent detail that isn't there." → Upscale / **Print as-is**); split-view before/after slider **plus** press-and-hold peek (Compare button and hold-Space during Adjust); Clean-up results return as a **previewed, approvable step** (Apply/Discard) — suggest, never auto-apply.
- **Experience levels (E):** density only, never the file; **Simple** = Crop + Export rail, quick fixes + Auto-enhance, no contextual panel; **Standard** = the full Section-A surface (default); Pro per deviation #2. Progressive disclosure, never amputation.
- **Placed-image flow (F):** the round-trip (F2) — opened from the Layout Editor, the shell shows a red **return banner** ("Editing picture from '…' · returns as one step"), **Export is hidden and replaced by Done** (+ Cancel), and Done lands the edit back on the page as one named, revertable layout history step. (F1, the layout-side Picture inspector tab, is recorded in the Layout Editor plan's backlog.)
- **Motion:** minimal/functional — hover shadow + 2 px lift (200 ms), tile scale 1.03–1.04 (300 ms), button crossfade (150 ms); no bounce/spring.

**Deviations (numbered, per house convention):**

1. **Suite header retained; wireframe window chrome dropped** — the persistent suite header rides along per the one-shared-surface requirement; the wire's `— ▢ ✕` window controls are prototype chrome and go; a `← Back` affordance is added (same deviation as the layout editor and proof station).
2. **Pro renders, ships later** — the wires fully specify Pro (Section E: curves-lite, numeric entry; the `PRO`-badged "More" row in Adjust). The POC ships Simple/Standard; the Pro segment and the More row render **disabled with an honest "coming" state** so the ceiling reads as reachable. (Contrast with the layout editor, which *dropped* Pro in its v1.3 — see §1.2 note.)
3. **Model-backed Clean up tools render disabled** — Remove object ships at stand-in quality (PE9); Spot heal, Red-eye, Remove background, and the "Fix an AI-generated file" card render in the tool grid **disabled, labeled "coming with the model service."** Same for the low-res rescue's Upscale button (the offer card renders; the action is disabled until hosting is decided).
4. **Order integration `[INT]` renders inert** — the title-bar order-context chip and Export's "Save back to order…" render as designed but disabled (no order model exists in the POC; homepage "Fetch from an order" precedent). The demo photo may carry demo order context so the shell reads true-to-wire.
5. **Catalog pickers inert `[INT]`** — "Product size from catalog…" (Crop) and "Pick a catalog product →" (Fix for print) render, act when the catalog/spec-sync slice lands (same seam as the layout editor's product picker).
6. **CMYK-intent renders, sRGB stays locked active** — the Export segment is drawn as designed; the CMYK side is disabled until press ICC profiles exist (open question #2). Copy explains it.
7. **"Strip photo metadata" toggle renders locked ON** — intake already strips metadata unconditionally (CDR, §3.6), so at POC the toggle is true and immutable, with a tooltip stating metadata was removed when the file was opened. Unlocking it requires the working-master retention decision (open question #3).
8. **Desktop-minimum gate below `lg`** — same honest "needs a bigger screen" card as the layout editor; a precision raster canvas is a station tool.
9. **"Resize & imposition · N-up →" renders inert** — the Print Setup surface doesn't exist yet; the send-to affordance renders with a "coming" state (`fit.ts` documents the shared contract).

---

## 3. Application architecture

### 3.1 Routes

| Route | File | What |
|---|---|---|
| `/photo` | `src/app/photo/page.tsx` | Mounts client-only `<PhotoEditorShell/>`; deep-linkable (`/photo?demo=1` opens the corpus demo photo). The F2 round-trip enters via store-carried `returnContext` (same-tab navigation from the layout editor), not a URL param |
| `GET /api/photo` | `src/app/api/photo/route.ts` | Diagnostics: mode + capability matrix (`{formats: {jpeg, png, webp, tiff, heic, svg}, engine, jailed}`) — the `GET /api/import` pattern |
| `POST /api/photo/intake` | `src/app/api/photo/intake/route.ts` | File → sniff → jailed decode → EXIF-orient → metadata-strip → `{master, proxy, meta}` |
| `POST /api/photo/render` | `src/app/api/photo/render/route.ts` | Master + recipe (+ overlay rasters) → jailed replay → export bytes (JPG/PNG/TIFF/PDF) |

The Photo Edit card in `src/components/home/QuickJumpRow.tsx` gets `href: "/photo"`. The homepage `IntakeColumn` dropzone stays inert (it belongs to the future routing engine). The wires show no open/empty state — the editor opens with a photo loaded — so the POC's no-photo state is a large drop target styled to the pasteboard (open question #5).

### 3.2 Component map (mirrors the wire's numbered anatomy)

```
src/app/photo/page.tsx                      → <PhotoEditorShell/> (client, Suspense for search params)
src/components/photo-editor/
  PhotoEditorShell.tsx                      → wire regions 1–7: TitleBar · ActionBar · (TaskRail · canvas · ContextPanel) · StatusBar; lg gate
  TitleBar.tsx                              → ← back · Staples badge · filename + dims/MP · order chip (inert [INT]) · Simple/Standard/Pro · store · help
  ActionBar.tsx                             → undo/redo · Auto-enhance · Compare (hold) · "Quick fixes": Fix bleed / Fit to size / Convert format · ⋯
  TaskRail.tsx                              → Crop · Adjust · Fix for print · Text & image · Clean up · [spacer] · Export; red inset active ring
  PrintStrip.tsx                            → dims · target + Change ▾ · DPI chip (green/amber/red) · bleed + Add → · profile note · History · N
  HistoryDock.tsx                           → docked named-step list (opens from the strip button); click any step to set the cursor
  ReturnBanner.tsx                          → F2: "Editing picture from '…' · returns as one step" + Done / Cancel (renders only with returnContext)
  StatusBar.tsx                             → per-tool status string · autosave note · proxy note · zoom control
  canvas/PhotoCanvas.tsx                    → the <canvas>: proxy + LUT/matrix pass + geometry transform; rAF-coalesced redraw
  canvas/CropOverlay.tsx                    → mask + rule-of-thirds + 8 handles + ratio lock + floating size/DPI chip; pointer-capture gestures
  canvas/StraightenOverlay.tsx              → drag-rotate grid
  canvas/OverlayHandles.tsx                 → text/logo boxes: corners to scale, top handle to rotate (layout-editor handle behavior)
  canvas/GuideChrome.tsx                    → trim/bleed/safe dashed guides + bottom-right legend card (layout-editor visual language)
  canvas/CompareView.tsx                    → split-view slider + press-and-hold / hold-Space peek
  canvas/PreviewApproveBar.tsx              → "Preview · …" + Apply / Discard (Clean up and every future model op)
  panels/CropPanel.tsx                      → "Crop & straighten": aspect grid + catalog dropdown · Shape · Straighten + Auto · rotate/flip · Apply/Reset
  panels/AdjustPanel.tsx                    → Auto-enhance · Light group · Color group (Warmth label) · "More …" PRO row (disabled, dev #2)
  panels/FixForPrintPanel.tsx               → target size + catalog link · resolution card · Bleed (Edge fill: mirror/smear/solid) · Fit to size (Fit/Fill + anchor) · upscale placeholder · quick-guide link
  panels/TextImagePanel.tsx                 → Add text / Add image · "On this image" layer list · Character controls
  panels/CleanupPanel.tsx                   → tool grid (Remove object live; siblings disabled, dev #3) · brush size · explainer · AI-file card (disabled)
  panels/ExportPanel.tsx                    → format grid · quality · sRGB/CMYK segment (dev #6) · metadata toggle (dev #7) · Export file · save-back (dev #4) · send-to links
  CapabilityBanner.tsx                      → amber "this server can't decode HEIC" etc. (ImportBanner pattern)
src/lib/photo/
  ops.ts                                    → ISOMORPHIC op replay on raw RGBA buffers — the parity core
  adjust-math.ts                            → LUT builders (brightness/contrast/exposure/highlights/shadows) + saturation/temperature matrices
  geometry.ts                               → crop/rotate/straighten/resize math; effective-DPI math + green/amber/red thresholds
  sizes.ts                                  → photo/print size presets (4×6, 5×7, 8×10, letter, business card) + bleed specs; ProductBinding-shaped
  bleed.ts                                  → edge analysis → mirror | smear | solid strategy pick + expansion math
  fit.ts                                    → Fit/Fill/anchor solver (contract shared with the future Print Setup surface)
  pdf-wrap.ts                               → pure-TS single-image PDF writer: MediaBox/TrimBox/BleedBox, DCT/Flate XObject (cab.ts precedent)
  render-host.ts                            → SERVER-ONLY seam: out-of-process replay (scratch jail · prlimit · timeout · kill classification)
  heic.ts                                   → SERVER-ONLY seam: heif-convert probe + subprocess (pub2raw.ts pattern)
  limits.ts                                 → caps (MAX_PHOTO_BYTES, MAX_PHOTO_PIXELS, render timeouts); STP_* overrides harness-only
  client.ts                                 → the ONLY browser module calling /api/photo/*; Zod-validates responses (import/client.ts pattern)
src/lib/schema/photo.ts                     → PhotoDocumentSchema v1 · PhotoOpSchema · IntakeResponse/RenderRequest schemas
src/lib/store/photo-store.ts                → Zustand, persist("stp-photo-v1"), skipHydration; recipe+cursor history; activeTool; returnContext
fixtures/photo-corpus/                      → real-file corpus + committed goldens (per-op renders + full-recipe exports)
scripts/refresh-photo-goldens.mjs           → regenerates goldens; CI drift-gates them (refresh-corpus.mjs pattern)
```

Reused as-is: `src/lib/assets/blob-store.ts` (+ `use-asset-url.ts`) for master/proxy/logo bytes; `src/lib/import/image-meta.ts` for sniffing and content-hash ids; `src/lib/layout/units.ts` for the unit layer; the font catalog + `webfonts.ts` for text overlays; `AppHeader`/overlay chrome from the root layout; `avScanHook`-style logging stub on intake.

### 3.3 The pipeline in one paragraph each

**Open.** File picked/dropped → sniffed client-side for a fast reject → `client.ts` POSTs to intake → jailed decode/orient/strip → response `{master: b64, proxy: b64, meta}` (Zod-validated; a production service returns URLs instead — same note as the import report) → blobs into IndexedDB, `PhotoDocument` created in the store, proxy drawn. Browser-renderable formats also paint an **instant local preview** while intake runs, so the <2 s open budget is met by the local decode and the server round-trip only upgrades the surface underneath.

**Adjust.** Slider input → op upserted at the cursor (a live gesture mutates the trailing op `transient`ly; commit on release, mirroring the layout store's gesture rule) → `adjust-math` compiles the recipe's adjust ops into one LUT + one matrix → single pass over proxy `ImageData` → `putImageData`. Geometry ops re-derive the canvas transform. Everything after the cursor is the redo tail; a new edit truncates it. Hold Space (or the Compare button) swaps the original in; the split-view slider renders both halves from the same proxy pair.

**Export.** Export panel (rail task or Convert-format quick fix) → for text/logo overlays the client rasterizes each overlay at target resolution to PNG (fonts live client-side; keeps the server font-free — parity note in §5) → `RenderRequest{master, recipe, overlays, format, printSafe}` → render host replays: sharp geometry → raw buffer → `ops.ts` pixel math → composites → encode (sRGB ICC embedded; PDF via `pdf-wrap.ts` with trim/bleed boxes) → bytes stream back → browser download. The canvas never freezes: the request is fire-and-forget with a progress chip in the status bar — the wire's own copy: "full-res render is queued server-side."

### 3.4 Schema & store

`PhotoDocumentSchema` (`version: z.literal(1)`, canonical pixels for raster ops, inches only where print sizes enter):

```
{ version: 1, name,
  source: { assetId, masterMime, width, height, originalName, intakeNotes[] },
  target: { size: {w,h} inches | null, product: {sku,label} | null, bleed: inches },
  recipe: PhotoOp[],           // ordered; array order = application order
  cursor: number }             // ops[0..cursor) are applied; the rest are the redo tail
```

`PhotoOp` = discriminated union (`op` tag): `crop{rect,ratio?,shape: rect|rounded|circle}` · `rotate{quarter|degrees}` · `flip{axis}` · `straighten{degrees}` · `resize{px|inchesAtDpi|percent}` · `adjust{param,value}` (param ∈ brightness/contrast/exposure/highlights/shadows/saturation/temperature — the UI label for temperature is **Warmth**) · `autoEnhance{computed params, stored explicit}` · `bleedExpand{strategy: mirror|smear|solid, amount}` · `fitToSize{mode,anchor}` · `textOverlay{...}` · `logoOverlay{assetId,...}` · `erase{maskAssetId}`. Every op carries a human label for the history dock (canonical strings per the wires, §5). Ops are **stored explicit** (auto-enhance writes the values it chose) so replay never re-derives.

Store follows `layout-store.ts` conventions — `persist` + `createJSONStorage` + `skipHydration`, `merge` validating against the schema (v1; migrate-on-load from day one when v2 arrives), `partialize` persisting `{doc, level}` only — but **history is the recipe cursor, not snapshot stacks**: `undo = cursor–1`, `redo = cursor+1`, history cap unnecessary (recipes are dozens of ops, not documents). The blob library is not an undo step (same rule as layout assets). Session-scoped (not persisted) state per the wires: `activeTool: crop|adjust|fixprint|text|cleanup|export|none` (drives rail ring, panel body, canvas overlay, and the status-bar string), `pendingPreview` (a model/erase result awaiting Apply/Discard), and `returnContext` (F2: origin document name + placed-object id; presence renders the ReturnBanner and swaps Export for Done).

**F2 lands one additive layout-schema field** (PE8): picture frames gain optional `photoEdit: { recipe, originalAssetId }` — Done renders the flattened result into a new asset, binds it to the frame, and records the recipe so "Revert photo edits" is one named layout history step that restores `originalAssetId`. Optional field, schema-v2-compatible, migrate-free.

### 3.5 Modes, flags, diagnostics

House pattern, applied: **capabilities are probed, degradation is visible, nothing is silent.**

- `sharp` is an npm dependency → the core pipeline (JPG/PNG/WEBP/TIFF/GIF/BMP) is **always live**, dev and Docker alike. There is no fixture mode for the core path — unlike `.pub` import, the engine ships with `npm install`.
- **HEIC and SVG are capability-gated**: `heif-convert` probed like `pub2raw --version`; absent → intake returns a typed `unsupported-here` error, `CapabilityBanner` explains it, `GET /api/photo` reports it, the Docker image carries the packages. E2E runs against the always-live core.
- The tool ships behind the homepage card + route (no global flag framework exists); the kill switch is un-wiring the card — recorded honestly rather than inventing flag infrastructure the POC doesn't have.
- Caps in `limits.ts`: `MAX_PHOTO_BYTES` 40 MB, `MAX_PHOTO_PIXELS` 80 MP (above it: routed out as oversize, §4 PE7), intake/render CPU+AS rlimits and wall-clock timeouts — `STP_*` env overrides exist **for the adversarial harness only**, defaults are the enforced values (import `limits.ts` rule).

### 3.6 Security posture (binding; the §10.1 split discipline)

The Photo Editor is the suite's largest decode surface — `SECURITY_CONSIDERATIONS.md` flags the image stack (libheif, libtiff, librsvg, ImageMagick-class engines) **[CRITICAL]**. Split per the established POC discipline:

**POC-enforced (built with the tranche that introduces each surface):**

- Content-sniff every intake, never extension/MIME (`image-meta.ts`).
- **All native decode/encode out-of-process**: intake and render run in a spawned host under per-job `mkdtemp` scratch jail (wiped in `finally`), `prlimit --cpu --as` where available, wall-clock timeout + SIGKILL, bounded output size, kill-classification (resource-limit / timeout / parse-failed) — the `pub2raw.ts` seam, generalized. `sharp` is never invoked in the web-server process.
- **CDR on ingest**: decode → re-encode; original bytes discarded; EXIF/metadata stripped (GPS and serial data never persist — which is why the Export panel's "Strip photo metadata" toggle is locked ON at POC, deviation #7); SVG rasterized with external entities and scripts disabled; polyglots die at the transcode.
- Per-file size, pixel-count, and processing-time caps (zip-bomb/pixel-flood DoS).
- `avScanHook` logging stub on intake (same seam as import; nothing scans yet — recorded).
- Client is untrusted: recipe and all request bodies Zod-validated server-side; overlay rasters size-capped and re-encoded.

**Production-deferred (recorded accepted risk — POC touches no PII/orders/write-back):** microVM/gVisor-class isolation, per-subprocess network-egress jail, a real AV engine, station data-hygiene wipe between customers, and everything `[AI]` — the POC ships **zero AI features**, so the content-only/prompt-injection controls (feature plan §5.3) bind the model-service tranches when they exist, not this plan. The wires' preview-approve pattern (Apply/Discard, never auto-apply) is exactly the associate-approves-output posture those controls require — built into the shell now (PreviewApproveBar), inherited by every model feature later.

Every stub/seam registers in `STUBS.md` in the same commit that creates it (§10.7 rule).

---

## 4. Build order (PE-tranche)

Each step is one commit, demoable, with tests landing in the same commit. PE0–PE10 map the feature plan's E0–E8 and the handoff's Sections A–F onto POC reality (model-backed features are deferred seams, §6).

| Step | Lands | Newly available |
|---|---|---|
| PE0 | Spike & decide | Engine decision record; latency + capability evidence |
| PE1 | Shell, intake & open | Photo Edit card live; the Section-A shell; open a real photo at `/photo`; survives reload |
| PE2 | Geometry & history | Crop & straighten panel; named-step history dock; undo/redo; compare peek |
| PE3 | Export spine | Full-res server replay → JPG/PNG download; golden-recipe harness; **the recipe spine is proven** |
| PE4 | Tone & color | Adjust panel per the wires; auto-enhance; split-view compare; <100 ms budget met |
| PE5 | Print correctness | Print strip live states; Fix for print panel (bleed · fit · resolution); print-safe export incl. PDF boxes |
| PE6 | Text & image | Overlays with layout-consistent handles; layer list; Character controls |
| PE7 | Conversion & handoffs | Export panel complete; **Convert format** incl. HEIC→JPG/PDF; Open in Layout Editor; oversize routing |
| PE8 | Placed-picture round-trip (F2) | Edit a layout picture in the Photo Editor; return banner; one revertable layout step |
| PE9 | Clean up (stand-in) | Brushed Remove object with the preview-approve loop |
| PE10 | Hardening & harness | Corpus + adversarial + perf gates in CI; STUBS sweep; demo reset |

### PE0 — Spike & decide (time-boxed)

Benchmarks on the dev container + Docker image, committed as a decision record appended to this plan (revision entry): (a) `sharp` prebuilt on `node:22-bookworm-slim` — format matrix confirmed, 12 MP JPEG decode+re-encode timing; (b) `heif-convert` round-trip on real iPhone HEICs incl. Live photos; (c) proxy adjust latency — 2048 px `ImageData` through a LUT+matrix pass, measured against the 100 ms budget (with the documented fleet-hardware caveat: dev numbers are a proxy for the ProDesk until the hardware lab pass); (d) working-master format choice (PNG lossless vs JPEG q95 — size/fidelity trade on the corpus). *Done when:* decisions recorded with numbers; any red result has a named fallback (e.g. WASM-side decode, smaller proxy ceiling) before PE1 starts.

### PE1 — Shell, intake & open

`/photo` route + `PhotoEditorShell` with the wire's seven regions: TitleBar (order chip inert, Simple/Standard/Pro control with Pro disabled per dev #2), ActionBar (quick fixes present, routing wired to not-yet-built panels' placeholder states), TaskRail (six tiles + Export pinned, active ring, no-tool state), PrintStrip (static segments + disabled History), empty ContextPanel host with `✕`-to-none, StatusBar (per-tool strings from the wires), `lg` gate; `QuickJumpRow` card wired. Schema v1 + store + persist. `POST /api/photo/intake` with the full jail (render host seam lands here, HEIC probe stubbed to "unsupported"), `GET /api/photo` diagnostics, `CapabilityBanner`. Open via picker + drop-onto-pasteboard; instant local preview for renderable types; master+proxy into the blob store. *Done when:* a 12 MP phone JPEG opens to an editable canvas in <2 s locally; reload restores it; the rail→panel→status state machine matches the wire (tool ∈ six values + none); intake rejects a disguised non-image with friendly copy; hostile-file unit tests cover sniff+caps; e2e opens the corpus demo photo.

### PE2 — Geometry & history

The **Crop & straighten** panel per Section B: aspect grid (Free/Original/1:1/4×6/5×7/8×10/Letter/Business card + inert catalog dropdown), **Shape** (Rectangle/Rounded/Circle), straighten slider + Auto, rotate/flip buttons, Apply crop/Reset footer; crop overlay with mask, rule-of-thirds, 8 handles, floating size/DPI chip. Recipe ops + cursor undo/redo; the **HistoryDock** opening from the strip's `History · N` button, named steps, click-to-revert; press-and-hold compare peek. *Done when:* the crop→straighten→undo→redo chain is solid and persists mid-recipe; the history dock lists the wires' canonical step names; geometry math unit-tested against fixed cases; e2e covers the chain via `data-testid`.

### PE3 — Export spine (the tranche that proves the architecture)

`POST /api/photo/render`: render host replays geometry ops at full resolution via sharp; **Export panel v1** (format grid JPG/PNG + Quality; the full Section-B panel completes in PE7); browser download; progress chip (canvas never blocks). Golden-recipe harness lands: committed recipes replayed on every build, pixel-diff against committed goldens, client-proxy-vs-server tolerance test. *Done when:* open→crop→export round-trips a real photo at full resolution; the same recipe yields byte-identical output across two runs; goldens are drift-gated in CI; `refresh-photo-goldens.mjs` regenerates them.

### PE4 — Tone & color

The **Adjust** panel per Section B: Auto-enhance primary (histogram stretch + gray-world white balance, values stored explicit, always undoable, one named step), **Light** group (Brightness, Contrast, Exposure, Highlights, Shadows), **Color** group (Saturation, **Warmth**), the `PRO`-badged More row rendered disabled (dev #2). Live LUT preview; hold-Space peek; the ActionBar **Compare** button; the **split-view slider** (Section D). `ops.ts` runs identically client and server; parity covered by tolerance goldens. *Done when:* every adjustment <100 ms on the proxy (measured, harness from PE0); auto-enhance is a single named history step; adjust math unit-tested per-parameter against reference arrays.

### PE5 — Print correctness (the differentiator)

`PrintStrip` fully live: effective-DPI math with the wires' green/amber/red states and size-qualified copy; `Change ▾` target selector; `Bleed: … / Add →`; amber `Fix →` and red `Upscale →` clicking through to Fix for print (upscale action disabled per dev #3). The **Fix for print** panel per Section B: target print size + inert catalog link; effective-resolution card; **Bleed** — `bleed.ts` edge analysis picks **mirror/smear/solid** (Edge fill override dropdown, Section C's before/after behavior), expansion to the target's bleed line; **Fit to size** — Fit/Fill + 3×3 anchor via `fit.ts` (contract documented as shared with the future Print Setup surface); upscale placeholder card; "New to bleed?" quick-guide link. Trim/bleed/safe guides + legend card (`GuideChrome`, layout visual language). Print-safe export: flatten, sRGB ICC embed, **image-wrapped PDF with correct MediaBox/TrimBox/BleedBox** via `pdf-wrap.ts`. *Done when:* the wires' worked examples verify as fixtures (4032×3024 @ 4×6 → green 672 DPI; 1280×960 @ 8×10 → amber 148; 1200×900 @ 16×20 → red 72); a business-card image bleed-expands and its exported PDF's boxes measure correctly (unit-tested against the PDF bytes; preflights clean in an external viewer); red/amber never block export.

### PE6 — Text & image

The **Text & image** panel per Section B: Add text / Add image, the **"On this image" layer list** (select/remove), Character controls (font from the catalog, size, B/I/color, alignment); `textOverlay`/`logoOverlay` ops; canvas boxes with **corners-to-scale, top-handle-to-rotate** (layout-editor handle behavior); logo intake (PNG/SVG→rasterized) through the same jailed path into the blob store. Export-resolution client rasterization → server composite (§3.3). *Done when:* overlay handle behavior matches the layout canvas; the layer list round-trips selection with the canvas; a text+logo recipe exports with overlays positioned within golden tolerance; overlay rasters are size-capped server-side.

### PE7 — Conversion & handoffs

The **Export panel completes** per Section B: full format grid (JPG/PNG/TIFF/**PDF·print**), Quality, sRGB/CMYK-intent segment (CMYK disabled, dev #6), Strip-metadata toggle (locked ON, dev #7), Export file + "Save back to order…" (inert, dev #4), **Send to another tool** ("Open in Layout Editor →" live; "Resize & imposition · N-up →" inert, dev #9). **Convert format** quick fix now lands on a complete panel; **HEIC live** (`heic.ts` + Docker package + capability gating) — the "HEIC Live photo → printed 4×6 with zero external tools" path. **Open in Layout Editor**: flatten via a render call → asset + blob → `useLayoutStore` placed picture (via the existing placement helper) → `router.push("/layout")`, with the replace-open-document confirm gate (`PubConvertCallout` pattern). Oversize enforcement: intake above `MAX_PHOTO_PIXELS` or a target beyond the tool ceiling routes to the Layout Editor with an explanatory affordance instead of opening. Multi-page files (PDF) never open here — typed reject with a route-away message. *Done when:* HEIC e2e passes in the Docker/live lane; the layout handoff lands a correctly-sized picture; the oversize test proves the routing rule.

### PE8 — Placed-picture round-trip (Section F2)

The layout editor's picture frames gain "Edit in Photo Editor" (double-click + context affordance) → navigates to `/photo` with store-carried `returnContext` and the placed asset opened as the source. The shell renders the red **ReturnBanner** ("Editing picture from '…' · returns as one step"); **Export is hidden — Done replaces it**, Cancel returns unchanged. Done: render the recipe server-side, land the result as a new asset bound to the frame, record `photoEdit {recipe, originalAssetId}` (additive layout-schema field, §3.4), push **one named layout history step**; "Revert photo edits" restores the original. F1 (the inline Picture inspector tab) stays layout-editor backlog — its escape hatch lands here first. *Done when:* layout → edit → Done round-trips as one revertable layout step with the original asset untouched; Cancel is a true no-op; the <2 s open budget holds on the round-trip entry; e2e covers the loop.

### PE9 — Clean up (honest stand-in)

The **Clean up** panel per Section B: tool grid with **Remove object** live and Spot heal / Red-eye / Remove background / "Fix an AI-generated file" rendered disabled (dev #3); brush-size slider; brushed-mask canvas overlay → `erase{maskAssetId}` op → server-side classical fill (patch-from-surround + blend) in the render host, returned through the **PreviewApproveBar** ("Preview · …" → Apply/Discard) — the suggest-never-auto-apply posture every model feature will inherit. Labeled in-UI as basic cleanup ("removes small marks; a smarter fixer is coming"). *Done when:* the date-stamp/phone-number corpus cases produce acceptable small-region results; Apply adds a reversible "Remove object" history step and Discard is a no-op; the model-service seam is documented in STUBS.md.

### PE10 — Hardening & harness

`fixtures/photo-corpus/` finalized (phone JPEGs, HEICs incl. Live, low-res logo, screenshot, huge TIFF, AI-generated art, scanned doc; hostile set: polyglot, truncated, pixel-flood, zip-bomb-class PNG, SVG with entities/scripts — provenance noted per file, synthetic where real files aren't shippable). Perf budget gates in CI (open/adjust/export timings against recorded budgets). Adversarial suite green against the jail. Experience levels finish to the Section-E spec (Simple = Crop+Export rail + quick fixes; level switch verified against the miniatures). STUBS.md sweep; "Reset demo photo" affordance; README status update. *Done when:* CI runs unit + e2e + live lanes green including the photo suites; every budget is measured, met, or recorded as an honest limit.

---

## 5. Testing strategy

- **Unit (Vitest, colocated `*.test.ts`):** pure modules carry the weight — `adjust-math` per-parameter reference arrays, `geometry` (crop/rotate/DPI — including the wires' worked examples: 672 DPI @ 4×6, 148 @ 8×10, 72 @ 16×20, 318 placed), `fit` anchor matrix, `bleed` strategy pick across mirror/smear/solid, `sizes`, `pdf-wrap` (parse the emitted boxes back out of the bytes), schema + store (recipe cursor semantics, activeTool state machine, returnContext, merge/migration), `limits`, sniff/caps rejects.
- **Golden-recipe harness (the corpus-fidelity precedent):** committed recipes × corpus files → committed goldens; exact pixel-diff for server renders, tolerance-diff for client-proxy parity; `refresh-photo-goldens.mjs` + CI drift gate (`git status --porcelain`), mirroring the `.pub` trace discipline. History-step label tests pin the wires' canonical strings ("Auto-enhance", "Crop to 4 × 6", "Brightness +12", "Straighten −1.2°", "Expand bleed 0.125 in", "Remove object").
- **E2E (Playwright):** `photo-editor.spec.ts` — open→crop→adjust→export happy path on the always-live core (no fixture mode needed); quick-fix navigation (Fix bleed/Fit to size → Fix for print; Convert format → Export); DPI chip click-through; history dock revert; the PE8 round-trip loop; oversize route-away; `data-testid` + `data-hydrated` conventions.
- **Adversarial:** hostile-file suite against intake (caps, kill classification, jail cleanup verified), oversized-recipe and malformed-Zod payloads against render (client is untrusted).
- **Perf gates:** PE0's latency harness graduates into CI budget checks; fleet-hardware numbers are collected at the hardware-lab pass and recorded against the CI proxies (honest-limit note until then).
- **CI lanes:** photo unit/e2e ride the existing `checks` + `e2e` lanes (sharp installs with `npm ci`); HEIC + golden drift-gating extend the `live-import` lane (adds `libheif-examples`).

---

## 6. Deferred backlog (how the rest grows)

- **P2 assistive wave (feature plan E6/E7):** spot heal, red-eye, background removal, AI-artwork cleanup, low-res upscale, color-matching helper, highlight-to-change, batch apply. All blocked on the **model-service decision** (hosting, cost, DPA — feature plan §5.5 #1) and, for highlight-to-change, the prompt-injection controls [CRITICAL][AI]. The wires already draw their affordances (Clean-up tool grid, upscale rescue card) — they render disabled today (devs #3), and each arrives as one more previewed op behind the PreviewApproveBar the shell ships with.
- **F1 — the Layout Editor's "Picture" inspector tab** (placed-size DPI check, Auto-enhance, Brightness/Contrast, Crop to frame, "Edit in Photo Editor →"): layout-editor scope, recorded in `LAYOUT_EDITOR_PLAN.md` §6; its escape hatch is PE8's entry point, and its inline adjustments should consume this tool's `adjust-math`/`geometry` modules rather than forking them.
- **Pro experience level** (Section E: levels/curves-lite, numeric entry everywhere): designed, deferred; the disabled segment + PRO-badged rows keep the ceiling visible (dev #2). Sequencing note: the layout editor dropped Pro (its v1.3) — see §1.2 for the cross-tool framing.
- **Konva convergence:** when the layout K-tranche lands, the overlay/handle layer here converges onto the shared interaction code; the `<canvas>` proxy surface likely survives as-is underneath a Konva stage. Tracked with open question #1.
- **Catalog/product-size `[INT]`:** `sizes.ts` presets swap for the product-spec service when the spec-sync slice lands (the wires' two inert catalog pickers, dev #5); product-SKU crop presets and "born correct" bleed values follow.
- **Order integration `[INT]`:** the title-bar chip and "Save back to order…" (dev #4) go live when the backbone write-path lands; the wires already specify their placement.
- **CMYK-intent export / soft-proofing:** the Export segment renders now (dev #6); the transform needs press ICC profiles from the print-shop integration. The Royal-Blue test case goes into the corpus **now** so the eventual fix has its acceptance test waiting.
- **Send to Resize & imposition (N-up):** affordance renders inert (dev #9); `fit.ts`'s documented contract is the handshake prepared for the Print Setup surface.
- **Edit-effort summary for pricing (feature plan §5.5 #4):** the recipe *is* the operations log — emitting a summary is nearly free once a business owner exists; parked.
- **Real AV, microVM isolation, egress jail, station hygiene wipe:** production security deferrals per §3.6.

---

## 7. Open questions / assumptions (proceeding with the recommendation unless redirected)

1. **Konva now or at K-tranche?** *Recommendation: not now.* A single-raster editor gets little from a scene graph; adopting Konva here first would fork the suite's interaction code instead of sharing it. Revisit when the layout K-tranche lands (it, not this tool, is the convergence driver). If the suite instead standardizes on Konva before PE6, the overlay layer adopts it then.
2. **CMYK export depth at launch** (feature plan §5.5 #2): *assumption — POC ships sRGB-embedded exports only*; the wires' CMYK-intent control renders disabled (dev #6) until real press profiles exist. The corpus carries the Royal-Blue case from day one.
3. **Working-master fidelity & the metadata toggle:** re-encoding on ingest (CDR) trades a sliver of quality for the sanitization posture, and unconditional intake stripping makes the wires' "Strip photo metadata" export toggle immutable at POC (dev #7). *Assumption: acceptable for counter work; PE0 picks the codec and documents the measured loss.* Unlocking the toggle means retaining metadata on the working master — that needs the PII-retention conversation first.
4. **Numeric resize entry** — the feature plan's P1 requires resize by pixels/inches-at-DPI/percent, but the wires fold sizing into Fit to size + target-size selection and show no numeric fields (Pro is "numeric entry everywhere"). *Assumption:* the `resize` op and its math ship (PE5) with a minimal numeric affordance inside Fix for print at Standard; the full numeric surface arrives with Pro. Flagged for the designer — a wireframe answer would settle placement.
5. **The no-photo state** — the wires open with a photo loaded and show no empty/open state. *Assumption:* a large drop target styled to the pasteboard, plus the picker; revisit if a wire lands.
6. **Proxy ceiling 2048 px / master ceiling 80 MP** are engineering guesses pending PE0 measurements; both are `limits.ts` constants, cheap to move.
7. **The feature plan's E0 Konva premise** (§1.2 finding 1) should be corrected in `PHOTO_EDITOR_PLAN.md`'s next revision by its owner; this plan is written against the repo as it stands. Likewise the handoff README's `screenshots/` reference — the folder wasn't in the delivered bundle (noted, not blocking; the `.dc.html` opens standalone).

---

*Bottom line: the Photo Editor lands on the seams this POC has already proven — the jailed-native-engine pattern from `.pub` import, the schema/store/blob conventions from the layout editor, the honest-degradation pattern from fixture mode — and now builds to a real wireframe spec: the Section-A shell with its quick-fix bar and six-tile rail, panels and print-check states copied from the wires, and every designed-but-deferred control rendered visibly inert instead of silently missing. Three commits in (PE3) the architecture is proven end-to-end on real photos; three more (PE5) and the counter's daily grind — Fix bleed, Fit to size, honest DPI — is live; the round-trip with the Layout Editor (PE8) closes the suite loop; everything model-shaped stays a labeled seam behind the preview-approve bar it will inherit.*
