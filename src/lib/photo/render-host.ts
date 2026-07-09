import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  INTAKE_TIMEOUT_MS,
  MASTER_JPEG_QUALITY,
  MAX_PHOTO_PIXELS,
  PHOTO_AS_BYTES,
  PHOTO_CPU_SECONDS,
  PROXY_JPEG_QUALITY,
  PROXY_MAX_EDGE,
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
        timeout: INTAKE_TIMEOUT_MS,
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
