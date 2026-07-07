# Photo Editor — POC Implementation Plan

**Scope of this plan:** the build plan for the **Photo Editor** (the raster quick-fix surface, `docs/PHOTO_EDITOR_PLAN.md`) inside this POC — mounted behind the homepage's **Photo Edit** card at the reserved `/photo` route. It maps the feature plan's E0–E8 tranche model onto this codebase's actual state and conventions, reconciles the two places where the feature plan's assumptions and the repo diverge (§1.2), and sequences the work as PE0–PE9: one commit per step, each demoable, walking-skeleton first.

**Revision (v1.0, 2026-07-07):** initial plan, written against the L13/P5-era codebase (layout editor DOM/SVG-rendered, `.pub` import live, no server image stack, no export path anywhere in the repo yet).

**Inputs reviewed:**

| Input | Where | Role |
|---|---|---|
| Photo Editor feature plan | `docs/PHOTO_EDITOR_PLAN.md` | The what: features, UI requirements, E-tranches, recipe architecture, security §5.3 |
| Suite implementation plan | `docs/Store_Tools_Suite_Implementation_Plan.md` | Phase/track model; Photo Editor = Track B, Phase-2 vertical slice ("quick-fix utilities: image crop/resize/convert, one-click bleed") |
| Layout Editor plan | `docs/LAYOUT_EDITOR_PLAN.md` | Sibling-tool conventions: schema/store patterns, guide visuals, §8 Konva decision, §10.1 sandbox posture, §10.7 seam registry rule |
| POC plan | `docs/IMPLEMENTATION_PLAN.md` | Route-group convention (`/photo` reserved, §3.1); homepage mount points (§1.2) |
| Security considerations | `docs/SECURITY_CONSIDERATIONS.md` | Binding image-stack requirements: sandboxed decode [CRITICAL], content-sniff, CDR, AI content-only rules |
| `.pub` import pipeline | `src/lib/import/*`, `src/app/api/import/route.ts` | The repo's only realized "sandboxed native engine behind an API route" — the template PE copies |
| Homepage wires | `docs/handoff/feedback-tracker/README.md` | The Photo Edit card ("Crop, retouch, color", Lucide `image` glyph) — the only existing Photo Editor design artifact |
| Stub registry | `STUBS.md` | Seams to reuse (blob store, identity, AV hook) and the register-in-same-commit rule |

---

## 1. Review findings

### 1.1 How this fits the suite plan

The Photo Editor is a **Track B vertical slice** onto the Phase-1 walking skeleton. In this POC the "skeleton" it lands on is the same one the `.pub` import proved: a Next.js API route fronting a jailed native engine, a Zod-validated contract between client and server, a Zustand store per tool surface, and the shared suite header/overlay chrome that every route under `src/app/` inherits. The homepage already reserves its mount points — the **Photo Edit** quick-jump card (`src/components/home/QuickJumpRow.tsx`, currently inert) and the `/photo` route group (`docs/IMPLEMENTATION_PLAN.md` §3.1). Wiring the card is a one-line change; everything behind it is this plan.

Suite-plan slice framing: the feature plan's three money-shot buttons (**Fix Bleed · Fit to Size · Convert Format**) are exactly the suite plan's Phase-2 "quick-fix utilities (image crop/resize/convert, one-click bleed)" — this slice is that capability, grown into the full P1 surface.

### 1.2 Reconciling the feature plan with this codebase (two findings for the doc owner)

1. **The Konva premise is ahead of reality.** `PHOTO_EDITOR_PLAN.md` §5.1 (E0) reads "Canvas 2D via Konva (already the layout-editor choice — reuse the interaction layer)". In this repo Konva is the layout editor's **specified functional-tier** render target (`LAYOUT_EDITOR_PLAN.md` §8, K-tranche) — **not built**. The POC layout editor renders DOM/SVG with a hand-rolled pointer-gesture state machine (`src/components/layout-editor/canvas/CanvasViewport.tsx`); `package.json` contains no canvas library at all. **Resolution (§3.2):** the Photo Editor proxy renders on a plain Canvas 2D `<canvas>` (a raster tool needs a bitmap surface regardless of scene-graph choice), with crop/overlay handles as DOM overlays reusing the layout editor's gesture patterns. No Konva dependency enters at POC; convergence onto the suite Konva stack is tracked as open question #1 alongside the K-tranche. This also answers E0's fallback question the conservative way: **everything stays Canvas 2D; no WebGL** on the UHD 630 fleet.
2. **The server image stack is net-new, not shared.** The feature plan's proxy/recipe/re-render spine assumes a server image engine exists; the app has none — no image dependency in `package.json`, no ImageMagick, no libheif, and **no export/download path anywhere** (open/save/export is a ❌ across the POC). One encouraging footnote: `sharp`/libvips already sits in the lockfile as Next.js's optional image-optimization dependency, resolved to prebuilt linux-x64 binaries — evidence, before PE0 even runs, that the primary engine candidate installs cleanly on this exact runner. The `.pub` importer's `pub2raw.ts` subprocess seam is the only precedent and is the pattern PE copies wholesale: probe → jail → rlimit → timeout → honest degraded mode → diagnostics endpoint.

Neither finding changes the feature plan's architecture — the edit-recipe model (§5.2 there) survives intact and is adopted as binding here. They change only what "reuse" means at POC fidelity.

### 1.3 Stack review — engine choices to validate in PE0

Per the stack-agnostic rule these are **candidates with a recorded rationale**, confirmed or replaced by PE0 benchmarks:

- **Server raster engine: `sharp` (libvips)** — the feature plan's own primary candidate; npm-installable prebuilt (Node 22, glibc — the Docker runner is already `node:22-bookworm-slim` for exactly this reason), fast, streaming, MIT-licensed (no AGPL exposure, unlike ImageMagick's ecosystem — the suite's recurring licensing concern). Covers JPG/PNG/WEBP/GIF/TIFF/BMP decode+encode, resize, rotate, extend, composite, raw-pixel access, ICC embed.
- **HEIC: `heif-convert` (libheif-examples) as an ingest subprocess**, exactly like `pub2raw` — prebuilt `sharp` does not ship HEIC (patent posture), and building libvips from source is not POC-shaped. Docker installs the package; where absent (plain `npm run dev` on a laptop), HEIC intake degrades honestly (§3.5). SVG likewise rasterizes at ingest via the jailed engine with external entities/scripts disabled.
- **Client proxy surface: Canvas 2D `<canvas>`**, no library. Adjustments compile to per-channel LUTs + a color matrix applied in one pass over proxy `ImageData` (§3.3); geometry uses canvas transforms. Proxy capped at ~2048 px long edge (≈2.6 MP) — small enough for <100 ms single-pass math on the ProDesk, large enough to judge a crop.
- **Parity by shared code, not twin engines:** every pixel-math operation lives in a pure, isomorphic TypeScript module (`src/lib/photo/ops.ts`) that runs on raw RGBA buffers — client feeds it `ImageData`, server feeds it `sharp(...).raw()` buffers. This is the same principle the layout plan uses for text layout ("WYSIWYG is guaranteed by sharing the layout code, not by trusting two engines to agree"). Geometry ops (crop/rotate/resize) run through sharp's resampler server-side; golden tolerance tests own that seam.
- **Upscale / background-removal / inpaint models: out of POC.** Async server-model jobs (Real-ESRGAN-class, rembg-class) are a hosting/cost/DPA decision (feature plan §5.5 #1) the POC can't settle. The POC ships the *seams* (async job contract, previewed-step UX) and one honest stand-in (§4 PE8).

### 1.4 Technical approach — what the recipe model buys here

**Non-destructive recipe, proxy-edit client, full-res render server** (feature plan §5.2) — adopted verbatim, with the POC twist that the server is stateless:

- **Intake normalizes.** `POST /api/photo/intake` content-sniffs (reusing `src/lib/import/image-meta.ts`, already isomorphic), decodes **in the jail**, applies EXIF orientation, **strips all metadata**, and re-encodes a **working master** (decoded, oriented, sanitized) plus a screen proxy. The original bytes are discarded — this is the CDR posture ("the conversion pipeline is also your best sanitizer") and the PII-ephemerality posture in one move. Master + proxy bytes live client-side in the existing IndexedDB blob store; only their ids and dimensions enter the document.
- **The recipe is the document.** `PhotoDocument` = source ref + target (product/photo size + bleed) + ordered typed ops + cursor. Undo/redo = cursor moves; the history panel = the recipe, named per op; autosave = Zustand `persist` of a small JSON object — all three requirements fall out of one structure, no snapshot stacks (a deliberate divergence from `layout-store.ts`'s snapshot undo, recorded in §3.4).
- **Export replays.** `POST /api/photo/render` receives master bytes + recipe (+ pre-rasterized overlay PNGs, §3.3) and replays the ops at full resolution in the jailed render host. Deterministic: same recipe, same engine, same bytes → same output, drift-gated by golden tests. The server holds nothing between requests — consistent with the single-instance, no-backend POC posture.

---

## 2. What we're building (fidelity contract)

**There is no wireframe handoff package for this tool** — the only design artifact is the homepage card. Per the Customer Proof Station precedent (`CUSTOMER_PROOF_STATION_PLAN.md` §1.1), the POC proceeds at **mid-fidelity from the spec** — `PHOTO_EDITOR_PLAN.md` §4 is the UI requirements document — and restyles when a handoff package lands.

**Follow exactly (from the feature plan §4):**

- **Single-screen editor**: canvas center; left **action rail** organized by task verb (Crop & Straighten · Adjust · Fix for Print · Add Text/Logo · Clean Up · Export); contextual controls in a right panel only when a tool is active. No floating palettes.
- **Three money-shot buttons always visible**: **Fix Bleed**, **Fit to Size**, **Convert Format**.
- **Print-correctness strip** above the canvas: pixel dimensions, target print size, effective DPI with green/amber/red state, bleed status, color note. Advisory, never blocking; amber/red click through to the fix.
- **Trim and bleed guides** on the canvas whenever a target size is set — same visual language as the layout editor's shipped canvas (dashed `#CC0000` bleed, `#9fb6df` guide blue; its wire-era corner marks came out in the L8 declutter and stay out here).
- **Live preview <100 ms** on the proxy; **before/after** press-and-hold peek; **named-step history panel** with click-to-revert; full undo/redo shortcuts.
- **Suite consistency**: shared `AppHeader` rides along from the root layout; a `TitleBar` mirroring the layout editor's (back link, document name, experience-level switch, help); tool context published to the feedback store per the documented `CapturedContextPanel` contract (the panel renders canned rows today and reads live context once tool surfaces publish it — this tool publishes from day one).

**Deviations (numbered, per house convention):**

1. **Suite visual tokens, not wireframe grayscale** — no wires exist to reproduce; the surface adopts the shipped suite styling from day one.
2. **Experience levels ship Simple/Standard; Pro is deferred** — matching the layout editor's current state (its Simple level is itself pending L14). Levels-of-density plumbing (`ExperienceLevel`) is reused; Pro's levels/curves-lite is P2 anyway.
3. **Clean Up ships stand-in quality** — content-aware erase uses a classical patch/blend fill, honestly labeled; the production inpaint model is a deferred seam (§6).
4. **Low-res upscale and background removal are seams only** — the DPI strip warns and the upsell affordance exists, but the one-click upscale button reads "coming with the model service" until hosting is decided.
5. **Order integration `[INT]` is inert** — same as everywhere in the POC: no order model exists. "Fetch from an order" stays a wire placeholder; the file header shows no customer context.
6. **Desktop-minimum gate below `lg`** — same honest "needs a bigger screen" card as the layout editor; a precision raster canvas is a station tool.

---

## 3. Application architecture

### 3.1 Routes

| Route | File | What |
|---|---|---|
| `/photo` | `src/app/photo/page.tsx` | Mounts client-only `<PhotoEditorShell/>`; deep-linkable (`/photo?demo=1` opens the corpus demo photo) |
| `GET /api/photo` | `src/app/api/photo/route.ts` | Diagnostics: mode + capability matrix (`{formats: {jpeg, png, webp, tiff, heic, svg}, engine, jailed}`) — the `GET /api/import` pattern |
| `POST /api/photo/intake` | `src/app/api/photo/intake/route.ts` | File → sniff → jailed decode → EXIF-orient → metadata-strip → `{master, proxy, meta}` |
| `POST /api/photo/render` | `src/app/api/photo/render/route.ts` | Master + recipe (+ overlay rasters) → jailed replay → export bytes (JPG/PNG/TIFF/PDF) |

The Photo Edit card in `src/components/home/QuickJumpRow.tsx` gets `href: "/photo"`. The homepage `IntakeColumn` dropzone stays inert (it belongs to the future routing engine); a `PhotoOpenCallout` mirrors the working `PubConvertCallout` pattern if we want a homepage fast path — decided at PE1, not load-bearing.

### 3.2 Component map

```
src/app/photo/page.tsx                      → <PhotoEditorShell/> (client, Suspense for search params)
src/components/photo-editor/
  PhotoEditorShell.tsx                      → TitleBar · money-shot row · work row (ActionRail · CanvasViewport · ContextPanel) · StatusBar; lg gate
  TitleBar.tsx                              → ← back · doc name · experience switch · help
  ActionRail.tsx                            → task verbs; publishes active tool to the store
  PrintStrip.tsx                            → dims · target size · effective-DPI state chip · bleed status; chips click through
  MoneyShotRow.tsx                          → Fix Bleed · Fit to Size · Convert Format (always visible)
  canvas/PhotoCanvas.tsx                    → the <canvas>: proxy + LUT/matrix pass + geometry transform; rAF-coalesced redraw
  canvas/CropOverlay.tsx                    → crop rect + rule-of-thirds + ratio lock; DOM handles, pointer-capture gestures
  canvas/StraightenOverlay.tsx              → drag-rotate grid
  canvas/OverlayHandles.tsx                 → move/scale/rotate handles for text/logo overlays (layout-editor handle behavior)
  canvas/GuideChrome.tsx                    → trim/bleed guides + legend (layout-editor visual language)
  canvas/BeforeAfterPeek.tsx                → press-and-hold original
  panels/{CropPanel,AdjustPanel,BleedPanel,FitPanel,TextPanel,LogoPanel,CleanupPanel}.tsx
  HistoryPanel.tsx                          → the recipe, named steps, click-to-set-cursor
  ExportDialog.tsx                          → format matrix, quality, print-safe options; suite-standard affordance
  CapabilityBanner.tsx                      → amber "this server can't decode HEIC" etc. (ImportBanner pattern)
src/lib/photo/
  ops.ts                                    → ISOMORPHIC op replay on raw RGBA buffers — the parity core
  adjust-math.ts                            → LUT builders (brightness/contrast/exposure/highlights/shadows) + saturation/temperature matrices
  geometry.ts                               → crop/rotate/straighten/resize math; effective-DPI math
  sizes.ts                                  → photo-size presets (4×6, 5×7, 8×10, wallet, business card) + bleed specs; ProductBinding-shaped
  bleed.ts                                  → edge analysis → mirror | solid strategy pick + expansion math
  fit.ts                                    → Fit/Fill/anchor solver (contract shared with the future Print Setup surface)
  pdf-wrap.ts                               → pure-TS single-image PDF writer: MediaBox/TrimBox/BleedBox, DCT/Flate XObject (cab.ts precedent)
  render-host.ts                            → SERVER-ONLY seam: out-of-process replay (scratch jail · prlimit · timeout · kill classification)
  heic.ts                                   → SERVER-ONLY seam: heif-convert probe + subprocess (pub2raw.ts pattern)
  limits.ts                                 → caps (MAX_PHOTO_BYTES, MAX_PHOTO_PIXELS, render timeouts); STP_* overrides harness-only
  client.ts                                 → the ONLY browser module calling /api/photo/*; Zod-validates responses (import/client.ts pattern)
src/lib/schema/photo.ts                     → PhotoDocumentSchema v1 · PhotoOpSchema · IntakeResponse/RenderRequest schemas
src/lib/store/photo-store.ts                → Zustand + persist("stp-photo-v1"), skipHydration; recipe+cursor history
fixtures/photo-corpus/                      → real-file corpus + committed goldens (per-op renders + full-recipe exports)
scripts/refresh-photo-goldens.mjs           → regenerates goldens; CI drift-gates them (refresh-corpus.mjs pattern)
```

Reused as-is: `src/lib/assets/blob-store.ts` (+ `use-asset-url.ts`) for master/proxy/logo bytes; `src/lib/import/image-meta.ts` for sniffing and content-hash ids; `src/lib/layout/units.ts` for the unit layer; the font catalog + `webfonts.ts` for text overlays; `AppHeader`/overlay chrome from the root layout; `avScanHook`-style logging stub on intake.

### 3.3 The pipeline in one paragraph each

**Open.** File picked/dragged → sniffed client-side for a fast reject → `client.ts` POSTs to intake → jailed decode/orient/strip → response `{master: b64, proxy: b64, meta}` (Zod-validated; a production service returns URLs instead — same note as the import report) → blobs into IndexedDB, `PhotoDocument` created in the store, proxy drawn. Browser-renderable formats also paint an **instant local preview** while intake runs, so the <2 s open budget is met by the local decode and the server round-trip only upgrades the surface underneath.

**Adjust.** Slider input → op upserted at the cursor (a live gesture mutates the trailing op `transient`ly; commit on release, mirroring the layout store's gesture rule) → `adjust-math` compiles the recipe's adjust ops into one LUT + one matrix → single pass over proxy `ImageData` → `putImageData`. Geometry ops re-derive the canvas transform. Everything after the cursor is the redo tail; a new edit truncates it.

**Export.** `ExportDialog` → for text/logo overlays the client rasterizes each overlay at target resolution to PNG (fonts live client-side; keeps the server font-free — parity note in §5) → `RenderRequest{master, recipe, overlays, format, printSafe}` → render host replays: sharp geometry → raw buffer → `ops.ts` pixel math → composites → encode (sRGB ICC embedded; PDF via `pdf-wrap.ts` with trim/bleed boxes) → bytes stream back → browser download. The canvas never freezes: the request is fire-and-forget with a progress chip in the status bar.

### 3.4 Schema & store

`PhotoDocumentSchema` (`version: z.literal(1)`, canonical pixels for raster ops, inches only where print sizes enter):

```
{ version: 1, name,
  source: { assetId, masterMime, width, height, originalName, intakeNotes[] },
  target: { size: {w,h} inches | null, product: {sku,label} | null, bleed: inches },
  recipe: PhotoOp[],           // ordered; array order = application order
  cursor: number }             // ops[0..cursor) are applied; the rest are the redo tail
```

`PhotoOp` = discriminated union (`op` tag): `crop{rect,ratio?}` · `rotate{quarter|degrees}` · `flip{axis}` · `straighten{degrees}` · `resize{px|inchesAtDpi|percent}` · `adjust{param,value}` (param ∈ brightness/contrast/exposure/highlights/shadows/saturation/temperature) · `autoEnhance{computed params, stored explicit}` · `bleedExpand{strategy,amount}` · `fitToSize{mode,anchor}` · `textOverlay{...}` · `logoOverlay{assetId,...}` · `erase{maskAssetId}`. Every op carries a human label for the history panel. Ops are **stored explicit** (auto-enhance writes the values it chose) so replay never re-derives.

Store follows `layout-store.ts` conventions — `persist` + `createJSONStorage` + `skipHydration`, `merge` validating against the schema (v1; migrate-on-load from day one when v2 arrives), `partialize` persisting `{doc, level}` only — but **history is the recipe cursor, not snapshot stacks**: `undo = cursor–1`, `redo = cursor+1`, history cap unnecessary (recipes are dozens of ops, not documents). The blob library is not an undo step (same rule as layout assets).

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
- **CDR on ingest**: decode → re-encode; original bytes discarded; EXIF/metadata stripped (GPS and serial data never persist); SVG rasterized with external entities and scripts disabled; polyglots die at the transcode.
- Per-file size, pixel-count, and processing-time caps (zip-bomb/pixel-flood DoS).
- `avScanHook` logging stub on intake (same seam as import; nothing scans yet — recorded).
- Client is untrusted: recipe and all request bodies Zod-validated server-side; overlay rasters size-capped and re-encoded.

**Production-deferred (recorded accepted risk — POC touches no PII/orders/write-back):** microVM/gVisor-class isolation, per-subprocess network-egress jail, a real AV engine, station data-hygiene wipe between customers, and everything `[AI]` — the POC ships **zero AI features**, so the content-only/prompt-injection controls (feature plan §5.3) bind the E6/E7-equivalent tranches when a model service exists, not this plan.

Every stub/seam registers in `STUBS.md` in the same commit that creates it (§10.7 rule).

---

## 4. Build order (PE-tranche)

Each step is one commit, demoable, with tests landing in the same commit. PE0–PE9 map the feature plan's E0–E8 onto POC reality (E6/E7's model-backed features are deferred seams, §6).

| Step | Lands | Newly available |
|---|---|---|
| PE0 | Spike & decide | Engine decision record; latency + capability evidence |
| PE1 | Shell, intake & open | Photo Edit card live; open a real photo at `/photo`; survives reload |
| PE2 | Geometry & history | Crop/rotate/flip/straighten; named-step history; undo/redo; before/after |
| PE3 | Export spine | Full-res server replay → JPG/PNG download; golden-recipe harness; **the recipe spine is proven** |
| PE4 | Tone & color | Brightness/contrast + slider set; auto-enhance; <100 ms budget met |
| PE5 | Print correctness | DPI strip live; **Fix Bleed**; **Fit to Size**; print-safe export incl. PDF with trim/bleed boxes |
| PE6 | Text & logo overlays | Add text / add logo with layout-consistent handles |
| PE7 | Conversion & handoffs | **Convert Format** incl. HEIC→JPG/PDF; Open in Layout Editor; oversize routing |
| PE8 | Clean Up (stand-in) | Brushed erase with previewed, approvable result |
| PE9 | Hardening & harness | Corpus + adversarial + perf gates in CI; STUBS sweep; demo reset |

### PE0 — Spike & decide (time-boxed)

Benchmarks on the dev container + Docker image, committed as a decision record appended to this plan (revision entry): (a) `sharp` prebuilt on `node:22-bookworm-slim` — format matrix confirmed, 12 MP JPEG decode+re-encode timing; (b) `heif-convert` round-trip on real iPhone HEICs incl. Live photos; (c) proxy adjust latency — 2048 px `ImageData` through a LUT+matrix pass, measured against the 100 ms budget (with the documented fleet-hardware caveat: dev numbers are a proxy for the ProDesk until the hardware lab pass); (d) working-master format choice (PNG lossless vs JPEG q95 — size/fidelity trade on the corpus). *Done when:* decisions recorded with numbers; any red result has a named fallback (e.g. WASM-side decode, smaller proxy ceiling) before PE1 starts.

### PE1 — Shell, intake & open

`/photo` route + `PhotoEditorShell` (title bar, money-shot row disabled-with-tooltips, action rail, canvas viewport, empty context panel, status bar, `lg` gate); `QuickJumpRow` card wired. Schema v1 + store + persist. `POST /api/photo/intake` with the full jail (render host seam lands here, HEIC probe stubbed to "unsupported"), `GET /api/photo` diagnostics, `CapabilityBanner`. Open via picker + drag-onto-canvas; instant local preview for renderable types; master+proxy into the blob store. *Done when:* a 12 MP phone JPEG opens to an editable canvas in <2 s locally; reload restores it; intake rejects a disguised non-image with friendly copy; hostile-file unit tests cover sniff+caps; e2e opens the corpus demo photo.

### PE2 — Geometry & history

Crop (freeform, ratio presets 1:1/4:6/5:7/8:10/letter/business-card, rule-of-thirds overlay, DOM handles with pointer capture), rotate 90°/arbitrary, flip H/V, straighten slider + drag-rotate grid. Recipe ops + cursor undo/redo + `HistoryPanel` (click-to-revert) + before/after peek. Rounded-corner crop preset included (survey ask). *Done when:* the crop→straighten→undo→redo chain is solid and persists mid-recipe; geometry math unit-tested against fixed cases; e2e covers the chain via `data-testid`.

### PE3 — Export spine (the tranche that proves the architecture)

`POST /api/photo/render`: render host replays geometry ops at full resolution via sharp; Export dialog with JPG/PNG + quality; browser download; progress chip (canvas never blocks). Golden-recipe harness lands: committed recipes replayed on every build, pixel-diff against committed goldens, client-proxy-vs-server tolerance test. *Done when:* open→crop→export round-trips a real photo at full resolution; the same recipe yields byte-identical output across two runs; goldens are drift-gated in CI; `refresh-photo-goldens.mjs` regenerates them.

### PE4 — Tone & color

Brightness/contrast (the 76% task), exposure, highlights/shadows, saturation, temperature — sliders with live LUT preview; auto-enhance (histogram stretch + gray-world white balance, values stored explicit, always undoable). `ops.ts` runs identically client and server; parity covered by tolerance goldens. *Done when:* every adjustment <100 ms on the proxy (measured, harness from PE0); auto-enhance is a single named history step; adjust math unit-tested per-parameter against reference arrays.

### PE5 — Print correctness (the differentiator)

`PrintStrip` live: effective-DPI math + green/amber/red thresholds, clickable states. Resize dialog (px / inches-at-DPI / percent, aspect lock, low-res soft warning). **Fix Bleed**: `bleed.ts` edge analysis picks mirror vs solid (override available), expansion to the target's bleed line, guides drawn in the shared visual language. **Fit to Size**: photo-size presets from `sizes.ts` + Fit/Fill/anchor via `fit.ts` (its contract documented as shared with the future Print Setup surface). Print-safe export: flatten, sRGB ICC embed, **image-wrapped PDF with correct MediaBox/TrimBox/BleedBox** via `pdf-wrap.ts`. *Done when:* a business-card image bleed-expands and its exported PDF's boxes measure correctly (unit-tested against the PDF bytes; preflights clean in an external viewer); DPI chip states verified across a low-res/high-res pair; CMYK-intent export explicitly **not** in this step (open question #2).

### PE6 — Text & logo overlays

`textOverlay`/`logoOverlay` ops; font catalog + lazy webfonts reused; move/scale/rotate handles matching layout-editor behavior; logo intake (PNG/SVG→rasterized) through the same jailed path into the blob store. Export-resolution client rasterization → server composite (§3.3). *Done when:* overlay handle behavior matches the layout canvas; a text+logo recipe exports with overlays positioned within golden tolerance; overlay rasters are size-capped server-side.

### PE7 — Conversion & handoffs

**Convert Format** money-shot: Export-as matrix JPG/PNG/TIFF/PDF from any supported intake, **HEIC live** (`heic.ts` + Docker package + capability gating) — the "HEIC Live photo → printed 4×6 with zero external tools" path. **Open in Layout Editor**: flatten via a render call → asset + blob → `useLayoutStore` placed picture (via the existing placement helper) → `router.push("/layout")`, with the replace-open-document confirm gate (`PubConvertCallout` pattern). Oversize enforcement: intake above `MAX_PHOTO_PIXELS` or a target beyond the tool ceiling routes to the Layout Editor with an explanatory affordance instead of opening. Multi-page files (PDF) never open here — typed reject with a route-away message. *Done when:* HEIC e2e passes in the Docker/live lane; the layout handoff lands a correctly-sized picture; the oversize test proves the routing rule.

### PE8 — Clean Up (honest stand-in)

Brushed mask UI → `erase{maskAssetId}` op → server-side classical fill (patch-from-surround + blend) in the render host, returned as a **previewed, approvable** step — the suggest-never-auto-apply posture the AI features will inherit. Labeled in-UI as basic cleanup ("removes small marks; a smarter fixer is coming"). *Done when:* the date-stamp/phone-number corpus cases produce acceptable small-region results; the preview-approve-undo loop works; the model-service seam is documented in STUBS.md.

### PE9 — Hardening & harness

`fixtures/photo-corpus/` finalized (phone JPEGs, HEICs incl. Live, low-res logo, screenshot, huge TIFF, AI-generated art, scanned doc; hostile set: polyglot, truncated, pixel-flood, zip-bomb-class PNG, SVG with entities/scripts — provenance noted per file, synthetic where real files aren't shippable). Perf budget gates in CI (open/adjust/export timings against recorded budgets). Adversarial suite green against the jail. STUBS.md sweep; "Reset demo photo" affordance; README status update. *Done when:* CI runs unit + e2e + live lanes green including the photo suites; every budget is measured, met, or recorded as an honest limit.

---

## 5. Testing strategy

- **Unit (Vitest, colocated `*.test.ts`):** pure modules carry the weight — `adjust-math` per-parameter reference arrays, `geometry` (crop/rotate/DPI), `fit` anchor matrix, `bleed` strategy pick, `sizes`, `pdf-wrap` (parse the emitted boxes back out of the bytes), schema + store (recipe cursor semantics, merge/migration), `limits`, sniff/caps rejects.
- **Golden-recipe harness (the corpus-fidelity precedent):** committed recipes × corpus files → committed goldens; exact pixel-diff for server renders, tolerance-diff for client-proxy parity; `refresh-photo-goldens.mjs` + CI drift gate (`git status --porcelain`), mirroring the `.pub` trace discipline.
- **E2E (Playwright):** `photo-editor.spec.ts` — open→crop→adjust→export happy path on the always-live core (no fixture mode needed); money-shot flows; oversize route-away; `data-testid` + `data-hydrated` conventions.
- **Adversarial:** hostile-file suite against intake (caps, kill classification, jail cleanup verified), oversized-recipe and malformed-Zod payloads against render (client is untrusted).
- **Perf gates:** PE0's latency harness graduates into CI budget checks; fleet-hardware numbers are collected at the hardware-lab pass and recorded against the CI proxies (honest-limit note until then).
- **CI lanes:** photo unit/e2e ride the existing `checks` + `e2e` lanes (sharp installs with `npm ci`); HEIC + golden drift-gating extend the `live-import` lane (adds `libheif-examples`).

---

## 6. Deferred backlog (how the rest grows)

- **P2 assistive wave (feature plan E6/E7):** color-matching helper, spot heal, red-eye, sharpen/noise, background removal, AI-artwork cleanup preset, low-res upscale, highlight-to-change, batch apply. All blocked on the **model-service decision** (hosting, cost, DPA — feature plan §5.5 #1) and, for highlight-to-change, the prompt-injection controls [CRITICAL][AI]. The recipe schema already reserves the shape: each arrives as one more previewed op type.
- **Konva convergence:** when the layout K-tranche lands, the overlay/handle layer here converges onto the shared interaction code; the `<canvas>` proxy surface likely survives as-is underneath a Konva stage. Tracked with open question #1.
- **Catalog/product-size `[INT]`:** `sizes.ts` presets swap for the product-spec service when the spec-sync slice lands (same seam as the layout editor's inert product picker); product-SKU crop presets and "born correct" bleed values follow.
- **Order integration `[INT]`:** pull-from-order and save-back ride the shared backbone write-path (suite Phase 5); the file-header context slot is already in the shell.
- **CMYK-intent export / soft-proofing:** needs press ICC profiles from the print-shop integration; POC exports sRGB-tagged. The Royal-Blue test case goes into the corpus **now** so the eventual fix has its acceptance test waiting.
- **Send to Print Setup / imposition:** the surface doesn't exist; `fit.ts`'s documented contract is the handshake prepared for it.
- **Edit-effort summary for pricing (feature plan §5.5 #4):** the recipe *is* the operations log — emitting a summary is nearly free once a business owner exists; parked.
- **Real AV, microVM isolation, egress jail, station hygiene wipe:** production security deferrals per §3.6.

---

## 7. Open questions / assumptions (proceeding with the recommendation unless redirected)

1. **Konva now or at K-tranche?** *Recommendation: not now.* A single-raster editor gets little from a scene graph; adopting Konva here first would fork the suite's interaction code instead of sharing it. Revisit when the layout K-tranche lands (it, not this tool, is the convergence driver). If the suite instead standardizes on Konva before PE6, the overlay layer adopts it then.
2. **CMYK export depth at launch** (feature plan §5.5 #2): *assumption — POC ships sRGB-embedded exports only*; ICC-transform CMYK waits for real press profiles. The corpus carries the Royal-Blue case from day one.
3. **Working-master fidelity:** re-encoding on ingest (CDR) trades a sliver of quality for the sanitization posture. *Assumption: acceptable for counter work; PE0 picks the codec and documents the measured loss.* If review disagrees, the alternative (retain originals in the jail-side store) needs the PII-retention conversation first.
4. **Homepage fast path:** does the Photo Edit card open an empty editor (pick a file inside) or a picker directly (`PubConvertCallout` pattern)? *Assumption: empty editor with a large drop target — matches the "instant open" mental model; revisit with the handoff package.*
5. **Proxy ceiling 2048 px / master ceiling 80 MP** are engineering guesses pending PE0 measurements; both are `limits.ts` constants, cheap to move.
6. **The feature plan's E0 Konva premise** (§1.2 finding 1) should be corrected in `PHOTO_EDITOR_PLAN.md`'s next revision by its owner; this plan is written against the repo as it stands.

---

*Bottom line: the Photo Editor lands on the seams this POC has already proven — the jailed-native-engine pattern from `.pub` import, the schema/store/blob conventions from the layout editor, the honest-degradation pattern from fixture mode — and adds the one thing the suite doesn't have yet: a stateless proxy/recipe/re-render spine with `sharp` in a jail and parity guaranteed by shared pixel math. Three commits in (PE3) the architecture is proven end-to-end on real photos; three more (PE5) and the counter's daily grind — Fix Bleed, Fit to Size, honest DPI — is live; everything model-shaped stays a labeled seam instead of a promise.*
