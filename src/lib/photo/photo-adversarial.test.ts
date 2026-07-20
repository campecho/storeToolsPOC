import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial proof for the photo render-host jail seam (plan §3.6, §4 PE10b).
 * The existing render-host.test.ts proves the photo-specific typed outcomes
 * (success shape, decode death, pixel-flood) and cleanup on the SUCCESS path,
 * but inherits the kill axis — wall-clock SIGKILL, SIGXCPU rlimit, and jail
 * cleanup on a NON-clean exit — by comment from pub2raw.test.ts. This file
 * discharges that inheritance against the REAL photo worker with the same
 * mechanics the import seam uses: `#!/bin/sh` fakes PREPENDED to PATH and
 * STP_* caps shrunk at module load, re-imported per scenario.
 *
 * Cache-defeat: render-host.ts caches its prlimit probe at module scope and
 * limits.ts reads env at load, so every scenario resets modules and re-imports
 * after arranging PATH / TMPDIR / STP_* (mirrors pub2raw.test.ts). Vitest runs
 * files in separate workers and tests within a file sequentially, so per-test
 * env mutation (restored in afterEach) cannot leak.
 *
 * POSIX-only, like the import adversarial suite — the fakes are not Windows
 * portable, which the repo's Ubuntu CI posture accepts.
 */

type RenderHost = typeof import("./render-host");

const REAL_TMP = tmpdir();
const REAL_PATH = process.env.PATH ?? "";

const ENV_KEYS = [
  "PATH",
  "TMPDIR",
  "STP_PHOTO_INTAKE_TIMEOUT_MS",
  "STP_PHOTO_CPU_SECONDS",
  "STP_PHOTO_AS_BYTES",
] as const;

const savedEnv = new Map<string, string | undefined>();
const scratch: string[] = [];

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv.set(k, process.env[k]);
});

afterEach(async () => {
  for (const k of ENV_KEYS) {
    const v = savedEnv.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  await Promise.all(scratch.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** Fresh module instance: prlimit probe emptied, limits re-read from env. */
async function freshImport(): Promise<RenderHost> {
  vi.resetModules();
  return import("./render-host");
}

async function freshScratch(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(REAL_TMP, prefix));
  scratch.push(dir);
  return dir;
}

/** `#!/bin/sh` fakes into a temp bin dir (chmod 755) for PATH injection. */
async function fakeBinDir(scripts: Record<string, string>): Promise<string> {
  const dir = await freshScratch("fake-bin-");
  for (const [name, body] of Object.entries(scripts)) {
    const p = join(dir, name);
    await writeFile(p, body);
    await chmod(p, 0o755);
  }
  return dir;
}

/** Jail scratch dirs the host left behind under a controlled TMPDIR. */
async function jailLeftovers(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((n) => n.startsWith("photo-host-"));
}

// A fake prlimit must answer the host's `--version` probe fast or the probe's
// own timeout marks it unavailable → the worker runs unwrapped (wrap=false).
const VERSION_GUARD = `if [ "$1" = "--version" ]; then echo "prlimit 0.0-fake"; exit 0; fi`;

async function rgbPng(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#3366aa" } })
    .png()
    .toBuffer();
}

describe("intakeImage — wall-clock timeout kill (real worker)", () => {
  it(
    "SIGKILLs the worker at the (env-shrunk) timeout and classifies it as 'timeout'",
    async () => {
      // 1 ms is below node's own startup cost, so the worker is guaranteed to
      // be killed before it can finish — the wall-clock control, not the decode,
      // decides the outcome. (A hung real decode has no job kind to request; a
      // sub-startup timeout is the deterministic way to exercise the kill.)
      process.env.STP_PHOTO_INTAKE_TIMEOUT_MS = "1";
      const { intakeImage } = await freshImport();

      const t0 = performance.now();
      const out = await intakeImage(await rgbPng(1200, 800), "image/png");
      const elapsed = performance.now() - t0;

      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error).toBe("timeout");
      // A kill is a finding, not a wait: even a generous execFile teardown must
      // land in well under the 15s case budget.
      expect(elapsed).toBeLessThan(10_000);
    },
    15_000,
  );

  it(
    "wipes the scratch jail even when the worker is SIGKILLed on timeout",
    async () => {
      const tmp = await freshScratch("jail-timeout-");
      process.env.TMPDIR = tmp;
      process.env.STP_PHOTO_INTAKE_TIMEOUT_MS = "1";
      const { intakeImage } = await freshImport();

      const out = await intakeImage(await rgbPng(800, 600), "image/png");
      expect(out.ok).toBe(false);
      // The jail lived under OUR tmp (a real photo-host-* was created there) and
      // the `finally` wiped it despite the kill — no leftovers.
      expect(await jailLeftovers(tmp)).toEqual([]);
    },
    15_000,
  );
});

describe("runWorker — prlimit rlimit wrapper (real worker under a fake prlimit)", () => {
  it("invokes prlimit with exactly --cpu=<soft:hard> --as=<bytes> -- node <worker> <jail>", async () => {
    const logDir = await freshScratch("prlimit-log-");
    const argLog = join(logDir, "prlimit-args.log");
    const bin = await fakeBinDir({
      // Record the argv, then strip everything up to `--` and exec the wrapped
      // command so the REAL worker still runs and intake succeeds.
      prlimit: [
        "#!/bin/sh",
        VERSION_GUARD,
        `printf '%s\\n' "$@" > "${argLog}"`,
        `while [ $# -gt 0 ] && [ "$1" != "--" ]; do shift; done`,
        "shift",
        'exec "$@"',
        "",
      ].join("\n"),
    });
    process.env.PATH = `${bin}:${REAL_PATH}`;
    process.env.STP_PHOTO_CPU_SECONDS = "7";
    process.env.STP_PHOTO_AS_BYTES = "123456789";
    const { intakeImage } = await freshImport();

    const out = await intakeImage(await rgbPng(640, 480), "image/png");
    expect(out.ok).toBe(true);

    const argv = (await readFile(argLog, "utf8")).trimEnd().split("\n");
    // Exact order: cpu (soft:hard, +5s so the kernel raises SIGXCPU at the soft
    // limit rather than jumping to SIGKILL), then as, then `--`, then the
    // spawned command — node, the worker path, the jail dir.
    expect(argv.slice(0, 3)).toEqual(["--cpu=7:12", "--as=123456789", "--"]);
    expect(argv).toHaveLength(6);
    expect(argv[3]).toBe(process.execPath);
    expect(argv[4]).toMatch(/src\/lib\/photo\/photo-worker\.mjs$/);
    expect(argv[5]).toMatch(/photo-host-[^/]+$/);
  }, 15_000);

  it("classifies a SIGXCPU death as the 'resource-limit' outcome and still wipes the jail", async () => {
    const tmp = await freshScratch("jail-xcpu-");
    const bin = await fakeBinDir({
      // What the kernel does to a child that overruns the CPU soft rlimit —
      // simulated here so the classification is exercised without burning real
      // CPU-seconds (the pub2raw fake-binary discipline, applied to the wrapper).
      prlimit: `#!/bin/sh\n${VERSION_GUARD}\nkill -s XCPU $$\nsleep 5\n`,
    });
    process.env.PATH = `${bin}:${REAL_PATH}`;
    process.env.TMPDIR = tmp;
    const { intakeImage } = await freshImport();

    const out = await intakeImage(await rgbPng(640, 480), "image/png");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("resource-limit");
    expect(await jailLeftovers(tmp)).toEqual([]);
  }, 15_000);
});

describe("intakeImage — jail cleanup on a decode-failed exit (real worker)", () => {
  it("wipes the scratch jail when the worker dies on a truncated file", async () => {
    const tmp = await freshScratch("jail-decode-");
    process.env.TMPDIR = tmp;
    const { intakeImage } = await freshImport();

    // A valid JPEG header followed by nothing decodable — the worker's sharp
    // decode fails (typed decode-failed or a crash breadcrumb), never a success.
    const whole = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#888" } })
      .jpeg()
      .toBuffer();
    const truncated = whole.subarray(0, 40);

    const out = await intakeImage(truncated, "image/jpeg");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("decode-failed");
    expect(await jailLeftovers(tmp)).toEqual([]);
  }, 15_000);
});
