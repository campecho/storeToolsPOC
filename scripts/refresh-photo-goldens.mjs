#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/**
 * Regenerate the committed photo goldens from the recipes:
 *
 *   fixtures/photo-corpus/recipes/<name>.json  → fixtures/photo-corpus/goldens/<name>.{jpg|png}
 *
 * These goldens are the drift gate for the export spine (plan §4 PE3, §5): the
 * golden vitest test replays each recipe through render-host.renderImage and
 * asserts the output bytes EQUAL the committed golden, so a regression in the
 * render path — or an encoder move — shows up as byte drift. This script is the
 * regenerator; `npm run refresh:photo-goldens && git status --porcelain
 * fixtures/photo-corpus` is CI's teeth, exactly the refresh-corpus.mjs discipline.
 *
 * ── THE PRECOMPILED-STEPS CONTRACT (why this script stays "dumb") ──
 * render-host.ts is TypeScript and owns compileRenderPlan (recipe → worker
 * steps); a plain .mjs cannot import it. So each recipe JSON carries BOTH the
 * human `payload` (the RenderPayload) AND its `compiled` block — the exact
 * { steps, out } that compileRenderPlan produced for photo-demo.jpg's
 * dimensions, generated once and committed. This script never compiles anything:
 * it spawns photo-worker.mjs (plain JS, the same worker render-host drives) on
 * the COMMITTED steps, replicating the host's render job protocol byte-for-byte.
 *
 * The live compiler and the committed steps can't silently diverge because the
 * golden test asserts `compileRenderPlan(payload.recipe, demoDims)` deep-equals
 * the committed `compiled` — so if the compiler changes, that assertion fails in
 * CI and the recipe must be regenerated. To regenerate the `compiled` blocks
 * (only needed when the compiler's output legitimately changes) recompute them
 * through compileRenderPlan in a TS context (vitest) and re-commit the recipes.
 *
 * Requires the same `sharp` that ships with `npm install` — no extra toolchain
 * (unlike refresh-corpus.mjs, which needs libmspub-tools).
 */

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusDir = join(root, "fixtures", "photo-corpus");
const recipesDir = join(corpusDir, "recipes");
const goldensDir = join(corpusDir, "goldens");
const publicDir = join(root, "public");
const WORKER_PATH = join(root, "src", "lib", "photo", "photo-worker.mjs");
const GRACOL_PROFILE_PATH = join(root, "src", "lib", "photo", "profiles", "GRACoL2013_CRPC6.icc");

// limits.ts shipped defaults (STP_* overrides are harness-only; goldens are cut
// against the production caps so the drift gate reflects what users get).
const MAX_PHOTO_PIXELS = 80_000_000;
const RENDER_TIMEOUT_MS = 60_000;
// A 12 MP export is a few MB; keep generous headroom for the file-channel read.
const MAX_BUFFER = 64 * 1024 * 1024;

const EXT = { jpeg: "jpg", png: "png", tiff: "tiff" };

/**
 * Resolve an attachment `id` to the jail basename the committed composite steps
 * reference — `overlay-<id>.png` (PE6 overlay) or `erase-<id>.png` (PE9 erase
 * patch). The prefix depends on the op, not the id, so derive it from the
 * matching `composite` step's `file` (which IS the jail basename) rather than a
 * second prefix map; the `overlay-` fallback keeps a stepless lookup safe. Kept
 * in sync with golden.test.ts's copy (this plain ESM can't import the TS one).
 */
function attachmentBasename(id, steps) {
  const suffix = `-${id}.png`;
  const step = steps.find((s) => s.kind === "composite" && typeof s.file === "string" && s.file.endsWith(suffix));
  return step?.file ?? `overlay-${id}.png`;
}

/**
 * Resolve a recipe's `source` image. Fixtures-local sources (e.g. the synthetic
 * royal-blue.png that ships in the corpus) win over public/ — the shared demo
 * photo. Mirrors golden.test.ts's resolver so the drift gate reads the same bytes.
 */
async function resolveSource(source) {
  const local = join(corpusDir, source);
  if (await stat(local).then(() => true).catch(() => false)) return local;
  return join(publicDir, source);
}

/**
 * Run photo-worker.mjs on a render job in a throwaway jail and return the
 * encoded output bytes. This replicates render-host.runWorker's render path
 * (job.json + input.bin in a scratch dir, worker writes output.bin + result.json)
 * WITHOUT the prlimit wrapper — a dev/CI regenerator does not need the untrusted
 * server's resource cage, and the cap never affects the output bytes.
 */
async function renderWithWorker(job, input, extraFiles) {
  const jail = await mkdtemp(join(tmpdir(), "photo-golden-"));
  try {
    await writeFile(join(jail, "job.json"), JSON.stringify(job));
    await writeFile(join(jail, "input.bin"), input);
    if (extraFiles) {
      for (const [name, buf] of Object.entries(extraFiles)) {
        await writeFile(join(jail, name), buf);
      }
    }
    await run(process.execPath, [WORKER_PATH, jail], {
      timeout: RENDER_TIMEOUT_MS,
      killSignal: "SIGKILL",
      maxBuffer: MAX_BUFFER,
      cwd: root,
    });

    let result = null;
    try {
      result = JSON.parse(await readFile(join(jail, "result.json"), "utf8"));
    } catch {
      result = null;
    }
    if (!result) throw new Error("worker wrote no result.json (it may have been killed)");
    if (result.ok === false) throw new Error(`worker failed: ${result.error} — ${result.detail ?? ""}`);

    const out = await readFile(join(jail, "output.bin"));
    return { bytes: out, mime: result.mime };
  } finally {
    await rm(jail, { recursive: true, force: true });
  }
}

const recipes = readdirSync(recipesDir)
  .filter((f) => f.endsWith(".json"))
  .sort();
if (!recipes.length) {
  console.error(`ERROR: no recipe JSON under ${recipesDir}`);
  process.exit(1);
}

mkdirSync(goldensDir, { recursive: true });

for (const file of recipes) {
  const name = basename(file, ".json");
  const recipe = JSON.parse(await readFile(join(recipesDir, file), "utf8"));
  const { source, payload, compiled } = recipe;

  if (!compiled || !Array.isArray(compiled.steps)) {
    console.error(
      `ERROR: ${file} has no committed \`compiled.steps\`. Recipes must carry the ` +
        `precompiled plan (see this script's header); regenerate it via compileRenderPlan.`,
    );
    process.exit(1);
  }
  const ext = EXT[payload.format];
  if (!ext) {
    console.error(`ERROR: ${file} has unsupported format '${payload.format}' (want jpeg|png)`);
    process.exit(1);
  }

  const master = await readFile(await resolveSource(source));

  // CMYK output (jpeg/tiff with cmyk intent) separates through the GRACoL
  // profile — copy it INTO the jail exactly as render-host does, so the worker
  // reads a jail-local profile and the bytes match renderImage's byte-for-byte.
  const intent = payload.intent === "cmyk" ? "cmyk" : "srgb";
  const wantsCmyk = intent === "cmyk" && payload.format !== "png";

  // Placed-raster attachments (PE6 overlays, PE9 erase patches): each
  // recipe.attachments entry maps an op id to a corpus-relative PNG. Write them
  // into the jail under the jail basename the committed composite steps reference
  // (`overlay-<id>.png` / `erase-<id>.png`, via attachmentBasename) — the same
  // extraFiles mechanism render-host uses to hand renderImage's attachments to
  // the worker.
  const attachFiles = {};
  if (recipe.attachments) {
    for (const [id, rel] of Object.entries(recipe.attachments)) {
      attachFiles[attachmentBasename(id, compiled.steps)] = await readFile(join(corpusDir, rel));
    }
  }

  const merged = {
    ...(wantsCmyk ? { "profile.icc": await readFile(GRACOL_PROFILE_PATH) } : {}),
    ...attachFiles,
  };
  const extraFiles = Object.keys(merged).length ? merged : undefined;

  // Replicate render-host's render job EXACTLY (kind/steps/format/quality/intent/
  // iccProfile/limits) so the worker produces the same bytes renderImage would —
  // that identity is what the golden test verifies.
  const job = {
    kind: "render",
    steps: compiled.steps,
    format: payload.format,
    quality: payload.quality,
    intent,
    iccProfile: wantsCmyk ? "profile.icc" : undefined,
    limits: { maxPixels: MAX_PHOTO_PIXELS },
  };

  let out;
  try {
    out = await renderWithWorker(job, master, extraFiles);
  } catch (err) {
    console.error(`ERROR: rendering ${file}: ${err.message}`);
    process.exit(1);
  }

  const goldenPath = join(goldensDir, `${name}.${ext}`);
  await writeFile(goldenPath, out.bytes);
  console.log(`wrote ${goldenPath} (${out.bytes.length} bytes, ${out.mime})`);
}

console.log(`refreshed ${recipes.length} photo goldens`);
