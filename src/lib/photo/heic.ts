import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * The HEIC ingest seam (plan §1.3, §3.5) — prebuilt `sharp` ships no HEIC
 * decoder (patent posture; its `heif` support is AVIF/AV1 only), so HEIC rides
 * a jailed `heif-convert` (libheif-examples) subprocess, exactly the
 * `pub2raw.ts` pattern. The Docker image and the CI live lane install the
 * package; a plain `npm run dev` laptop won't have it, and HEIC intake then
 * degrades honestly (a typed `unsupported-here`, surfaced by the diagnostic).
 *
 * PE1 ships the SEAM: the availability probe is real (it drives the GET
 * diagnostic and the intake gate), but the conversion itself is stubbed — the
 * jailed subprocess that turns HEIC bytes into a decodable JPEG lands in PE7,
 * where the "HEIC Live photo → printed 4×6 with zero external tools" path is
 * built and tested against real iPhone files.
 *
 * SERVER-ONLY: imports node built-ins; never bundle into client code.
 */

const execFileP = promisify(execFile);

let probe: { available: boolean; version?: string; error?: string } | null = null;

/**
 * Probe `heif-convert`, cached per process (the pub2raw probe pattern). Its
 * `--version` prints to stderr and exits non-zero on some builds, so any
 * output at all — stdout or stderr — counts as "present"; only a spawn failure
 * (ENOENT/EACCES) means unavailable.
 */
export async function probeHeifConvert(): Promise<{ available: boolean; version?: string; error?: string }> {
  if (probe !== null) return probe;
  try {
    const { stdout, stderr } = await execFileP("heif-convert", ["--version"], { timeout: 5_000 });
    probe = { available: true, version: (stdout || stderr || "").trim().slice(0, 200) || "heif-convert" };
  } catch (err) {
    const e = err as { code?: string; message?: string; stdout?: string; stderr?: string };
    // A tool that ran but exited non-zero on `--version` still exists — treat a
    // spawn error (ENOENT/EACCES/timeout) as absent, but any produced output as
    // present.
    if ((e.stdout && e.stdout.trim()) || (e.stderr && e.stderr.trim())) {
      probe = { available: true, version: (e.stdout || e.stderr || "").trim().slice(0, 200) };
    } else {
      probe = {
        available: false,
        error: e.code ? `${e.code}: ${e.message ?? ""}`.trim() : (e.message ?? "unknown error"),
      };
    }
  }
  return probe;
}

/** Convenience: is HEIC decode available on this host? (GET diagnostic + gate) */
export async function heicAvailable(): Promise<boolean> {
  return (await probeHeifConvert()).available;
}

export type HeicConvertOutcome =
  | { ok: true; jpeg: Buffer }
  | { ok: false; error: "unsupported-here" | "decode-failed" | "timeout" | "resource-limit"; detail: string };

/**
 * Convert HEIC bytes to a decodable JPEG in a jail — STUBBED for PE1.
 *
 * The intake route never calls this yet: it gates HEIC on `heicAvailable()`
 * and, since PE1 ships no conversion, returns `unsupported-here` regardless.
 * The real implementation (mkdtemp jail · prlimit · wall-clock SIGKILL · kill
 * classification, mirroring render-host.ts) lands in PE7. Keeping the typed
 * signature here means PE7 fills the body and nothing else moves.
 */
// `bytes` is intentionally unused until PE7 wires the real jailed subprocess.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function convertHeicToJpeg(bytes: Buffer): Promise<HeicConvertOutcome> {
  return {
    ok: false,
    error: "unsupported-here",
    detail: "HEIC conversion is not wired in this tranche — the jailed heif-convert subprocess lands in PE7",
  };
}
