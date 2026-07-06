import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { CONVERT_AS_BYTES, CONVERT_CPU_SECONDS, CONVERT_TIMEOUT_MS } from "./limits";

/**
 * The `pub2raw` subprocess seam — the ONE file that knows conversion runs as
 * a local child process (plan §10.7 seam #1). The production swap — calling
 * the backbone's sandboxed conversion service instead — replaces this file's
 * internals and nothing else.
 *
 * POC-enforced controls hosted here (plan §10.1): out-of-process execution,
 * wall-clock timeout with SIGKILL (a hang is a finding, not a wait), CPU and
 * address-space rlimits via a `prlimit` wrapper (the kernel-enforced backstop
 * for what a userland timer can't cover), bounded output, and a per-job
 * scratch-dir jail wiped in `finally`. Size caps are enforced at the route
 * before bytes reach this file.
 *
 * Fixture mode (plan §10.1): when the binary is absent — every dev/CI
 * machine — or `STP_IMPORT_FIXTURE=1` forces it, conversion serves the
 * checked-in golden trace through the identical downstream path, so the
 * pipeline runs everywhere with no native dependency. The Docker image
 * (Debian slim + libmspub-tools) is where live conversion executes.
 *
 * SERVER-ONLY: imports node built-ins; must never be pulled into client code
 * (the client boundary is client.ts).
 */

const execFileP = promisify(execFile);

export type ConvertOutcome =
  | { ok: true; trace: string; mode: "live" | "fixture" }
  | { ok: false; error: "parse-failed" | "timeout" | "resource-limit"; detail: string };

const FIXTURE_TRACE_PATH = join(process.cwd(), "fixtures", "pub-traces", "demo-flyer.trace");

let probe: { available: boolean; version?: string; error?: string } | null = null;

/** Probe `pub2raw`, capturing the reason it's unavailable. Cached per process. */
async function pub2rawProbe(): Promise<{ available: boolean; version?: string; error?: string }> {
  if (probe !== null) return probe;
  try {
    const { stdout } = await execFileP("pub2raw", ["--version"], { timeout: 5_000 });
    probe = { available: true, version: stdout.trim() };
  } catch (err) {
    // ENOENT = not installed → fixture mode. Any other failure (EACCES, a
    // PATH that misses /usr/bin, timeout) also means the live path can't be
    // trusted — but record WHICH so a fixture fallback is diagnosable, not
    // silent (the GET /api/import diagnostic surfaces this).
    const e = err as { code?: string; message?: string };
    probe = { available: false, error: e.code ? `${e.code}: ${e.message ?? ""}`.trim() : e.message ?? "unknown error" };
  }
  return probe;
}

async function pub2rawAvailable(): Promise<boolean> {
  return (await pub2rawProbe()).available;
}

let rlimitProbe: { available: boolean; error?: string } | null = null;

/**
 * Probe `prlimit` (util-linux), cached per process like the pub2raw probe.
 * Present on the Docker runner (Debian bookworm-slim) and Ubuntu CI; absent
 * on macOS dev boxes — there live conversion runs UNWRAPPED, and the gap is
 * surfaced (not silent) via importDiagnostics().rlimits.
 */
async function prlimitProbe(): Promise<{ available: boolean; error?: string }> {
  if (rlimitProbe !== null) return rlimitProbe;
  try {
    await execFileP("prlimit", ["--version"], { timeout: 5_000 });
    rlimitProbe = { available: true };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    rlimitProbe = { available: false, error: e.code ? `${e.code}: ${e.message ?? ""}`.trim() : e.message ?? "unknown error" };
  }
  return rlimitProbe;
}

/** The rlimit posture for the GET diagnostic — enforced (how) or not (why). */
async function rlimitDiagnostics() {
  const rl = await prlimitProbe();
  return rl.available
    ? {
        enforced: true as const,
        via: "prlimit" as const,
        limits: { cpuSeconds: CONVERT_CPU_SECONDS, asBytes: CONVERT_AS_BYTES },
      }
    : {
        enforced: false as const,
        reason: `prlimit not runnable (${rl.error}) — live conversion runs without CPU/memory rlimits on this host; the wall-clock timeout is the only subprocess cap`,
      };
}

export async function fixtureModeActive(): Promise<boolean> {
  if (process.env.STP_IMPORT_FIXTURE === "1") return true;
  return !(await pub2rawAvailable());
}

/** Why the import service is (or isn't) in live mode — the GET diagnostic. */
export async function importDiagnostics() {
  const fixtureForced = process.env.STP_IMPORT_FIXTURE === "1";
  const p = await pub2rawProbe();
  return {
    mode: fixtureForced || !p.available ? ("fixture" as const) : ("live" as const),
    fixtureForced,
    pub2raw: p,
    rlimits: await rlimitDiagnostics(),
    cwd: process.cwd(),
    reason: fixtureForced
      ? "STP_IMPORT_FIXTURE=1 is set in this server's environment — remove it to convert real files"
      : p.available
        ? "pub2raw found — real .pub files convert live"
        : `pub2raw not runnable (${p.error}) — install libmspub-tools on this server, or run the Docker image`,
  };
}

/** Convert .pub bytes to a pub2raw trace (or the fixture trace). */
export async function convertPub(bytes: Uint8Array): Promise<ConvertOutcome> {
  if (await fixtureModeActive()) {
    const trace = await readFile(FIXTURE_TRACE_PATH, "utf8");
    return { ok: true, trace, mode: "fixture" };
  }

  // Scratch-dir jail: per-job temp dir, wiped afterwards — parse inputs never
  // touch application storage (plan §10.1).
  const jail = await mkdtemp(join(tmpdir(), "pub-import-"));
  const inputPath = join(jail, "input.pub");
  try {
    await writeFile(inputPath, bytes);
    // rlimit wrapper (plan §10.1): `prlimit --cpu --as -- pub2raw` sets
    // kernel-enforced CPU-time and address-space ceilings on the conversion.
    // prlimit exec()s the target (no intermediate process), so the wall-clock
    // SIGKILL below still lands on pub2raw itself and exit status propagates
    // unchanged. The CPU limit is soft:hard with a 5 s gap — with soft==hard
    // the kernel prefers SIGKILL over SIGXCPU (verified on this kernel), and
    // a genuine CPU overrun would then be indistinguishable from a wall-clock
    // kill. Where prlimit is missing the conversion runs unwrapped — an
    // honest fallback reported by importDiagnostics(), never silent.
    const wrap = (await prlimitProbe()).available;
    const argv = wrap
      ? ["prlimit", `--cpu=${CONVERT_CPU_SECONDS}:${CONVERT_CPU_SECONDS + 5}`, `--as=${CONVERT_AS_BYTES}`, "--", "pub2raw", inputPath]
      : ["pub2raw", inputPath];
    const { stdout } = await execFileP(argv[0], argv.slice(1), {
      timeout: CONVERT_TIMEOUT_MS,
      killSignal: "SIGKILL",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, trace: stdout, mode: "live" };
  } catch (err) {
    const e = err as { killed?: boolean; signal?: string; code?: number | string; stderr?: string };
    // Kill classification, most specific first. SIGXCPU is unambiguously the
    // CPU rlimit (the kernel raises it at the soft limit; nothing else in this
    // pipeline sends it). An RLIMIT_AS overrun, by contrast, surfaces INSIDE
    // the child as allocation failure — a nonzero exit or a bad_alloc SIGABRT
    // indistinguishable from an ordinary parser crash — so it stays
    // "parse-failed"; the security property (bounded memory) holds either way.
    if (e.signal === "SIGXCPU") {
      return { ok: false, error: "resource-limit", detail: `conversion exceeded the ${CONVERT_CPU_SECONDS}s CPU rlimit (SIGXCPU)` };
    }
    if (e.killed || e.signal === "SIGKILL") {
      return { ok: false, error: "timeout", detail: `conversion exceeded ${CONVERT_TIMEOUT_MS / 1000}s and was killed` };
    }
    return {
      ok: false,
      error: "parse-failed",
      detail: typeof e.stderr === "string" && e.stderr.trim() ? e.stderr.trim().slice(0, 500) : `pub2raw exited with ${e.code}`,
    };
  } finally {
    await rm(jail, { recursive: true, force: true });
  }
}

/**
 * AV scan hook (plan §10.1) — present from P1 as a logging stub so the seam
 * exists; the suite's engine decision (ClamAV vs. commercial) lands later.
 */
export async function avScanHook(filename: string, bytes: Uint8Array): Promise<void> {
  console.info(`[import] AV scan hook (stub): ${filename}, ${bytes.length} bytes`);
}
