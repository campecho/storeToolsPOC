/**
 * Import-endpoint caps (plan §10.1, POC-enforced): shared between the server
 * route (enforcement) and the client module (early rejection with a friendly
 * message before any upload).
 *
 * Every cap is env-overridable AT MODULE LOAD (`STP_*` below) for exactly one
 * reason: the P5 adversarial harness must exercise the caps without waiting
 * out 20-second timeouts or uploading gigabyte files. Production never sets
 * these variables — the defaults ARE the enforced limits.
 */

/** Positive-integer env override, falling back to the shipped default. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Per-file upload cap; also the inner-file and mid-inflate cap for `.puz`. */
export const MAX_PUB_BYTES = envInt("STP_MAX_PUB_BYTES", 25 * 1024 * 1024);

/** Wall-clock ceiling on the pub2raw subprocess; overrun ⇒ SIGKILL. */
export const CONVERT_TIMEOUT_MS = envInt("STP_CONVERT_TIMEOUT_MS", 20_000);

/**
 * prlimit RLIMIT_CPU for the subprocess, in seconds. Sits ABOVE the wall
 * timeout (20 s + headroom) on purpose: the wall clock is the primary kill,
 * the CPU rlimit is the kernel-enforced backstop for the case node's timer
 * can't cover — a spinning child that outlives its parent's supervision.
 */
export const CONVERT_CPU_SECONDS = envInt("STP_CONVERT_CPU_SECONDS", 25);

/** prlimit RLIMIT_AS (virtual address space) for the subprocess, in bytes. */
export const CONVERT_AS_BYTES = envInt("STP_CONVERT_AS_BYTES", 1024 * 1024 * 1024);
