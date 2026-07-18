# Photo corpus

Real-file corpus + committed goldens for the Photo Editor
(`docs/PHOTO_EDITOR_IMPLEMENTATION_PLAN.md` §5). The **hostile set** landed as
committed artifacts at PE10c (`hostile/`, below); the **benign finalizers** —
screenshot, huge TIFF, AI-generated art, scanned doc, an EXIF-oriented phone
JPEG — landed at PE10d (`scripts/make-benign-fixtures.mjs`). Provenance noted
per file; everything is synthetic/authored (no third-party content). One benign
case stays deferred with an honest reason: the **multi-image Live-photo HEIC**
(primary-still extraction) needs `heif-enc` (libheif-examples) at *generation*
time, which the base dev/CI environment lacks — `iphone-still.heic` covers
single-image HEIC intake today, and the Live-photo fixture lands when the tool
is present.

## Files

| File | Provenance | Role |
|---|---|---|
| `../..​/public/photo-demo.jpg` | **Synthetic** (SVG scene rasterized via sharp — `scripts` history in the PE1 commit; no third-party content) | The demo photo behind `/photo?demo=1` and the e2e open test. 4032 × 3024 px — the wire's headline dimensions and the 672-DPI-at-4×6 worked example. Served from `public/` so the client can fetch it; treated as corpus member #1. |
| `royal-blue.png` | **Synthetic** (sharp raw-buffer composite; no third-party content) | The Royal-Blue print-correctness case (PE5). 400 × 300 px: a royal-blue `#4169E1` field over a white/mid-gray swatch strip — the classic RGB blue that shifts in a CMYK separation. A **fixtures-local source** (resolved from the corpus dir, not `public/`), consumed by `royal-blue-cmyk.json`. |
| `iphone-still.heic` | **Synthetic** (sharp raster → heif-enc; no third-party content) | The PE7 HEIC-live intake case — the "HEIC Live photo → printed 4×6 with zero external tools" path. 640 × 480 px; consumed by the intake unit test and the photo-editor e2e. Encoded as an **uncompressed** HEIF (the only encoder `libheif-examples` ships — no HEVC/AVIF plugin), so it is ~1.2 MB and decodes in any libheif build with no codec plugin; it sniffs as `image/heic` (a `mif1` compatible brand) and `heif-convert` transcodes it to JPEG at intake. A **fixtures-local source** (resolved from the corpus dir, not `public/`). |
| `overlays/banner.png`, `overlays/logo.png` | **Synthetic** (SVG rasterized via sharp; no third-party content) | The Text & image overlay rasters (PE6). `banner.png` is a 300 × 80 semi-transparent text-like banner (a white rounded rect at ~72% alpha with a full-alpha dark band through its vertical centre); `logo.png` is a 120 × 120 logo-ish mark (a red disc at 95% alpha with a white bar, transparent outside the disc). Both carry an alpha channel. The client rasterizes overlays server-font-free (§3.3); these stand in for that output. Referenced by `text-logo.json`'s `attachments` map. |
| `date-stamp.jpg`, `phone-number.jpg` | **Synthetic** (`scripts/make-cleanup-fixtures.mjs` — SVG scenes + seeded-LCG texture rasterized via sharp; the stamp digits are font-free vector seven-segment; no third-party content, no real dates/numbers) | The PE9 Clean-up corpus cases — the plan's "remove the date stamp / old phone number" done-when pair (photo plan §4 PE9). 1200 × 900 px each. `date-stamp.jpg` is a photo-like scene (sky gradient, textured ground) with an orange seven-segment `05·14·26` film-camera stamp bottom-right; `phone-number.jpg` is a poster whose heading must SURVIVE the fill, with a large `555-0142` to remove. **Fixtures-local sources**, consumed by the erase fill-quality tests. |
| `masks/date-stamp.png`, `masks/phone-number.png` | **Synthetic** (same script) | The matching brushed masks in the erase mask contract (`ErasePayloadSchema`, PE9): GRAYSCALE-ON-BLACK, opaque — luminance 0 = keep, 255 = remove, soft radial edges = the blend feather — built as overlapping soft dabs along each target, the same shape the brush overlay produces. |
| `patches/date-stamp.png` | **Generated** (`eraseFill` on `date-stamp.jpg` + `masks/date-stamp.png`, once — deterministic) | The stored-explicit erase patch (PE9) the `erase-fill` golden composites (mirrors `overlays/`). 420 × 150 RGBA — the classical fill's result for rect `{780,740,420,150}`; committed so replay never re-runs the fill (`EraseOpSchema.patch`). |
| `recipes/*.json` | **Authored** (hand-written payload; `compiled` block generated once via `compileRenderPlan`) | Golden-recipe inputs (PE3/PE5/PE6). Each file is `{ source, payload, compiled }` (plus, for overlay recipes, `attachments`): `source` names a corpus image (resolved **fixtures-local first, then `public/`**), `payload` is a `RenderPayload` (recipe + format + quality + optional intent/printTarget/**overlays**), and `compiled` is the `{ steps, out }` the TS compiler produced for that source's dimensions — see the contract below. `geometry-chain` (crop 4×6 → rotate right → straighten −1.2°, JPEG q90), `shape-circle` (circle crop to 1:1, PNG), `plain-crop` (simple rect crop, PNG), `adjust-tone` (crop 4×6 → brightness +12 → saturation +20 → warmth +5, JPEG q90 — the PE4 tone/colour pass ending in a terminal `adjust` step), `bleed-mirror` (crop 4×6 → **bleedExpand mirror px 84**, JPEG q90 — the PE5 `extend` step; `compiled.steps` = extract + extend), `royal-blue-cmyk` (**empty recipe, format tiff, intent cmyk** on `royal-blue.png` — the RGB→GRACoL separation; the golden is the CMYK TIFF), `text-logo` (crop 4×6 → **overlays: banner at (200,200), logo at (3600,2300)**, JPEG q90 — the PE6 `composite` steps; `compiled.steps` = extract + two composites; the raster bytes come from `attachments` mapping each overlay `id` to a corpus-relative PNG, written into the jail as `overlay-<id>.png`), `erase-fill` (**erase `date-stamp` at rect `{780,740,420,150}` → brightness +12** on `date-stamp.jpg`, JPEG q90 — the PE9 stored-explicit patch as an inline `composite` UNDER the terminal `adjust`; `compiled.steps` = composite + adjust; the patch bytes come from `attachments` mapping the erase `id` to `patches/date-stamp.png`, written into the jail as `erase-<id>.png`). |
| `goldens/*.{jpg,png,tiff}` | **Generated** (`npm run refresh:photo-goldens`) | The committed expected bytes for each recipe, produced by the real render path (`render-host` → `photo-worker.mjs` → sharp). `golden.test.ts` asserts `renderImage(master, payload)` equals these byte-for-byte; CI drift-gates them. Most are well under 1 MB; the exception is `royal-blue-cmyk.tiff` (~3.5 MB — it carries the embedded 3.4 MB GRACoL profile, which `golden.test.ts` asserts is byte-identical to the committed `.icc`). The CMYK golden additionally checks output space `cmyk` / 4 channels / determinism; the overlay golden (`text-logo.jpg`) additionally spot-checks that the banner's centre pixel differs from a no-overlay render of the same recipe. |
| `phone-photo.jpg` | **Synthetic** (`scripts/make-benign-fixtures.mjs` — SVG scene rasterized via sharp, then re-tagged) | The EXIF-orientation intake case (PE10d). Stored **1024 × 768 landscape** with an **EXIF Orientation=6** tag; intake's auto-orient (`.rotate()`) applies it so the working master is **768 × 1024 portrait** with the "EXIF orientation applied" note — the only corpus file that exercises the orient step end-to-end through the jail (`benign-corpus.test.ts`). |
| `oversize.tiff` | **Synthetic** (same script) | The huge-TIFF / oversize route-away case (PE10d). **9100 × 9000 = 81.9 MP**, past the 80 MP ceiling; deflate keeps it ~256 KB on disk. libvips refuses it at the header read → `too-many-pixels` (unit: `benign-corpus.test.ts`), which the route maps to the CapabilityBanner route-away line (e2e: `photo-editor.spec.ts` "an over-ceiling image routes away"). |
| `screenshot.png`, `ai-art.png`, `scanned-doc.jpg` | **Synthetic** (same script — font-free vector SVG scenes) | Intake-robustness cases (PE10d): a UI `screenshot.png` (1200 × 800, opaque → JPEG master), an `ai-art.png` smooth-gradient AI-art stand-in (1024 × 1024; labeled — the POC ships no AI detection), and a `scanned-doc.jpg` off-white document page (1240 × 1754). Each opens through the real jail in `benign-corpus.test.ts`. |
| `hostile/*` | **Synthetic** (`scripts/make-hostile-fixtures.mjs` — hand-authored deterministic buffers, no `sharp`, no randomness, no third-party content) | The PE10c hostile set (photo plan §4 PE10c, §5), each refused at the layer that owns its defense, all asserted in `hostile-corpus.test.ts` against the real caps: `polyglot-zip.jpg` (ZIP magic under a `.jpg` name → the byte-sniff refuses it, not the extension → not-an-image); `truncated.jpg` (valid JPEG SOI + JFIF start, then nothing → jail decode-failed); `truncated.heic` (a valid `ftyp`/heic box, no payload → the HEIC capability gate or transcode refuses it); `pixel-bomb.png` (**68 bytes** whose IHDR declares 50000 × 50000 = 2.5 Gpx → libvips refuses at the header read, at the **default** 80 MP cap, before any allocation → too-many-pixels); and the SVG set turning `photo-worker.mjs`'s "librsvg's defaults already refuse …" comment into asserted behavior — `svg-script.svg` (a `<script>` → inert vector art, librsvg has no JS engine), `svg-external-ref.svg` (external `file://` + `http://` `<image href>` → unresolved, the raster stays the SVG's own bounded size with nothing fetched or read — no SSRF, no local read; the remote host is an RFC 5737 TEST-NET address so the test can't hang on a live server), `svg-xxe-entity.svg` (external-entity XXE → libxml2 refuses → decode-failed), `svg-billion-laughs.svg` (nested entity amplification → libxml2's amplification cap trips → decode-failed, no hang). Regenerate with `node scripts/make-hostile-fixtures.mjs` (one-shot; byte-deterministic). |

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

**Overlays (PE6) and erase patches (PE9).** A recipe that composites a placed
raster adds an `attachments` map (op `id` → corpus-relative PNG). For an overlay
the id sits alongside `payload.overlays` and `compileRenderPlan` appends a
`composite` after the terminal adjust (jail basename `overlay-<id>.png`); for an
erase the id is the recipe op's `patch.id` and the `composite` lands INLINE at
the op's position, before the terminal adjust (jail basename `erase-<id>.png`) so
tone applies over the patch. The prefix differs by op, so the refresh script and
`golden.test.ts` derive each attachment's jail basename FROM the committed
`composite` steps (the `file` field) rather than a second prefix map, then write
the bytes into the jail via the same extraFiles mechanism the render host uses.
The overlay golden also carries a pixel spot-check (the banner region differs
from a no-overlay render).

**Refresh workflow:** `npm run refresh:photo-goldens` regenerates the goldens
from the committed recipes; the CI live-import lane runs it and fails on any
`git status --porcelain fixtures/photo-corpus` drift (the `.pub`-trace
discipline). Determinism makes a clean re-run a no-op. Regenerate the `compiled`
blocks only when the compiler's output legitimately changes — recompute them
through `compileRenderPlan` in a TS context (a throwaway vitest run) and
re-commit the recipes.

**Hostile-file coverage.** The named hostile set lives as committed artifacts
under `hostile/` (above), read and asserted by `src/lib/photo/hostile-corpus.test.ts`.
Two adjacent surfaces carry additional adversarial cases that stay inline
(tiny buffers synthesized in-process, no committed file needed): the jail's
kill axis — wall-clock SIGKILL, SIGXCPU → resource-limit, jail cleanup on the
killed exits — in `src/lib/photo/photo-adversarial.test.ts`, and the route's
request-shape / size-cap / sniff gates in `src/app/api/photo/intake/route.test.ts`
and `src/lib/photo/render-host.test.ts`. (The byte-sniff itself is unit-tested
in `src/lib/import/image-meta.test.ts`, which owns format detection, not the
hostile-decode cases.)
