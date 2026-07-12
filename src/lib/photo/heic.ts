import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { INTAKE_TIMEOUT_MS, PHOTO_AS_BYTES, PHOTO_CPU_SECONDS } from "./limits";

/**
 * The HEIC ingest seam (plan §1.3, §3.5) — prebuilt `sharp` ships no HEIC
 * decoder (patent posture; its `heif` support is AVIF/AV1 only), so HEIC rides
 * a jailed `heif-convert` (libheif-examples) subprocess, exactly the
 * `pub2raw.ts` / render-host.ts pattern. The Docker image and the CI live lane
 * install the package; a plain `npm run dev` laptop won't have it, and HEIC
 * intake then degrades honestly (a typed `unsupported-here`, surfaced by the
 * diagnostic).
 *
 * The availability probe drives the GET diagnostic and the intake gate; the
 * conversion turns HEIC bytes into a decodable JPEG that the intake pipeline
 * then treats like any other RGB arrival (the pixel cap applies to the decoded
 * JPEG downstream — that is the enforcement point, not this file).
 *
 * SERVER-ONLY: imports node built-ins and spawns a child; never bundle into
 * client code (the client boundary is client.ts).
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

/* ------------------------------------------------------------------ */
/* prlimit probe (cached, local — the pub2raw / lcms pattern)          */
/* ------------------------------------------------------------------ */

let rlimitProbe: { available: boolean; error?: string } | null = null;
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

export type HeicConvertOutcome =
  | { ok: true; jpeg: Buffer }
  | { ok: false; error: "unsupported-here" | "decode-failed" | "timeout" | "resource-limit"; detail: string };

/**
 * Convert HEIC bytes to a decodable JPEG in a jail (plan §4 PE7). The bytes land
 * as `input.heic` in a per-run `mkdtemp` scratch dir (wiped in `finally`), and
 * `heif-convert -q 95 input.heic out.jpg` runs under the SAME jail discipline as
 * render-host / pub2raw: a `prlimit --cpu --as` wrapper where available (the
 * INTAKE CPU/AS rlimits — a HEIC decode is an intake-side job), a wall-clock
 * timeout with SIGKILL, and no user string ever reaching a shell (execFile arg
 * vector). The returned JPEG re-enters the intake pipeline like any RGB arrival.
 *
 * Multi-image HEIC (a Live photo carries the still plus motion frames) makes
 * heif-convert write `out-1.jpg`/`out-2.jpg` siblings instead of `out.jpg`; the
 * PRIMARY image — the still — is the lexicographically first, so we take
 * `out.jpg` when present, else the first `out*.jpg`.
 *
 * Failure classification mirrors render-host, most specific first: a spawn
 * failure (ENOENT/EACCES — the binary vanished after the probe) → the same
 * honest `unsupported-here` the capability gate gives; SIGXCPU (the CPU rlimit
 * backstop) → `resource-limit`; a wall-clock SIGKILL → `timeout`; a non-zero
 * exit or no decodable output → `decode-failed`.
 */
export async function convertHeicToJpeg(bytes: Buffer): Promise<HeicConvertOutcome> {
  const jail = await mkdtemp(join(tmpdir(), "photo-heic-"));
  const inputPath = join(jail, "input.heic");
  // heif-convert derives sibling names from this base (`out-1.jpg`, … for a
  // multi-image file), so keep the base stable and scan for what it wrote.
  const outBase = join(jail, "out.jpg");
  try {
    await writeFile(inputPath, bytes);

    // `prlimit --cpu=<soft:hard> --as -- heif-convert -q 95 in out`. Same
    // rationale as render-host: the wall clock is the primary kill, the CPU
    // rlimit the kernel backstop with a soft:hard gap so an overrun raises the
    // distinguishable SIGXCPU before SIGKILL. Where prlimit is missing the
    // decode runs unwrapped (honest, surfaced by the GET diagnostic's rlimits).
    const wrap = (await prlimitProbe()).available;
    const heifArgs = ["-q", "95", inputPath, outBase];
    const argv = wrap
      ? [
          "prlimit",
          `--cpu=${PHOTO_CPU_SECONDS}:${PHOTO_CPU_SECONDS + 5}`,
          `--as=${PHOTO_AS_BYTES}`,
          "--",
          "heif-convert",
          ...heifArgs,
        ]
      : ["heif-convert", ...heifArgs];

    try {
      await execFileP(argv[0], argv.slice(1), {
        timeout: INTAKE_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024, // heif-convert talks through files, not stdout
        windowsHide: true,
      });
    } catch (err) {
      const e = err as { killed?: boolean; signal?: string; code?: number | string; stderr?: string };
      // Spawn failure — the binary is missing/unrunnable despite the probe.
      // Honest unsupported-here, the same answer the capability gate gives.
      if (e.code === "ENOENT" || e.code === "EACCES") {
        return { ok: false, error: "unsupported-here", detail: `heif-convert not runnable: ${e.code}` };
      }
      // Kill classification, most specific first (the pub2raw ordering). SIGXCPU
      // is unambiguously the CPU rlimit; a wall-clock kill surfaces as
      // killed/SIGKILL; anything else non-clean is an undecodable file. (An
      // RLIMIT_AS overrun dies at malloc and lands here as decode-failed, not
      // resource-limit — the inherited pub2raw caveat; bounded memory holds.)
      if (e.signal === "SIGXCPU") {
        return { ok: false, error: "resource-limit", detail: `heif-convert exceeded the ${PHOTO_CPU_SECONDS}s CPU rlimit (SIGXCPU)` };
      }
      if (e.killed || e.signal === "SIGKILL") {
        return { ok: false, error: "timeout", detail: `heif-convert exceeded ${INTAKE_TIMEOUT_MS / 1000}s and was killed` };
      }
      return {
        ok: false,
        error: "decode-failed",
        detail: typeof e.stderr === "string" && e.stderr.trim() ? e.stderr.trim().slice(0, 500) : `heif-convert exited with ${e.code}`,
      };
    }

    // Pick the primary image: `out.jpg` (single-image file) or, for a Live
    // photo's siblings, the lexicographically first `out*.jpg`.
    let entries: string[];
    try {
      entries = (await readdir(jail)).filter((n) => /^out.*\.jpg$/i.test(n)).sort();
    } catch {
      entries = [];
    }
    const primary = entries.includes("out.jpg") ? "out.jpg" : entries[0];
    if (!primary) {
      return { ok: false, error: "decode-failed", detail: "heif-convert wrote no JPEG output" };
    }
    const jpeg = await readFile(join(jail, primary));
    if (jpeg.length === 0) {
      return { ok: false, error: "decode-failed", detail: "heif-convert produced an empty JPEG" };
    }
    return { ok: true, jpeg };
  } finally {
    await rm(jail, { recursive: true, force: true });
  }
}
