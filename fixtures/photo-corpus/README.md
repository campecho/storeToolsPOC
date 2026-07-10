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
| `recipes/*.json` | **Authored** (hand-written payload; `compiled` block generated once via `compileRenderPlan`) | Golden-recipe inputs (PE3). Each file is `{ source, payload, compiled }`: `source` names a corpus image (resolved from `public/`), `payload` is a `RenderPayload` (recipe + format + quality), and `compiled` is the `{ steps, out }` the TS compiler produced for that source's dimensions — see the contract below. `geometry-chain` (crop 4×6 → rotate right → straighten −1.2°, JPEG q90), `shape-circle` (circle crop to 1:1, PNG), `plain-crop` (simple rect crop, PNG), `adjust-tone` (crop 4×6 → brightness +12 → saturation +20 → warmth +5, JPEG q90 — the PE4 tone/colour pass; its `compiled.steps` ends in a single terminal `adjust` step carrying the folded per-channel LUTs + saturation matrix). |
| `goldens/*.{jpg,png}` | **Generated** (`npm run refresh:photo-goldens`) | The committed expected bytes for each recipe, produced by the real render path (`render-host` → `photo-worker.mjs` → sharp). `golden.test.ts` asserts `renderImage(master, payload)` equals these byte-for-byte; CI drift-gates them. All are well under 1 MB (the synthetic demo compresses tightly); the rotated `geometry-chain` JPEG is the largest at ~360 KB. |

### The precompiled-steps contract (PE3 golden harness)

`render-host.ts` is TypeScript and owns `compileRenderPlan` (recipe → worker
`steps`); the refresh script (`scripts/refresh-photo-goldens.mjs`) is plain
ESM and **cannot import it**. So each recipe commits its `compiled` block — the
exact `{ steps, out }` the compiler emitted for `photo-demo.jpg`'s dimensions,
generated once. The refresh script stays "dumb": it spawns `photo-worker.mjs`
(the same worker the host drives) on the *committed* steps, replicating the
host's render-job protocol, and writes `goldens/<name>.<ext>`.

The committed steps and the live compiler can't silently diverge: `golden.test.ts`
asserts `compileRenderPlan(payload.recipe, demoDims)` deep-equals the committed
`compiled` (compile parity), then that `renderImage` output equals the golden
(the drift gate's teeth) and that two renders are byte-identical (determinism,
the PE3 done-when). Change the compiler and the parity assertion fails until the
recipe is regenerated.

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
