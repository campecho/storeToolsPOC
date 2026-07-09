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

Hostile-file cases at PE1 (disguised non-image, truncated JPEG, pixel-flood
PNG) are synthesized inline by the unit tests (`src/lib/photo/*.test.ts`,
`src/lib/import/image-meta.test.ts`) — tiny deterministic buffers beat
committed binaries while the set is small. Files land here once goldens
need stable committed bytes (PE3's golden-recipe harness).
