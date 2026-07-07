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
- **Page-number fields import as literal '#'** (upstream): the trace carries Publisher's
  page-number field as plain text with no field callback. One aggregate import note names the
  affected frame count; substituting the real page number at import is a cheap later add
  (`src/lib/import/mapper.ts`).
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
