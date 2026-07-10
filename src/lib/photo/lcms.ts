import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PHOTO_AS_BYTES, PHOTO_CPU_SECONDS, RENDER_TIMEOUT_MS } from "./limits";

/**
 * The CMYK-preserving lcms seam (plan §1.3, §4 PE5, v1.4) — the ONE module that
 * knows a CMYK separation is round-tripped by a jailed `tificc` (liblcms2-utils)
 * subprocess. Prebuilt `sharp` FORCE-UNPACKS CMYK input to sRGB on decode (no
 * passthrough; `keepIccProfile` only re-tags 3-channel pixels), so "a CMYK
 * arrival stays CMYK end-to-end" cannot ride sharp's decoder. `tificc` transforms
 * the raw CMYK TIFF bytes through the committed GRACoL profile — the same
 * `heif-convert` subprocess pattern (heic.ts), the same jail discipline as
 * render-host / pub2raw.
 *
 * WHERE ABSENT (this dev container, a plain `npm run dev` laptop — expected):
 * `tificc` ships in `liblcms2-utils`, which the Docker image and the CI live-import
 * lane install but a bare box does not. `probeTificc()` reports it honestly, the
 * GET /api/photo diagnostic surfaces `cmykPreserve:false`, and every CMYK path
 * degrades to today's behaviour — the working RGB master + a sharp
 * separate-through-GRACoL export (the render route marks that `X-Photo-Reseparated`).
 *
 * SHIPPED `tificc` INVOCATION (documented — verify the flags against `tificc -h`
 * on a host that has it): `tificc -i<gracol> -o<gracol> -t1 input.tif output.tif`.
 * The SAME GRACoL profile is BOTH the input and output profile — an
 * identity-intent re-encode (`-t1` relative-colorimetric) that maps the arriving
 * CMYK through the profile's PCS and back, PRESERVING the separation rather than
 * re-separating from RGB. Profile paths attach to the `-i`/`-o` flag with no
 * space (lcms convention). It is the CDR the plan calls the "CMYK-preserving
 * path": the transcode is also the sanitizer.
 *
 * SERVER-ONLY: imports node built-ins and spawns a child; never bundle into
 * client code (the client boundary is client.ts).
 */

const execFileP = promisify(execFile);

/** The committed GRACoL press profile — copied INTO the jail per run so tificc
    reads a jail-local profile, never a path outside its scratch dir (§3.6). */
const GRACOL_PROFILE_PATH = join(process.cwd(), "src", "lib", "photo", "profiles", "GRACoL2013_CRPC6.icc");

/* ------------------------------------------------------------------ */
/* Probe (cached) — the heif-convert / pub2raw pattern                 */
/* ------------------------------------------------------------------ */

let probe: { available: boolean; version?: string; error?: string } | null = null;

/**
 * Probe `tificc`, cached per process. Its usage/flags print to stderr and it
 * exits non-zero for `-h` on some builds, so ANY output (stdout or stderr)
 * counts as present; only a spawn failure (ENOENT/EACCES/timeout) means absent
 * — the heif-convert probe posture.
 */
export async function probeTificc(): Promise<{ available: boolean; version?: string; error?: string }> {
  if (probe !== null) return probe;
  try {
    const { stdout, stderr } = await execFileP("tificc", ["-h"], { timeout: 5_000 });
    probe = { available: true, version: (stdout || stderr || "").trim().slice(0, 200) || "tificc" };
  } catch (err) {
    const e = err as { code?: string; message?: string; stdout?: string; stderr?: string };
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

/** Convenience: is the CMYK-preserving path available on this host? (GET
    diagnostic `cmykPreserve` + the intake/render CMYK-arrival gates). */
export async function tificcAvailable(): Promise<boolean> {
  return (await probeTificc()).available;
}

/* ------------------------------------------------------------------ */
/* prlimit probe (cached, local — the pub2raw pattern)                 */
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

/* ------------------------------------------------------------------ */
/* CMYK-preserving transform (jailed tificc)                           */
/* ------------------------------------------------------------------ */

export type CmykPreserveOutcome =
  | { ok: true; tiff: Buffer }
  | { ok: false; error: "unsupported-here" | "decode-failed" | "timeout" | "resource-limit"; detail: string };

/**
 * Round-trip a CMYK TIFF through the GRACoL identity transform in a jail,
 * KEEPING the 4-channel separation (see the module header for the flags). `input`
 * must be CMYK TIFF bytes — `tificc` is libtiff-based and reads TIFF only, so a
 * CMYK JPEG arriving here fails honestly (decode-failed) and the caller falls
 * back. Returns the transformed CMYK TIFF, or a typed failure; `unsupported-here`
 * when tificc isn't installed (the common dev/laptop case).
 *
 * Jail discipline (§3.6, the render-host/pub2raw seam): per-run `mkdtemp` wiped
 * in `finally`, the profile copied jail-local, a `prlimit --cpu --as` wrapper
 * where available, a wall-clock timeout with SIGKILL, and no user string ever
 * reaching a shell (execFile arg vector, not a command line).
 */
export async function cmykPreservePath(input: Buffer): Promise<CmykPreserveOutcome> {
  if (!(await tificcAvailable())) {
    return { ok: false, error: "unsupported-here", detail: "tificc (liblcms2-utils) is not installed on this host" };
  }

  const jail = await mkdtemp(join(tmpdir(), "photo-lcms-"));
  const inputPath = join(jail, "input.tif");
  const outputPath = join(jail, "output.tif");
  const profilePath = join(jail, "gracol.icc"); // jail-local — never reach outside the jail
  try {
    await writeFile(inputPath, input);
    await copyFile(GRACOL_PROFILE_PATH, profilePath);

    // `prlimit --cpu=<soft:hard> --as -- tificc -i<gracol> -o<gracol> -t1 in out`.
    // Same rlimit rationale as render-host: the wall clock is the primary kill,
    // the CPU rlimit the kernel backstop; where prlimit is missing tificc runs
    // unwrapped (honest, surfaced by the GET diagnostic's rlimits field).
    const wrap = (await prlimitProbe()).available;
    const tificcArgs = [`-i${profilePath}`, `-o${profilePath}`, "-t1", inputPath, outputPath];
    const argv = wrap
      ? [
          "prlimit",
          `--cpu=${PHOTO_CPU_SECONDS}:${PHOTO_CPU_SECONDS + 5}`,
          `--as=${PHOTO_AS_BYTES}`,
          "--",
          "tificc",
          ...tificcArgs,
        ]
      : ["tificc", ...tificcArgs];

    try {
      await execFileP(argv[0], argv.slice(1), {
        timeout: RENDER_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024, // tificc talks through files, not stdout
        windowsHide: true,
      });
    } catch (err) {
      const e = err as { killed?: boolean; signal?: string; code?: number | string; stderr?: string };
      // Kill classification, most specific first (the pub2raw ordering).
      if (e.signal === "SIGXCPU") {
        return { ok: false, error: "resource-limit", detail: `tificc exceeded the ${PHOTO_CPU_SECONDS}s CPU rlimit (SIGXCPU)` };
      }
      if (e.killed || e.signal === "SIGKILL") {
        return { ok: false, error: "timeout", detail: `tificc exceeded ${RENDER_TIMEOUT_MS / 1000}s and was killed` };
      }
      return {
        ok: false,
        error: "decode-failed",
        detail: typeof e.stderr === "string" && e.stderr.trim() ? e.stderr.trim().slice(0, 500) : `tificc exited with ${e.code}`,
      };
    }

    try {
      const tiff = await readFile(outputPath);
      if (tiff.length === 0) return { ok: false, error: "decode-failed", detail: "tificc produced an empty output" };
      return { ok: true, tiff };
    } catch {
      return { ok: false, error: "decode-failed", detail: "tificc wrote no output" };
    }
  } finally {
    await rm(jail, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* CMYK-TIFF detection (a bounded header read — the cab.ts discipline)  */
/* ------------------------------------------------------------------ */

/**
 * Walk the first IFD and pull the INLINED values of the requested SHORT/LONG
 * tags — bounds-checked throughout (cab.ts spirit): any malformed byte-order /
 * magic / offset / length stops the read and returns what it has rather than
 * throwing. Only handles count-1 SHORT (type 3) / LONG (type 4) tags inlined in
 * the value field — enough for the photometric + dimension tags we read.
 */
function readTiffTags(buf: Buffer, wanted: number[]): Map<number, number> {
  const out = new Map<number, number>();
  if (buf.length < 8) return out;
  let le: boolean;
  if (buf[0] === 0x49 && buf[1] === 0x49) le = true; // "II" little-endian
  else if (buf[0] === 0x4d && buf[1] === 0x4d) le = false; // "MM" big-endian
  else return out;

  const u16 = (o: number): number => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o: number): number => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));

  if (u16(2) !== 42) return out; // TIFF magic
  const ifd = u32(4);
  if (ifd < 8 || ifd + 2 > buf.length) return out;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > buf.length) return out;
    const tag = u16(entry);
    if (wanted.includes(tag)) {
      const type = u16(entry + 2);
      out.set(tag, type === 3 ? u16(entry + 8) : u32(entry + 8));
    }
  }
  return out;
}

/**
 * Best-effort: does this TIFF declare a CMYK (Separated) photometric? Reads the
 * first IFD's PhotometricInterpretation tag (262) — value 5 = Separated (CMYK)
 * per TIFF 6.0 §8. The render route uses it to decide the CMYK-arrival path
 * (preserve vs re-separate); a conservative `false` just routes to the honest
 * sharp separation, so a miss is safe.
 */
export function isCmykTiff(buf: Buffer): boolean {
  return readTiffTags(buf, [262]).get(262) === 5;
}

/**
 * Best-effort pixel dimensions of a TIFF from its ImageWidth (256) / ImageLength
 * (257) tags — the render host's HEADER read for a TIFF master (imageDimensions
 * in image-meta.ts covers png/jpeg/gif only). `undefined` when either tag is
 * missing/malformed, which the host treats as decode-failed.
 */
export function tiffDimensions(buf: Buffer): { width: number; height: number } | undefined {
  const tags = readTiffTags(buf, [256, 257]);
  const width = tags.get(256);
  const height = tags.get(257);
  return width && height ? { width, height } : undefined;
}
