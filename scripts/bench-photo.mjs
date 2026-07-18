#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/**
 * The reusable photo-latency harness (photo plan §4 PE10e, §5) — PE0's spike
 * numbers graduated into a script you can re-run on demand. It measures the
 * three PE0 dimensions by spawning the SAME photo-worker.mjs the render host
 * drives (the refresh-photo-goldens.mjs protocol, no TS import), and prints each
 * median against its recorded budget:
 *
 *   open   — jailed intake of the 12 MP demo (decode → orient → strip → master + proxy)
 *   adjust — a single jailed adjust step on the 12 MP demo (the LUT+matrix pass,
 *            server-side; the CLIENT proxy-adjust <100 ms budget is gated in
 *            src/lib/photo/ops.test.ts, which runs the isomorphic applyAdjust)
 *   export — full-res replay of the geometry-chain recipe (crop → rotate → straighten)
 *
 * The CI GATES live in vitest (perf-budget.test.ts for open/export, ops.test.ts
 * for adjust) with generous ceilings; this script is the on-demand reproduction.
 * Numbers are dev/CI proxies until the fleet-hardware lab pass (STUBS.md).
 *
 * Run from the repo root:  node scripts/bench-photo.mjs  [runs]   (default 7)
 */

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_PATH = join(root, "src", "lib", "photo", "photo-worker.mjs");
const DEMO = join(root, "public", "photo-demo.jpg");
const RECIPES = join(root, "fixtures", "photo-corpus", "recipes");
const GEOMETRY_CHAIN = join(RECIPES, "geometry-chain.json");
const ADJUST_TONE = join(RECIPES, "adjust-tone.json");

const MAX_PHOTO_PIXELS = 80_000_000;
const RENDER_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 64 * 1024 * 1024;
const RUNS = Number(process.argv[2]) || 7;

// The recorded budgets (the vitest ceilings) — printed beside each median so a
// bench run reads like the gate. Generous by design: jail launch dominates.
const BUDGETS = { open: 12_000, adjust: 12_000, export: 15_000 };

/** Run the worker on a job in a throwaway jail; return nothing (we time it). */
async function runWorker(job, input) {
  const jail = await mkdtemp(join(tmpdir(), "photo-bench-"));
  try {
    await writeFile(join(jail, "job.json"), JSON.stringify(job));
    await writeFile(join(jail, "input.bin"), input);
    await run(process.execPath, [WORKER_PATH, jail], {
      timeout: RENDER_TIMEOUT_MS,
      killSignal: "SIGKILL",
      maxBuffer: MAX_BUFFER,
      cwd: root,
    });
    const result = JSON.parse(await readFile(join(jail, "result.json"), "utf8"));
    if (result.ok === false) throw new Error(`worker failed: ${result.error} — ${result.detail ?? ""}`);
  } finally {
    await rm(jail, { recursive: true, force: true });
  }
}

async function median(label, jobFor, input) {
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    await runWorker(jobFor(), input);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)];
  const budget = BUDGETS[label];
  const ok = med < budget;
  console.log(
    `${label.padEnd(7)} median ${med.toFixed(0).padStart(6)} ms   ` +
      `(min ${times[0].toFixed(0)} / max ${times[times.length - 1].toFixed(0)})   ` +
      `budget ${budget} ms  ${ok ? "OK" : "OVER"}`,
  );
  return ok;
}

async function main() {
  const demo = await readFile(DEMO);
  const chain = JSON.parse(await readFile(GEOMETRY_CHAIN, "utf8"));
  const tone = JSON.parse(await readFile(ADJUST_TONE, "utf8"));
  const limits = { maxPixels: MAX_PHOTO_PIXELS };

  // The real committed adjust step (compiled LUTs + matrix) — this plain ESM
  // can't build it (adjust-math is TS), so lift it from the adjust-tone recipe
  // and run it ALONE on the full-res demo: the pure jailed LUT+matrix pass.
  const adjustStep = tone.compiled.steps.find((s) => s.kind === "adjust");
  if (!adjustStep) throw new Error("adjust-tone recipe has no compiled adjust step");

  console.log(`bench-photo — ${RUNS} runs each, 12 MP demo (${(demo.length / 1024 / 1024).toFixed(1)} MB)\n`);

  const results = [];
  results.push(await median("open", () => ({ kind: "intake", mime: "image/jpeg", limits }), demo));
  results.push(
    await median(
      "adjust",
      () => ({ kind: "render", steps: [adjustStep], format: "jpeg", quality: 90, intent: "srgb", limits }),
      demo,
    ),
  );
  results.push(
    await median(
      "export",
      () => ({ kind: "render", steps: chain.compiled.steps, format: chain.payload.format, quality: chain.payload.quality, intent: "srgb", limits }),
      demo,
    ),
  );

  console.log("");
  if (!results.every(Boolean)) {
    console.error("At least one dimension is OVER its recorded budget.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
