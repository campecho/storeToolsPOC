import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { CONVERT_TIMEOUT_MS } from "./limits";

/**
 * The `pub2raw` subprocess seam — the ONE file that knows conversion runs as
 * a local child process (plan §10.7 seam #1). The production swap — calling
 * the backbone's sandboxed conversion service instead — replaces this file's
 * internals and nothing else.
 *
 * POC-enforced controls hosted here (plan §10.1): out-of-process execution,
 * wall-clock timeout with SIGKILL (a hang is a finding, not a wait), bounded
 * output, and a per-job scratch-dir jail wiped in `finally`. Size caps are
 * enforced at the route before bytes reach this file.
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
  | { ok: false; error: "parse-failed" | "timeout"; detail: string };

const FIXTURE_TRACE_PATH = join(process.cwd(), "fixtures", "pub-traces", "demo-flyer.trace");

let binaryChecked: boolean | null = null;

/** Is pub2raw runnable here? Cached across requests. */
async function pub2rawAvailable(): Promise<boolean> {
  if (binaryChecked !== null) return binaryChecked;
  try {
    await execFileP("pub2raw", ["--version"], { timeout: 5_000 });
    binaryChecked = true;
  } catch {
    // ENOENT = not installed → fixture mode. Any other failure also means the
    // live path can't be trusted here.
    binaryChecked = false;
  }
  return binaryChecked;
}

export async function fixtureModeActive(): Promise<boolean> {
  if (process.env.STP_IMPORT_FIXTURE === "1") return true;
  return !(await pub2rawAvailable());
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
    const { stdout } = await execFileP("pub2raw", [inputPath], {
      timeout: CONVERT_TIMEOUT_MS,
      killSignal: "SIGKILL",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, trace: stdout, mode: "live" };
  } catch (err) {
    const e = err as { killed?: boolean; signal?: string; code?: number | string; stderr?: string };
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
