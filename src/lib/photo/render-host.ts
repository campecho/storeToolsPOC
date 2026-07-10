import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { imageDimensions, sniffImageMime } from "@/lib/import/image-meta";
import type { PhotoOp, RenderErrorCode, RenderPayload } from "@/lib/schema/photo";
import { collectAdjustState, compileAdjust, isAdjustIdentity } from "./adjust-math";
import { straightenScale } from "./geometry";
import {
  INTAKE_TIMEOUT_MS,
  MASTER_JPEG_QUALITY,
  MAX_PHOTO_PIXELS,
  PHOTO_AS_BYTES,
  PHOTO_CPU_SECONDS,
  PROXY_JPEG_QUALITY,
  PROXY_MAX_EDGE,
  RENDER_TIMEOUT_MS,
  WORKER_MAX_OUTPUT_BYTES,
} from "./limits";

/**
 * The render-host seam (plan §3.6, §4 PE1) — the ONE server module that knows
 * `sharp` runs OUT OF PROCESS. It generalizes the `pub2raw.ts` discipline for
 * the photo pipeline: per-job `mkdtemp` scratch jail wiped in `finally`, a
 * `prlimit --cpu --as` wrapper where available (probed once, cached), a
 * wall-clock timeout with SIGKILL (a hang is a finding, not a wait), bounded
 * output, and kill classification. `sharp` is NEVER imported here or anywhere
 * in the web-server process — only photo-worker.mjs loads it (§3.6).
 *
 * SERVER-ONLY: imports node built-ins and spawns a child; must never be pulled
 * into client code (the client boundary is client.ts).
 *
 * The production swap — a sandboxed remote decode service — replaces this
 * file's internals and nothing else (the seam-registry rule, §10.7).
 */

const execFileP = promisify(execFile);

/**
 * Absolute path to the worker. Resolved from process.cwd() because `dev`/`start`
 * run from the repo root and the worker is a plain `.mjs` the bundler never
 * touches (importing it would drag sharp's native binary into the trace). The
 * Docker/standalone-output path story is verified at the live-lane tranche.
 */
const WORKER_PATH = join(process.cwd(), "src", "lib", "photo", "photo-worker.mjs");

/** Limits handed to the worker so caps live in one place (limits.ts). */
const WORKER_LIMITS = {
  maxPixels: MAX_PHOTO_PIXELS,
  masterJpegQuality: MASTER_JPEG_QUALITY,
  proxyJpegQuality: PROXY_JPEG_QUALITY,
  proxyMaxEdge: PROXY_MAX_EDGE,
};

/* ------------------------------------------------------------------ */
/* prlimit probe (cached) — the pub2raw pattern                        */
/* ------------------------------------------------------------------ */

let rlimitProbe: { available: boolean; error?: string } | null = null;

/**
 * Probe `prlimit` (util-linux), cached per process. Present on the Docker
 * runner and Ubuntu CI; absent on macOS dev boxes — there the worker runs
 * UNWRAPPED (wall-clock timeout is then the only subprocess cap), and the gap
 * is surfaced (never silent) via the GET diagnostic's `jailed.rlimits`.
 */
async function prlimitProbe(): Promise<{ available: boolean; error?: string }> {
  if (rlimitProbe !== null) return rlimitProbe;
  try {
    await execFileP("prlimit", ["--version"], { timeout: 5_000 });
    rlimitProbe = { available: true };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    rlimitProbe = {
      available: false,
      error: e.code ? `${e.code}: ${e.message ?? ""}`.trim() : (e.message ?? "unknown error"),
    };
  }
  return rlimitProbe;
}

/** Whether jail subprocesses run under kernel CPU/AS rlimits (GET diagnostic). */
export async function rlimitsEnforced(): Promise<boolean> {
  return (await prlimitProbe()).available;
}

/* ------------------------------------------------------------------ */
/* Low-level worker runner (jail · prlimit · timeout · classify)       */
/* ------------------------------------------------------------------ */

/** Kill classification for a subprocess that did not exit cleanly. */
type KillClass = "timeout" | "resource-limit" | "decode-failed";

interface WorkerRun {
  /** Non-null when the child was killed / crashed before a clean exit. */
  kill: KillClass | null;
  /** Parsed result.json, or null when absent/oversize/unparseable. */
  result: Record<string, unknown> | null;
  /** Requested output files that existed and fit the size bound. */
  outputs: Record<string, Buffer>;
  /** An output file existed but blew past WORKER_MAX_OUTPUT_BYTES. */
  oversizeOutput: boolean;
}

/** Read a file only if it fits `max`; null when missing/oversize/unreadable. */
async function readBounded(
  path: string,
  max: number,
): Promise<{ buf: Buffer } | { oversize: true } | null> {
  try {
    const st = await stat(path);
    if (st.size > max) return { oversize: true };
    return { buf: await readFile(path) };
  } catch {
    return null;
  }
}

/**
 * Spawn photo-worker.mjs on a job in a fresh scratch jail, wait under the
 * wall-clock timeout, classify a non-clean exit, and collect the requested
 * output files — all before the jail is wiped in `finally`.
 */
async function runWorker(
  job: Record<string, unknown>,
  input: Buffer | null,
  outputNames: string[],
  timeoutMs: number = INTAKE_TIMEOUT_MS,
): Promise<WorkerRun> {
  const jail = await mkdtemp(join(tmpdir(), "photo-host-"));
  try {
    await writeFile(join(jail, "job.json"), JSON.stringify(job));
    if (input) await writeFile(join(jail, "input.bin"), input);

    // rlimit wrapper (plan §3.6): `prlimit --cpu=<soft:hard> --as -- node
    // <worker> <jail>`. prlimit exec()s the target (no intermediate process),
    // so the wall-clock SIGKILL below still lands on node and the exit status
    // propagates unchanged. The +5 s CPU soft:hard gap lets the kernel raise
    // SIGXCPU at the soft limit (distinguishable resource-limit) rather than
    // jumping straight to SIGKILL. Where prlimit is missing the worker runs
    // unwrapped — honest fallback, reported by the GET diagnostic.
    const wrap = (await prlimitProbe()).available;
    const nodeBin = process.execPath;
    const base = [nodeBin, WORKER_PATH, jail];
    const argv = wrap
      ? [
          "prlimit",
          `--cpu=${PHOTO_CPU_SECONDS}:${PHOTO_CPU_SECONDS + 5}`,
          `--as=${PHOTO_AS_BYTES}`,
          "--",
          ...base,
        ]
      : base;

    type ExecErr = { killed?: boolean; signal?: string; code?: number | string; stderr?: string };
    let spawnErr: ExecErr | null = null;
    try {
      await execFileP(argv[0], argv.slice(1), {
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        // The worker communicates through files, not stdout — keep the pipe
        // buffer small; a hostile encoder can't bloat us through stdout.
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        cwd: process.cwd(),
      });
    } catch (err) {
      spawnErr = err as ExecErr;
    }

    // Read the typed result regardless of exit status: the worker writes
    // result.json AND exits 0 for a clean typed failure, but may also have
    // left a breadcrumb before a crash.
    const resultRead = await readBounded(join(jail, "result.json"), WORKER_MAX_OUTPUT_BYTES);
    let result: Record<string, unknown> | null = null;
    if (resultRead && "buf" in resultRead) {
      try {
        result = JSON.parse(resultRead.buf.toString("utf8")) as Record<string, unknown>;
      } catch {
        result = null;
      }
    }

    // Kill classification, most specific first (the pub2raw ordering). SIGXCPU
    // is unambiguously the CPU rlimit. A wall-clock kill surfaces as
    // killed/SIGKILL. Anything else that exited non-clean WITHOUT a typed
    // result is a decode death — and, per the inherited pub2raw caveat, an
    // RLIMIT_AS overrun kills the child at malloc and lands here as
    // decode-failed, NOT resource-limit; the security property (bounded
    // memory) holds either way.
    let kill: KillClass | null = null;
    if (spawnErr) {
      if (spawnErr.signal === "SIGXCPU") kill = "resource-limit";
      else if (spawnErr.killed || spawnErr.signal === "SIGKILL") kill = "timeout";
      else kill = "decode-failed";
    }

    const outputs: Record<string, Buffer> = {};
    let oversizeOutput = false;
    for (const name of outputNames) {
      const out = await readBounded(join(jail, name), WORKER_MAX_OUTPUT_BYTES);
      if (out && "oversize" in out) oversizeOutput = true;
      else if (out && "buf" in out) outputs[name] = out.buf;
    }

    return { kill, result, outputs, oversizeOutput };
  } finally {
    await rm(jail, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* Engine probe (cached) — GET diagnostics                             */
/* ------------------------------------------------------------------ */

export interface EngineInfo {
  name: "sharp";
  version: string;
  libvips: string;
}

let engineProbe: EngineInfo | null | undefined;

/**
 * Probe the engine by running a `{ kind: "probe" }` job once and caching the
 * versions — null when the worker can't run sharp at all (missing native
 * binary). Feeds `GET /api/photo`'s `engine` field.
 */
export async function probeEngine(): Promise<EngineInfo | null> {
  if (engineProbe !== undefined) return engineProbe;
  try {
    const run = await runWorker({ kind: "probe" }, null, []);
    const versions = run.result?.versions as { sharp?: string; vips?: string } | undefined;
    engineProbe =
      run.kill === null && versions?.sharp
        ? { name: "sharp", version: versions.sharp, libvips: versions.vips ?? "unknown" }
        : null;
  } catch {
    engineProbe = null;
  }
  return engineProbe;
}

/* ------------------------------------------------------------------ */
/* Intake — decode/orient/strip → master + proxy                       */
/* ------------------------------------------------------------------ */

export interface IntakeImage {
  bytes: Buffer;
  mime: string;
  width: number;
  height: number;
}

export type IntakeHostOutcome =
  | {
      ok: true;
      master: IntakeImage;
      proxy: IntakeImage;
      colorSpace: "rgb" | "cmyk";
      notes: string[];
    }
  | {
      ok: false;
      /** Maps 1:1 onto the route's IntakeErrorCode subset. */
      error: "too-many-pixels" | "decode-failed" | "timeout" | "resource-limit" | "engine-error";
      detail: string;
    };

/** Interpret a worker's typed intake failure (result.json ok:false). */
function typedFailure(result: Record<string, unknown>): IntakeHostOutcome {
  const error = result.error;
  const detail = typeof result.detail === "string" ? result.detail : "";
  if (error === "too-many-pixels") return { ok: false, error: "too-many-pixels", detail };
  if (error === "engine-error") return { ok: false, error: "engine-error", detail };
  return { ok: false, error: "decode-failed", detail };
}

/**
 * Decode `bytes` (already sniffed to `mime` by the caller) in the jail: EXIF
 * auto-orient, strip all metadata (CDR — §3.6), and re-encode a working master
 * plus a screen proxy. The original bytes never touch application storage; the
 * caller holds them only for this call and drops them after.
 */
export async function intakeImage(bytes: Buffer, mime: string): Promise<IntakeHostOutcome> {
  const run = await runWorker(
    { kind: "intake", mime, limits: WORKER_LIMITS },
    bytes,
    ["master.bin", "proxy.bin"],
  );

  // Jail kills first (no typed result to trust).
  if (run.kill === "timeout")
    return { ok: false, error: "timeout", detail: `intake exceeded ${INTAKE_TIMEOUT_MS / 1000}s and was killed` };
  if (run.kill === "resource-limit")
    return { ok: false, error: "resource-limit", detail: `intake exceeded the ${PHOTO_CPU_SECONDS}s CPU rlimit (SIGXCPU)` };
  if (run.kill === "decode-failed") {
    // A crash may still have left a typed breadcrumb (e.g. engine-error).
    if (run.result && run.result.ok === false) return typedFailure(run.result);
    return { ok: false, error: "decode-failed", detail: "the decoder crashed on this file" };
  }

  // Clean exit — a result.json must be present.
  if (!run.result) return { ok: false, error: "engine-error", detail: "worker produced no result" };
  if (run.result.ok === false) return typedFailure(run.result);

  // A pathological encoder output blew the size bound — treat as the file's
  // fault (decode-failed) rather than surfacing giant bytes.
  if (run.oversizeOutput)
    return { ok: false, error: "decode-failed", detail: "re-encoded output exceeded the size limit" };

  const master = run.outputs["master.bin"];
  const proxy = run.outputs["proxy.bin"];
  if (!master || !proxy)
    return { ok: false, error: "engine-error", detail: "worker reported success but wrote no image" };

  const r = run.result;
  return {
    ok: true,
    master: {
      bytes: master,
      mime: String(r.masterMime),
      width: Number(r.width),
      height: Number(r.height),
    },
    proxy: {
      bytes: proxy,
      mime: String(r.proxyMime),
      width: Number(r.proxyWidth),
      height: Number(r.proxyHeight),
    },
    colorSpace: r.colorSpace === "cmyk" ? "cmyk" : "rgb",
    notes: Array.isArray(r.notes) ? (r.notes as string[]) : [],
  };
}

/* ------------------------------------------------------------------ */
/* Render — recipe → dumb worker steps (the PARITY-BY-SHARED-CODE seam) */
/* ------------------------------------------------------------------ */

/**
 * A single dumb instruction for the render worker. The HOST compiles the recipe
 * into these using the SAME geometry.ts the client canvas uses (so the export
 * matches the preview by construction, not by trusting two engines to agree,
 * §1.3); photo-worker.mjs — plain JS that cannot import TS — just executes them
 * in order, materializing a buffer per step.
 *
 * Coordinate contract (binding, geometry.ts header): every step addresses the
 * CURRENT EFFECTIVE image (the result of all prior steps), not the source.
 *
 *  • extract  — crop to an axis-aligned window; `shape` (rounded|circle) → an
 *               alpha mask is composited dest-in, so the output carries alpha.
 *  • rotate   — `turns` quarter-turns CLOCKWISE (normalized to 1..3; a 0-turn
 *               op emits no step). Odd turns swap w↔h.
 *  • flip     — mirror; horizontal = left↔right (sharp `.flop`), vertical =
 *               top↔bottom (sharp `.flip`). Dims unchanged.
 *  • straighten — rotate `degrees` about centre, cover-scale by `scale`
 *               (= geometry.straightenScale of the pre-op dims), then re-extract
 *               the CENTERED `width`×`height` (the pre-op dims) window. Dims
 *               unchanged — a quality cost, not a size cost.
 *  • adjust   — the ONE POINTWISE tone/colour pass (plan §3.3 "compiles the
 *               recipe's adjust ops into one LUT + one matrix → single pass").
 *               The whole recipe's adjust/autoEnhance ops fold (last-wins, §3.4)
 *               into three 256-entry LUTs + one 3×3 saturation matrix, and this
 *               step is appended AFTER all geometry so it runs terminally — a
 *               pointwise op commutes with geometry, so recipe order among the
 *               adjust ops (and their position relative to crops) never changes
 *               the result. Dims UNCHANGED (per-pixel only). The LUTs ride as
 *               plain `number[]` (not Uint8Array) so the step JSON-serializes for
 *               the committed golden `compiled` block and deep-equals in tests.
 */
export type RenderStep =
  | {
      kind: "extract";
      left: number;
      top: number;
      width: number;
      height: number;
      shape?: "rounded" | "circle";
    }
  | { kind: "rotate"; turns: number }
  | { kind: "flip"; axis: "horizontal" | "vertical" }
  | { kind: "straighten"; degrees: number; scale: number; width: number; height: number }
  | {
      kind: "adjust";
      /** Per-channel 256-entry tone+temperature LUTs (0..255 ints as numbers). */
      lutR: number[];
      lutG: number[];
      lutB: number[];
      /** Row-major 3×3 saturation matrix (9 entries). */
      matrix: number[];
      /** When true the worker skips the matrix (tone-only path). */
      identityMatrix: boolean;
    };

/**
 * Thrown by `compileRenderPlan` when the recipe carries an op this tranche
 * can't render (anything but crop/rotate/flip/straighten geometry and
 * adjust/autoEnhance tone). The route catches it and answers `unsupported-op` —
 * but the route ALSO pre-screens the op tags, so this is defence in depth, not
 * the primary gate.
 */
export class UnsupportedRenderOp extends Error {
  constructor(public readonly op: string) {
    super(`Render does not support '${op}' ops in this tranche.`);
    this.name = "UnsupportedRenderOp";
  }
}

/** Same integer-dimension folding rule as geometry.effectiveDims (≥ 1). */
function intDim(v: number): number {
  return Math.max(1, Math.round(v));
}
function clampN(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Compile a recipe into worker steps, tracking effective dims by the SAME
 * folding rules as geometry.effectiveDims (cross-checked in the tests). The
 * returned `out` is the final effective size. Throws `UnsupportedRenderOp` on
 * the first op that is neither geometry nor tone/colour — the route turns that
 * into `unsupported-op`.
 *
 * Two op classes compile here:
 *   • GEOMETRY (crop/rotate/flip/straighten) folds inline, changing the effective
 *     dims and emitting one step each (the §3.3 geometry seam).
 *   • TONE/COLOUR (adjust/autoEnhance) is POINTWISE — it never changes dims and
 *     never emits a step inside the loop. Instead the WHOLE recipe's adjust state
 *     is folded once (collectAdjustState — last-wins setpoint semantics, §3.4)
 *     and, when it isn't identity, a SINGLE terminal `adjust` step (one LUT +
 *     one matrix) is appended AFTER all geometry. A pointwise op commutes with
 *     geometry, so an adjust op sitting before a crop in the recipe still lands
 *     terminally — the result is identical either way.
 *
 * Crop rects are expected in-bounds of the current effective image (the client
 * clamps via geometry.clampRectToImage); the extract offsets are clamped here
 * too so a rounded rect can never address a pixel outside the frame.
 */
export function compileRenderPlan(
  recipe: PhotoOp[],
  source: { w: number; h: number },
): { steps: RenderStep[]; out: { w: number; h: number } } {
  let curW = intDim(source.w);
  let curH = intDim(source.h);
  const steps: RenderStep[] = [];

  for (const op of recipe) {
    switch (op.op) {
      case "crop": {
        const width = intDim(op.rect.w);
        const height = intDim(op.rect.h);
        const eW = Math.min(width, curW);
        const eH = Math.min(height, curH);
        const left = clampN(Math.round(op.rect.x), 0, curW - eW);
        const top = clampN(Math.round(op.rect.y), 0, curH - eH);
        const step: RenderStep = { kind: "extract", left, top, width: eW, height: eH };
        if (op.shape === "rounded" || op.shape === "circle") step.shape = op.shape;
        steps.push(step);
        curW = eW;
        curH = eH;
        break;
      }
      case "rotate": {
        // Normalize to 0..3; parity with effectiveDims' abs(q)%2 swap rule is
        // preserved (mod-2 parity survives the mod-4 fold).
        const turns = ((op.quarterTurns % 4) + 4) % 4;
        if (turns !== 0) {
          steps.push({ kind: "rotate", turns });
          if (turns % 2 === 1) {
            const t = curW;
            curW = curH;
            curH = t;
          }
        }
        break;
      }
      case "flip": {
        steps.push({ kind: "flip", axis: op.axis });
        break;
      }
      case "straighten": {
        // scale from the SHARED geometry module — the parity guarantee. Pre-op
        // dims (curW×curH) are the re-extract window; dims are unchanged.
        const scale = straightenScale({ w: curW, h: curH }, op.degrees);
        steps.push({ kind: "straighten", degrees: op.degrees, scale, width: curW, height: curH });
        break;
      }
      case "adjust":
      case "autoEnhance":
        // POINTWISE tone/colour — folded terminally after the loop (below), not
        // per-op. Dims are untouched; nothing to emit here.
        break;
      default:
        // bleedExpand / fitToSize / resize / textOverlay / logoOverlay / erase —
        // not geometry, not tone, not renderable here yet.
        throw new UnsupportedRenderOp(op.op);
    }
  }

  // ONE terminal tone/colour pass: fold the whole recipe's adjust ops (last-wins
  // setpoint semantics, adjust-math.ts) into three LUTs + one saturation matrix,
  // appended AFTER all geometry. Skipped entirely when nothing moves a pixel
  // (isAdjustIdentity), so a geometry-only recipe compiles to exactly the same
  // steps it did before PE4 (the existing goldens don't regenerate). The LUTs
  // ride as plain number[] so the step JSON-serializes for the golden `compiled`
  // block and deep-equals under `toEqual`.
  const adjustState = collectAdjustState(recipe);
  if (!isAdjustIdentity(adjustState)) {
    const compiled = compileAdjust(adjustState);
    steps.push({
      kind: "adjust",
      lutR: Array.from(compiled.lutR),
      lutG: Array.from(compiled.lutG),
      lutB: Array.from(compiled.lutB),
      matrix: compiled.matrix,
      identityMatrix: compiled.identityMatrix,
    });
  }

  return { steps, out: { w: curW, h: curH } };
}

/** Interpret a render worker's typed failure (result.json ok:false). */
function typedRenderFailure(
  result: Record<string, unknown>,
): { ok: false; code: RenderErrorCode; message: string } {
  if (result.error === "too-many-pixels")
    return { ok: false, code: "too-many-pixels", message: "That image has more pixels than we can render here." };
  if (result.error === "engine-error")
    return { ok: false, code: "engine-error", message: "The image engine failed while rendering." };
  return { ok: false, code: "decode-failed", message: "We couldn't render that image — the source may be damaged." };
}

/**
 * Replay a geometry recipe on `master` at full resolution in the jail, returning
 * the encoded export bytes (binary — the route streams them with the right
 * Content-Type; there is no JSON success envelope). The master's pixel dims come
 * from a cheap, safe HEADER read (`imageDimensions` — no decode, same posture as
 * the intake content-sniff), since masters are always our own jpeg/png; an
 * unreadable header means the bytes won't decode either → `decode-failed`.
 *
 * Determinism (the PE3 done-when): the compile is pure integer/trig math and the
 * worker's encoder options are fixed, so the same recipe + bytes yields
 * byte-identical output across runs (proven in render-replay.test.ts).
 */
export async function renderImage(
  master: Buffer,
  payload: RenderPayload,
): Promise<{ ok: true; bytes: Buffer; mime: string } | { ok: false; code: RenderErrorCode; message: string }> {
  const mime = sniffImageMime(master);
  const dims = mime ? imageDimensions(master, mime) : undefined;
  if (!dims || dims.width < 1 || dims.height < 1) {
    return { ok: false, code: "decode-failed", message: "The image to render couldn't be read." };
  }

  let plan: { steps: RenderStep[]; out: { w: number; h: number } };
  try {
    plan = compileRenderPlan(payload.recipe, { w: dims.width, h: dims.height });
  } catch (err) {
    if (err instanceof UnsupportedRenderOp) {
      return { ok: false, code: "unsupported-op", message: err.message };
    }
    return { ok: false, code: "engine-error", message: "The recipe couldn't be compiled for rendering." };
  }

  const run = await runWorker(
    {
      kind: "render",
      steps: plan.steps,
      format: payload.format,
      quality: payload.quality,
      limits: { maxPixels: MAX_PHOTO_PIXELS },
    },
    master,
    ["output.bin"],
    RENDER_TIMEOUT_MS,
  );

  // Jail kills first (no typed result to trust) — mirrors intakeImage.
  if (run.kill === "timeout")
    return { ok: false, code: "timeout", message: `Rendering took longer than ${RENDER_TIMEOUT_MS / 1000}s and was stopped.` };
  if (run.kill === "resource-limit")
    // SIGXCPU: the CPU rlimit backstop fired. Like intake, this surfaces as a
    // decode-class failure (the recipe was too heavy for this image here).
    return { ok: false, code: "decode-failed", message: "Rendering hit the processing limit — try a simpler edit or a smaller image." };
  if (run.kill === "decode-failed") {
    if (run.result && run.result.ok === false) return typedRenderFailure(run.result);
    return { ok: false, code: "decode-failed", message: "The renderer crashed on that image." };
  }

  if (!run.result) return { ok: false, code: "engine-error", message: "The renderer produced no result." };
  if (run.result.ok === false) return typedRenderFailure(run.result);

  // A pathological encoder blew the output size bound — the file's fault.
  if (run.oversizeOutput)
    return { ok: false, code: "too-large", message: "The rendered image came out larger than we can return." };

  const out = run.outputs["output.bin"];
  if (!out)
    return { ok: false, code: "engine-error", message: "The renderer reported success but wrote no image." };

  const outMime = run.result.mime === "image/png" ? "image/png" : "image/jpeg";
  return { ok: true, bytes: out, mime: outMime };
}
