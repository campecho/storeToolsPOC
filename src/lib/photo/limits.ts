/**
 * Photo-pipeline caps (plan §3.5, POC-enforced): shared between the intake
 * route (enforcement), the render host (jail limits), and the client module
 * (early rejection with a friendly message before any upload).
 *
 * Every cap is env-overridable AT MODULE LOAD (`STP_*` below) for exactly one
 * reason: the adversarial harness must exercise the caps without uploading
 * 40 MB files or waiting out full timeouts. Production never sets these
 * variables — the defaults ARE the enforced limits (the import limits.ts rule).
 */

/** Positive-integer env override, falling back to the shipped default. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Per-file upload cap. */
export const MAX_PHOTO_BYTES = envInt("STP_MAX_PHOTO_BYTES", 40 * 1024 * 1024);

/**
 * Decoded-pixel ceiling (80 MP). Enforced IN the engine via sharp's
 * `limitInputPixels` (pixel-flood dies before allocation), and above it the
 * file routes out as oversize (PE7) rather than opening here.
 */
export const MAX_PHOTO_PIXELS = envInt("STP_MAX_PHOTO_PIXELS", 80_000_000);

/** Wall-clock ceiling on an intake jail job; overrun ⇒ SIGKILL. */
export const INTAKE_TIMEOUT_MS = envInt("STP_PHOTO_INTAKE_TIMEOUT_MS", 20_000);

/**
 * Wall-clock ceiling on a render (full-res replay) jail job; overrun ⇒ SIGKILL.
 * Higher than intake (a 12 MP export replays a chain of geometry passes, ≈1.6 s
 * per the v1.4 spike, but a deep recipe compounds), still bounded so a hang is
 * a finding, not a wait (plan §4 PE3). Sits above the shared PHOTO_CPU_SECONDS
 * rlimit, which stays the kernel-enforced backstop.
 */
export const RENDER_TIMEOUT_MS = envInt("STP_PHOTO_RENDER_TIMEOUT_MS", 60_000);

/**
 * prlimit RLIMIT_CPU for jail subprocesses, seconds. Sits ABOVE the wall
 * timeout on purpose: the wall clock is the primary kill, the CPU rlimit is
 * the kernel-enforced backstop (the pub2raw rationale, verbatim).
 */
export const PHOTO_CPU_SECONDS = envInt("STP_PHOTO_CPU_SECONDS", 25);

/**
 * prlimit RLIMIT_AS for jail subprocesses, bytes. 2 GiB: an 80 MP RGBA frame
 * is ~320 MB raw and libvips pipelines carry a few working copies; the
 * ceiling caps runaway allocation, not honest work. (Caveat inherited from
 * pub2raw: an RLIMIT_AS overrun kills the child at malloc and classifies as
 * `parse-failed`/decode-failed, not `resource-limit` — v1.4.)
 */
export const PHOTO_AS_BYTES = envInt("STP_PHOTO_AS_BYTES", 2 * 1024 * 1024 * 1024);

/**
 * Screen-proxy ceiling, long-edge pixels (plan §1.3 / open question #6 —
 * the v1.4 spike's 52.7 ms LUT+matrix pass at 2048 px supports it).
 */
export const PROXY_MAX_EDGE = envInt("STP_PHOTO_PROXY_MAX_EDGE", 2048);

/** JPEG quality for re-encoded working masters (v1.4 spike, open question #3). */
export const MASTER_JPEG_QUALITY = envInt("STP_PHOTO_MASTER_JPEG_QUALITY", 95);

/** JPEG quality for screen proxies. */
export const PROXY_JPEG_QUALITY = envInt("STP_PHOTO_PROXY_JPEG_QUALITY", 85);

/** Bounded stdout/result size from a jail worker (guards a hostile encoder). */
export const WORKER_MAX_OUTPUT_BYTES = envInt(
  "STP_PHOTO_WORKER_MAX_OUTPUT_BYTES",
  256 * 1024 * 1024,
);
