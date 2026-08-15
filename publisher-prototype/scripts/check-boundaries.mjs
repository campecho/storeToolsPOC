/**
 * Extraction-boundary check (PLAN.md §0, §6.1).
 *
 * publisher-prototype/ is the future repo root. This script fails CI when:
 *   1. any relative import resolves outside this directory;
 *   2. any bare import names a package not declared in THIS directory's
 *      package.json (dependencies or devDependencies) — no leaning on the
 *      host repo's node_modules;
 *   3. any file under src/ imports a `node:` builtin — the app is fully
 *      client-side (§6.7); builtins are allowed only in e2e/ and configs;
 *   4. any file under src/core/ imports outside the core allowlist — the
 *      core is framework-free (§6.1): only relative imports that stay
 *      inside src/core/ plus the packages in CORE_ALLOWED_PACKAGES.
 *
 * Import extraction uses the TypeScript scanner (ts.preProcessFile), which
 * also catches dynamic import() and require() specifiers.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const CORE = path.join(ROOT, "src", "core");

/** Framework-free core (§6.1): everything else must live in the shell. */
const CORE_ALLOWED_PACKAGES = new Set(["@reduxjs/toolkit", "zod", "immer"]);

const manifest = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const declared = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|cts)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** Bare specifier → package name ("@scope/pkg/sub" → "@scope/pkg"). */
function packageName(spec) {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

const candidates = [
  ...walk(SRC),
  ...(statSync(path.join(ROOT, "e2e"), { throwIfNoEntry: false }) ? walk(path.join(ROOT, "e2e")) : []),
  ...["vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
    .map((f) => path.join(ROOT, f))
    .filter((f) => statSync(f, { throwIfNoEntry: false })),
];

const violations = [];

for (const file of candidates) {
  const text = readFileSync(file, "utf8");
  const info = ts.preProcessFile(text, true, true);
  const rel = path.relative(ROOT, file);
  const inSrc = file.startsWith(SRC + path.sep);
  const inCore = file.startsWith(CORE + path.sep);

  for (const imp of info.importedFiles) {
    const spec = imp.fileName;

    if (spec.startsWith(".")) {
      const resolved = path.resolve(path.dirname(file), spec);
      if (!resolved.startsWith(ROOT + path.sep)) {
        violations.push(`${rel}: relative import escapes the directory: "${spec}"`);
      } else if (inCore && !resolved.startsWith(CORE + path.sep)) {
        violations.push(`${rel}: core file imports outside src/core/: "${spec}"`);
      }
      continue;
    }

    if (path.isAbsolute(spec)) {
      violations.push(`${rel}: absolute import path: "${spec}"`);
      continue;
    }

    if (spec.startsWith("node:")) {
      if (inSrc) violations.push(`${rel}: node builtin in client-side src/: "${spec}"`);
      continue;
    }

    const pkg = packageName(spec);
    if (!declared.has(pkg)) {
      violations.push(`${rel}: package not declared in publisher-prototype/package.json: "${pkg}"`);
    }
    if (inCore && !CORE_ALLOWED_PACKAGES.has(pkg)) {
      violations.push(`${rel}: core file imports non-core package: "${pkg}"`);
    }
  }
}

if (violations.length > 0) {
  console.error(`Boundary check FAILED (${violations.length} violation(s)):\n`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`Boundary check OK — ${candidates.length} files, no imports escape publisher-prototype/, core is framework-free.`);
