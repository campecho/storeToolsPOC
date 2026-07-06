#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/**
 * Regenerate every corpus derivative from fixtures/pub-corpus/*.pub:
 *
 *   fixtures/pub-traces/<name>.trace  ← pub2raw stdout, byte-for-byte
 *   fixtures/pub-refs/<name>.xhtml    ← pub2xhtml reference render
 *
 * Both outputs are committed and consumed by the binary-free test lanes
 * (corpus.test.ts goldens; corpus-fidelity.test.ts scoring). This script is
 * CI's drift gate: it must be byte-stable, so
 * `npm run refresh:corpus && git diff --exit-code -- fixtures/pub-traces fixtures/pub-refs`
 * proves the checked-in artifacts still match what the installed libmspub
 * produces. Requires libmspub-tools (`apt-get install libmspub-tools`);
 * the deterministic test suites do NOT.
 *
 * Deliberately untouched: pub-traces/demo-flyer.trace (synthetic, emitted by
 * trace-emitter.cpp — different provenance, see pub-traces/README.md) and
 * trace-emitter.cpp itself. Only <name>.trace for names in pub-corpus/ are
 * rewritten.
 */

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusDir = join(root, "fixtures", "pub-corpus");
const tracesDir = join(root, "fixtures", "pub-traces");
const refsDir = join(root, "fixtures", "pub-refs");

// bcim's trace is ~1.3 MB (embedded JPEG as base64); leave generous headroom.
const MAX_BUFFER = 64 * 1024 * 1024;

/** Fail loudly and helpfully when a converter binary isn't installed. */
function explainMissing(tool, err) {
  if (err?.code === "ENOENT") {
    console.error(
      `ERROR: \`${tool}\` not found. The corpus refresh needs libmspub-tools:\n` +
        `  apt-get install libmspub-tools\n` +
        `(The deterministic test suites run from the checked-in fixtures and do not need it.)`,
    );
    process.exit(1);
  }
}

const pubs = (await readdir(corpusDir)).filter((f) => f.endsWith(".pub")).sort();
if (!pubs.length) {
  console.error(`ERROR: no .pub files under ${corpusDir}`);
  process.exit(1);
}

mkdirSync(refsDir, { recursive: true });

for (const pub of pubs) {
  const name = basename(pub, ".pub");
  const input = join(corpusDir, pub);

  // Trace: exactly `pub2raw input > name.trace` — stdout bytes, no massaging.
  const tracePath = join(tracesDir, `${name}.trace`);
  try {
    const { stdout } = await run("pub2raw", [input], { encoding: "buffer", maxBuffer: MAX_BUFFER });
    writeFileSync(tracePath, stdout);
    console.log(`wrote ${tracePath} (${stdout.length} bytes)`);
  } catch (err) {
    explainMissing("pub2raw", err);
    console.error(`ERROR: pub2raw failed on ${pub}: ${err.message}`);
    process.exit(1);
  }

  // Reference render: pub2xhtml writes the output file itself. A publication
  // whose content is all master pages (business_card_template_10up) renders
  // EMPTY: pub2xhtml creates a 0-byte file, prints "ERROR: No SVG document
  // generated!" and exits 1 — that emptiness is the golden (the same upstream
  // gap our mapper flags tier-3), so a nonzero exit that still produced the
  // output file is recorded, not fatal. The git-diff drift gate catches any
  // file that unexpectedly goes empty.
  const refPath = join(refsDir, `${name}.xhtml`);
  try {
    await run("pub2xhtml", [input, refPath], { maxBuffer: MAX_BUFFER });
  } catch (err) {
    explainMissing("pub2xhtml", err);
    let size = null;
    try {
      size = statSync(refPath).size;
    } catch {
      size = null;
    }
    if (size === null) {
      console.error(`ERROR: pub2xhtml failed on ${pub} and wrote nothing: ${err.message}`);
      process.exit(1);
    }
    console.log(`note: pub2xhtml exited ${err.code} on ${pub} (${(err.stderr || "").toString().trim()})`);
  }
  console.log(`wrote ${refPath} (${statSync(refPath).size} bytes)`);
}

console.log(`refreshed ${pubs.length} corpus entries (traces + reference renders)`);
