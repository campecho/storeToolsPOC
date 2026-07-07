#!/usr/bin/env node
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vendor the §10.5 webfont stand-ins from @fontsource packages (devDeps) into
 * public/fonts/, where src/lib/layout/font-catalog.ts expects them. Latin
 * subset only (store corpus is English; extend when a corpus file needs it).
 * Re-run after bumping a @fontsource package:  node scripts/vendor-fonts.mjs
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** slug → faces; matches the `files` entries in font-catalog.ts. */
const FAMILIES = {
  arimo: ["400-normal", "400-italic", "700-normal", "700-italic"],
  carlito: ["400-normal", "400-italic", "700-normal", "700-italic"],
  caladea: ["400-normal", "400-italic", "700-normal", "700-italic"],
  gelasio: ["400-normal", "400-italic", "700-normal", "700-italic"],
  tinos: ["400-normal", "400-italic", "700-normal", "700-italic"],
  cousine: ["400-normal", "400-italic", "700-normal", "700-italic"],
  "libre-franklin": ["400-normal", "400-italic", "700-normal", "700-italic"],
  // no bold cut exists — browsers synthesize it from the 400
  "sorts-mill-goudy": ["400-normal", "400-italic"],
};

let copied = 0;
for (const [slug, faces] of Object.entries(FAMILIES)) {
  const outDir = join(root, "public", "fonts", slug);
  mkdirSync(outDir, { recursive: true });
  for (const face of faces) {
    const src = join(root, "node_modules", "@fontsource", slug, "files", `${slug}-latin-${face}.woff2`);
    if (!existsSync(src)) {
      console.error(`MISSING: ${src} — is @fontsource/${slug} installed?`);
      process.exitCode = 1;
      continue;
    }
    copyFileSync(src, join(outDir, `${slug}-${face}.woff2`));
    copied++;
  }
}
console.log(`vendored ${copied} woff2 files into public/fonts/`);
