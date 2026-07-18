# STUBS.md — what isn't real, and what "real" requires

The dev-team-first registry (per the prototype rules, §2.5): every stub, mock, and
deliberately-inert affordance in this POC, with the swap story. Regenerate the raw list any
time with:

```bash
grep -rnE "STUB:|MOCK:|PROTOTYPE-ONLY:|CONTRACT:|PROD-TODO:|ASSUMPTION:" src/
```

**Scope note:** the POC is fully client-side — there is no backend, auth service, or external
API yet. The seams below are where those arrive. The Zod schemas in `src/lib/schema/` are the
portable contracts (`CONTRACT:` tags); a committed example document lives at
`fixtures/layout-document.v1.json`.

## Seams & stubs

| Area | File(s) | What's faked | To make real |
|---|---|---|---|
| Station identity | `src/lib/identity.ts` | Hardcoded `#1284` behind `getCurrentStation()` | Real station/associate resolution (device registration or SSO). Swap touches only this file. |
| Persistence — tracker | `src/lib/store/feedback-store.ts` | `localStorage` (`stp-feedback-v1`), schema-validated on rehydrate | Backend persists the `PersistedFeedbackSchema` shape per store, keyed by station identity. |
| Persistence — layout docs | `src/lib/store/layout-store.ts` | `localStorage` (`stp-layout-v1`), schema-validated on rehydrate; **v1→v2 documents migrate on load** (P2, `src/lib/schema/layout-v1.ts`) — the production posture, already practiced | Backend persists `LayoutDocument` per publication with the same migrate-on-read pattern. |
| Asset bytes (L8) | `src/lib/assets/blob-store.ts` | IndexedDB blobs keyed by the asset id in `doc.assets` (metadata stays in the document) | Real asset service: upload, dedupe, quotas, orphaned-blob GC. Swap touches only this file — the id → bytes mapping is the seam. |
| Tracker demo data | `src/lib/data/seed-*.ts` | Seeded items/releases/notifications (authored wire content); "Reset demo data" restores it | Real feedback/release feeds; seeds become test fixtures. |
| Captured bug context | `src/components/report/CapturedContextPanel.tsx` | Canned capture rows behind a **"Sample data" badge** | Tool surfaces publish live context (file, SKU, recent actions, environment) into the store; the panel reads it. |
| Release participation | `src/components/board/BoardRail.tsx` (`TOP_STORES`) | Fixture store list | Query stores that backed items in the latest release. |
| Rollup hierarchy | `src/components/board/BoardRail.tsx` | "Region · Northeast" / "District 118" demo labels | Real region/district from store identity. |
| Product/SKU binding | `src/components/layout-editor/inspector/PageTab.tsx` | "Choose a product →" link is inert; `doc.product` schema field already renders when set | Catalog/spec-sync slice (plan §6) wires the picker; the schema needs no change. |
| Fonts — Motiva Sans | `src/lib/layout/font-catalog.ts`, `public/fonts/README` | Motiva Sans renders via system fallback (licensing pending) | License + drop WOFF2 files into `public/fonts/` (README there documents the exact step). The **import font library shipped in P2**: 8 libre stand-in families self-hosted under `public/fonts/` with lazy FontFace loading (`webfonts.ts`) and the remap table as data (`src/lib/import/font-remap.ts`). |
| `.pub` conversion subprocess (P1) | `src/lib/import/pub2raw.ts` | Shells out to a local `pub2raw` (Docker image only); **fixture mode** serves the golden demo trace when the binary is absent or `STP_IMPORT_FIXTURE=1` | Production calls the backbone's sandboxed conversion service — the swap touches only this file (plan §10.7 seam #1). |
| Import client/service boundary (P1) | `src/lib/import/client.ts`, `src/app/api/import/route.ts` | POC route in the app's own container; in-memory request handling | The Zod contract (`{doc, report}` per `LayoutDocumentSchema` + `ImportReportSchema`) is the interface a production conversion service implements; the client module is the only caller (plan §10.7 seam #2). |
| Import server state | `src/app/api/import/route.ts` | Stateless per-request today, but the server tranche (import jobs, proof sessions) assumes **one instance** | Real job/session store; until then deploy single-instance (Cloud Run `max-instances=1`). |
| AV scan on ingest | `src/lib/import/pub2raw.ts` (`avScanHook`) | Logging stub — the seam exists, nothing scans | Suite AV decision (ClamAV vs. commercial) plugs in here (plan §10.1). |
| Subprocess rlimits (P5) | `src/lib/import/pub2raw.ts` (`prlimit` wrapper), `src/lib/import/limits.ts` | **Built, not stubbed** — live conversion runs under `prlimit --cpu --as`; where `prlimit` is absent (macOS dev) it runs unwrapped and `importDiagnostics().rlimits` says so. Caps are `STP_*`-env-overridable **for the adversarial harness only** — production never sets the overrides; the defaults ARE the enforced limits. | Container-level isolation beyond the process (namespaces/microVM) stays production-deferred (plan §10.1 open decision #1). |
| ~~Import report UI~~ **shipped (P4)** | `src/components/layout-editor/panel/ImportReportPane.tsx` | The report renders as a side-panel "Review" tab with deep-linked notes/fonts/overset (plan §10.4) — no longer a stub. | — |
| Extracted-image transport (P3) | `src/lib/import/report.ts` (`ImportAssetsPayloadSchema`), `src/lib/import/client.ts` | Image bytes ride the import response as base64 JSON and seed client IndexedDB | A production conversion service stores assets and returns URLs; the client seam (decode → `replaceAssetBlobs`) is the only code that changes. Note: extracted images bypass the ingest AV hook — production scans derived content too (plan §10.1). |
| Persistence — photo docs (PE1) | `src/lib/store/photo-store.ts` | `localStorage` (`stp-photo-v1`), schema-validated on rehydrate; history is the recipe cursor (no snapshot stacks — plan §3.4) | Backend persists `PhotoDocument` keyed by station identity, same migrate-on-read posture as layout docs. |
| Photo decode jail (PE1) | `src/lib/photo/render-host.ts`, `src/lib/photo/photo-worker.mjs` | **Built, not stubbed** — `sharp` loads only in a spawned per-job jail (`mkdtemp` wiped in `finally`, `prlimit --cpu --as` where available, wall-clock SIGKILL, kill classification, bounded output). Worker path resolves from `process.cwd()`; the Docker/standalone story landed at PE10a — Next's file trace stages the worker + GRACoL profile, `outputFileTracingIncludes` (next.config.ts) carries the spawned worker's `sharp` import the trace can't see, `jailed.worker` in GET diagnostics reports the resolution, and the `docker` CI lane boots the image and round-trips intake+render. | Production render service; microVM-class isolation, egress jail stay deferred (photo plan §3.6). |
| HEIC ingest (PE7) | `src/lib/photo/heic.ts` | **Built, not stubbed** — the `heif-convert` (libheif-examples) probe gates the capability matrix and a jailed subprocess transcodes HEIC → JPEG that re-enters intake (`mkdtemp` wiped in `finally`, intake `prlimit --cpu --as` where available, wall-clock SIGKILL, kill classification; a multi-image Live photo yields its primary still). Where absent (plain dev), intake returns a typed `unsupported-here` and the diagnostic says so. | Docker, the CI live lane, and the CI e2e lane install `libheif-examples`; a production sandboxed remote-decode service swaps in — the swap touches only this file (photo plan §3.5, §10.7). |
| Photo intake transport (PE1) | `src/lib/photo/client.ts`, `src/app/api/photo/intake/route.ts` | Master + proxy bytes ride the response as base64 JSON and seed client IndexedDB (`photo:`-namespaced, non-destructive writes — the shared blob store's replace/clear helpers are never called) | A production service stores assets and returns URLs; `client.ts` is the only caller (import seam #2 pattern). Photo intake calls the shared `avScanHook` (still the logging stub). |
| CMYK-preserving path (PE5) | `src/lib/photo/lcms.ts` | `tificc` (liblcms2-utils) probe + jailed identity-intent re-encode — the v1.4 named fallback for sharp's forced CMYK→sRGB unpack. Where absent (plain dev), `cmykPreserve: false` in diagnostics, no `cmykMaster` intake leg, and every CMYK export re-separates through GRACoL with an honest `X-Photo-Reseparated` header. Preserve is TIFF-output-only (no sharp-free CMYK→JPEG/PDF path at POC — documented decision table in the render route). | Docker/live lane install `liblcms2-utils`; a production color service (or a libvips built with CMYK passthrough) widens the preserve path beyond TIFF. |
| Clean up — classical fill (PE9) | `src/lib/photo/photo-worker.mjs` (`classicalFill`), `src/lib/photo/render-host.ts` (`eraseFill`), `src/app/api/photo/erase/route.ts` | "Remove object" is a **classical fill** (onion-peel patch-from-surround + soft-mask blend), NOT a model — the honest stand-in the plan ships while the model service is undecided (photo plan §4 PE9; labeled in-UI as basic cleanup). It runs ONCE at preview time; the approved patch is STORED-EXPLICIT on the `erase` op, so canvas replay and export composite the approved pixels and never re-fill. Spot heal / Red-eye / Remove background / "Fix an AI-generated file" render disabled — "coming with the model service" (dev #3). | The model-service decision (hosting/cost/DPA, feature plan §5.5 #1) swaps the fill behind the SAME seams: the `erase{maskAssetId, patch}` op (the brushed mask is the kept intent a real inpaint model re-runs from), the `/api/photo/erase` preview call, and the PreviewApproveBar approve loop. UI and schema are untouched by the swap; only the fill implementation changes. |
| `.puz` CAB compression (P4) | `src/lib/import/cab.ts` | Pure-TS MSCF reader unpacks STORED + MSZIP folders; Quantum/LZX return an honest `unsupported-compression` 422. P5 adds an adversarial suite (`cab-adversarial.test.ts`): decompression-bomb cap, entry-count storm, truncation/size-lie handling, path-traversal names proven inert (extraction is fully in-memory — hostile names never reach a filesystem sink). | Untested against a real Publisher pack-and-go (no sample exists); MSZIP inverts our own encoder in tests but byte-compatibility with Publisher's packer is unconfirmed. If field `.puz` files use LZX, add a decoder (or `cabextract` in the image) here — the route seam is unchanged. |

## Inert-by-design affordances (`PROTOTYPE-ONLY:`)

Visible-but-static chrome, kept so the tool's ceiling reads as reachable (each maps to a
deferred slice in `docs/LAYOUT_EDITOR_PLAN.md` §6):

- Editor ribbon: **File** tab (open/save/export), **Arrange/View/Help** tabs, Home band's
  Clipboard/Editing groups + list/¶ controls + Styles "+ New", Insert band's
  Masters/Shapes/Table/Hyperlink tiles, Text band's Space + Link boxes/Wrap.
- Status bar: two-page **spread** view toggle (facing pages, plan §6).
- App header: global search face and the avatar circle (future suite surfaces).
- Tool palette: the **Table** tool arms but reports "coming later in the beta" honestly.
- Assets tab: **PDF assets are library-only** — the tile says so and placement is
  disabled until the print pipeline can rasterize them (plan §6).
- Home band's **font-color swatch** reads the frame's dominant ink (per-run color renders
  since schema v2) but opens no picker yet — imported colors display and survive editing;
  choosing a new ink is a later slice.
- **Path objects** (from `.pub` import) move/resize/rotate/align like any frame — segment
  (node) editing is not offered; the normalized-path model supports it later.
- Text styling (B/I/U, family, size, color) applies to the **whole frame** — the schema
  carries per-run styles (imports keep theirs through edits), but selection-scoped styling
  controls are a later slice.
- **Photo editor (PE1 shell)** — every designed-but-unbuilt control renders honest, never
  hidden (photo plan §2 deviations): the six contextual panels are placeholder cards naming
  their tranche ("Lands with PE2…PE9"); Auto-enhance + Compare disabled (PE4); the print
  strip's Target/DPI-chip/Bleed segments inert (PE5) and History disabled (PE2); the
  title-bar order chip is demo-only session state (dev #4, `[INT]`); Simple/Standard is the
  two-segment control (dev #2). Quick fixes navigate to the placeholder panels — guaranteed
  entry points from day one. PE5 additions: Fix for print's "Pick a catalog product →"
  (dev #5, spec-sync slice), the upscale rescue card's Upscale button (dev #3, model
  service) with "Print as-is" as the honest path, and the "New to bleed? 60-second guide →"
  link (help pass). The DPI chip is advisory by design — red/amber never gate export.
  PE9 closes the panel set: Clean up ships the live brushed **Remove object** (the
  classical-fill stand-in — see its seam row above) behind the PreviewApproveBar's
  suggest-never-auto-apply loop; its model-backed siblings — Spot heal, Red-eye,
  Remove background, and the "Fix an AI-generated file" card — render disabled,
  "coming with the model service" (dev #3), beside the PE5 upscale button.

## Known gaps (`PROD-TODO:`)

- **Storage migrations:** the layout store now MIGRATES v1 documents to v2 on load (P2,
  `src/lib/schema/layout-v1.ts`) — unrecognizable shapes still fall back to pristine. The
  feedback store still drop-and-reseeds on mismatch; production migrates there too
  (`src/lib/store/feedback-store.ts`).
- **Storage write failures:** quota/private-mode write errors only log; needs a visible
  "changes aren't being saved" state (both persist configs, and the asset blob store).
- **Orphaned asset blobs:** undoing a place (or clearing history) can leave bytes behind
  in IndexedDB — no GC in the POC. A placed frame whose asset was *removed* shows the
  visible "Image missing" state by design (`src/lib/assets/blob-store.ts`).
- **PII:** associate names + free-prose report/comment text are unclassified
  (`src/lib/schema/index.ts`); set classification/retention before data leaves the browser.
- **Referential integrity:** `page.masterId` is a guarded soft reference; a real store
  enforces it on write (`src/lib/schema/layout.ts`).
- **File-size watch:** `layout-store.ts` (~750 lines) and `CanvasViewport.tsx` (~600) should
  split (store slices; gesture hook) as L7+ grows them.
- **Import autofit is import-time only** (v1.10): `computeAutofit` scales remap-widened text
  to fit (floor 0.88, reported as "Auto-fitted" notes; `text.fontScale` in schema v2) when
  the font-gated check runs after an import — but **editing or resizing a frame does not
  re-run the fit**. The live overflow badge is the honest fallback there; a "re-fit" quick
  action on a badged frame is a later slice (`src/lib/import/overset.ts`,
  `src/components/layout-editor/OversetCheck.tsx`).
- **Text wrap around pictures isn't imported** (upstream, corpus-verified): libmspub emits no
  wrap data at all, so body copy Publisher wrapped around inline images lays out through the
  full frame and higher-z pictures cover it. Mitigation shipped (v1.11): a z-order-aware
  import note per covered frame ("text may be hidden behind an image"). Real wrap belongs to
  the K-tranche text-layout module (`src/lib/import/mapper.ts`).
- **Page-number fields are substituted at import** (v1.11): the trace carries Publisher's
  page-number field as a literal '#' with no field callback, so the importer fills in each
  page's real number for STANDALONE '#' tokens in header/footer-band frames (shared rule:
  `src/lib/import/page-number.ts`; glued '#'s like "#1 Store" are content and stay), reported
  as one aggregate corrected-kind note. Honest limits: the substituted value is the 1-based
  page index (a custom Publisher start number isn't recoverable from the trace), and a
  mid-page page-number field wouldn't be caught by the band heuristic.
- **Flip correction covers client-anchored shapes only** (v1.11): shapes inside groups carry
  child anchors needing the parent coordinate transform — they come back bbox-less from
  `escher.ts` and can never anchor a correction (conservative miss, never a guess). No corpus
  case exercises this; pages with `sizeOverride` similarly fall back to uncorrected.
- **Master pages don't survive `.pub` import** (upstream): libmspub never emits master-page
  content, so publications whose content lives on masters convert **empty** — real corpus
  case: `fixtures/pub-corpus/business_card_template_10up.pub`. The mapper flags it tier-3
  ("no drawable page content"); a fix means going below libmspub (research doc's
  reverse-engineering appendix) or accepting the gap for the on-ramp
  (`src/lib/import/mapper.ts`).
- **Page margins / ruler guides / columns / bleed aren't imported** (upstream, corpus-verified):
  libmspub's `startPage` exposes only width/height — no page-level layout metadata anywhere in
  the trace. Imported docs take editor defaults (margin 0.5in, bleed 0, 1 column, no guides);
  page **size** is imported (incl. per-page). The correct source for print margins/bleed is the
  product spec on catalog binding (plan §6), not the customer's `.pub` (`src/lib/import/mapper.ts`,
  plan §10.3).

## Assumptions to confirm (`ASSUMPTION:`)

| Value | Where | Guess |
|---|---|---|
| Station id `#1284` | `src/lib/identity.ts` | Demo copy from the wires |
| Region/district labels | `src/components/board/BoardRail.tsx` | "Northeast" / "District 118" |
| Station/app version copy | `src/components/report/CapturedContextPanel.tsx` | "Station POS-3 · v1.3.2" |
| Undo depth 50 | `src/lib/store/layout-store.ts` | Desktop-publishing norm |
| Zoom 10–400%, page 1–240 in | `src/lib/layout/geometry.ts` | Working-range guesses (large-format friendly) |
| Snap radius 6px (screen) | `src/lib/layout/snap.ts` | Feel-based; confirm on store hardware |
| Placed images: 96 DPI sizing, 2 in minimum, cover-fit | `src/lib/assets/placement.ts`, `canvas/ObjectNode.tsx` | CSS-pixel mapping; no embedded print-DPI read; `fit` modes are schema-v2 (plan §9) |
| Rotated-object bounds by axis-aligned box (AABB) | `src/lib/layout/snap.ts`, `canvas/CanvasViewport.tsx` | Honest simplification (plan L10): a rotated object snaps/aligns and is hit-tested (marquee select, asset drop) by its AABB, and edge-snapping is off while resizing a rotated frame. True rotated-edge snapping / polygon hit-testing is a later refinement. |
| Guide grab radius 5px (screen); guides snap on with the Guides toggle | `canvas/CanvasViewport.tsx`, `src/lib/layout/snap.ts` | Feel-based (plan L11): a board-level hit-test grabs the nearest ruler guide within ~5px; objects on top win. Click selects a guide (Delete removes); guides span the whole workspace but are document-level — no per-spread or angled guides yet. |
| Display units in/mm/px/pt at 96 DPI | `src/lib/layout/units.ts`, `StatusBar.tsx` | Geometry stays canonical inches; the unit is a display/parse layer (`px` = CSS px at DPI 96, not print-DPI). Per-region default (metric vs imperial) and a print-DPI read are later. |
| Curated font list | `src/lib/layout/text.ts` | In-store set TBD; Motiva licensing pending |
| Recently-shipped band window (7 days) | board logic / seeds | Product to confirm |
| ~~Import rotation sign~~ **resolved** | `src/lib/import/mapper.ts` | Verified against the real corpus: `librevenge:rotate` passes through unchanged — clockwise about the frame center, matching pub2xhtml's reference render of `3up_tabs.pub` |
| Publisher default line spacing 1.19 | `src/lib/import/mapper.ts` | Used when the trace carries no `fo:line-height` (plan §10.5); corpus shows explicit 125% where set — visual confirm still pending a side-by-side render |
| Import caps: 25 MB / 20 s | `src/lib/import/limits.ts` | POC guesses per plan §10.1; tune on the corpus |
