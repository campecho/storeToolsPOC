# Photo corpus

Real-file corpus + committed goldens for the Photo Editor
(`docs/PHOTO_EDITOR_IMPLEMENTATION_PLAN.md` §5). The full corpus — phone
JPEGs, HEICs incl. Live photos, low-res logo, screenshot, huge TIFF,
AI-generated art, scanned doc, plus the hostile set — is finalized at PE10;
until then it grows tranche by tranche, provenance noted per file.

## Files

| File | Provenance | Role |
|---|---|---|
| `../..​/public/photo-demo.jpg` | **Synthetic** (SVG scene rasterized via sharp — `scripts` history in the PE1 commit; no third-party content) | The demo photo behind `/photo?demo=1` and the e2e open test. 4032 × 3024 px — the wire's headline dimensions and the 672-DPI-at-4×6 worked example. Served from `public/` so the client can fetch it; treated as corpus member #1. |
| `royal-blue.png` | **Synthetic** (sharp raw-buffer composite; no third-party content) | The Royal-Blue print-correctness case (PE5). 400 × 300 px: a royal-blue `#4169E1` field over a white/mid-gray swatch strip — the classic RGB blue that shifts in a CMYK separation. A **fixtures-local source** (resolved from the corpus dir, not `public/`), consumed by `royal-blue-cmyk.json`. |
| `overlays/banner.png`, `overlays/logo.png` | **Synthetic** (SVG rasterized via sharp; no third-party content) | The Text & image overlay rasters (PE6). `banner.png` is a 300 × 80 semi-transparent text-like banner (a white rounded rect at ~72% alpha with a full-alpha dark band through its vertical centre); `logo.png` is a 120 × 120 logo-ish mark (a red disc at 95% alpha with a white bar, transparent outside the disc). Both carry an alpha channel. The client rasterizes overlays server-font-free (§3.3); these stand in for that output. Referenced by `text-logo.json`'s `attachments` map. |
| `recipes/*.json` | **Authored** (hand-written payload; `compiled` block generated once via `compileRenderPlan`) | Golden-recipe inputs (PE3/PE5/PE6). Each file is `{ source, payload, compiled }` (plus, for overlay recipes, `attachments`): `source` names a corpus image (resolved **fixtures-local first, then `public/`**), `payload` is a `RenderPayload` (recipe + format + quality + optional intent/printTarget/**overlays**), and `compiled` is the `{ steps, out }` the TS compiler produced for that source's dimensions — see the contract below. `geometry-chain` (crop 4×6 → rotate right → straighten −1.2°, JPEG q90), `shape-circle` (circle crop to 1:1, PNG), `plain-crop` (simple rect crop, PNG), `adjust-tone` (crop 4×6 → brightness +12 → saturation +20 → warmth +5, JPEG q90 — the PE4 tone/colour pass ending in a terminal `adjust` step), `bleed-mirror` (crop 4×6 → **bleedExpand mirror px 84**, JPEG q90 — the PE5 `extend` step; `compiled.steps` = extract + extend), `royal-blue-cmyk` (**empty recipe, format tiff, intent cmyk** on `royal-blue.png` — the RGB→GRACoL separation; the golden is the CMYK TIFF), `text-logo` (crop 4×6 → **overlays: banner at (200,200), logo at (3600,2300)**, JPEG q90 — the PE6 `composite` steps; `compiled.steps` = extract + two composites; the raster bytes come from `attachments` mapping each overlay `id` to a corpus-relative PNG, written into the jail as `overlay-<id>.png`). |
| `goldens/*.{jpg,png,tiff}` | **Generated** (`npm run refresh:photo-goldens`) | The committed expected bytes for each recipe, produced by the real render path (`render-host` → `photo-worker.mjs` → sharp). `golden.test.ts` asserts `renderImage(master, payload)` equals these byte-for-byte; CI drift-gates them. Most are well under 1 MB; the exception is `royal-blue-cmyk.tiff` (~3.5 MB — it carries the embedded 3.4 MB GRACoL profile, which `golden.test.ts` asserts is byte-identical to the committed `.icc`). The CMYK golden additionally checks output space `cmyk` / 4 channels / determinism; the overlay golden (`text-logo.jpg`) additionally spot-checks that the banner's centre pixel differs from a no-overlay render of the same recipe. |

### The precompiled-steps contract (PE3 golden harness)

`render-host.ts` is TypeScript and owns `compileRenderPlan` (recipe → worker
`steps`); the refresh script (`scripts/refresh-photo-goldens.mjs`) is plain
ESM and **cannot import it**. So each recipe commits its `compiled` block — the
exact `{ steps, out }` the compiler emitted for `photo-demo.jpg`'s dimensions,
generated once. The refresh script stays "dumb": it spawns `photo-worker.mjs`
(the same worker the host drives) on the *committed* steps, replicating the
host's render-job protocol, and writes `goldens/<name>.<ext>`.

The committed steps and the live compiler can't silently diverge: `golden.test.ts`
asserts `compileRenderPlan(payload.recipe, demoDims, payload.overlays)` deep-equals
the committed `compiled` (compile parity), then that `renderImage` output equals
the golden (the drift gate's teeth) and that two renders are byte-identical
(determinism, the PE3 done-when). Change the compiler and the parity assertion
fails until the recipe is regenerated.

**Overlays (PE6).** A recipe that composites overlays adds an `attachments` map
(overlay `id` → corpus-relative PNG) alongside `payload.overlays`. `compileRenderPlan`
appends one `composite` step per overlay entry after the terminal adjust step
(referencing the jail basename `overlay-<id>.png`); the refresh script and
`golden.test.ts` write each attachment into the jail under that basename via the
same extraFiles mechanism the render host uses. The overlay golden also carries a
pixel spot-check (the banner region differs from a no-overlay render).

**Refresh workflow:** `npm run refresh:photo-goldens` regenerates the goldens
from the committed recipes; the CI live-import lane runs it and fails on any
`git status --porcelain fixtures/photo-corpus` drift (the `.pub`-trace
discipline). Determinism makes a clean re-run a no-op. Regenerate the `compiled`
blocks only when the compiler's output legitimately changes — recompute them
through `compileRenderPlan` in a TS context (a throwaway vitest run) and
re-commit the recipes.

Hostile-file cases at PE1 (disguised non-image, truncated JPEG, pixel-flood
PNG) are synthesized inline by the unit tests (`src/lib/photo/*.test.ts`,
`src/lib/import/image-meta.test.ts`) — tiny deterministic buffers beat
committed binaries while the set is small. Files land here once goldens
need stable committed bytes (PE3's golden-recipe harness).
