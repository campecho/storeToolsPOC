import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial proof for the pub2raw subprocess seam (plan §10.1, P5): the
 * wall-clock kill, the prlimit rlimit wrapper, the scratch-dir jail, and the
 * honesty of fixture/rlimit fallbacks. No real binary is required — "pub2raw"
 * and "prlimit" here are `#!/bin/sh` fakes in a temp dir PREPENDED to PATH,
 * so the deterministic lane runs on any POSIX box (CI is Ubuntu; the fakes
 * are not Windows-portable, which is acceptable per the repo's CI posture).
 *
 * Cache-defeat mechanics: pub2raw.ts caches its binary probes at module
 * scope and limits.ts reads env at module load, so every scenario re-imports
 * the module (`vi.resetModules()` + dynamic import) after arranging PATH and
 * STP_* overrides. Vitest runs test FILES in separate workers and the tests
 * within this file sequentially, so per-test env mutation (restored in
 * afterEach) cannot leak into other suites.
 *
 * The trailing `describe.runIf(STP_LIVE_IMPORT === "1")` block is the live
 * lane: it needs the real /usr/bin/pub2raw and exercises the corpus plus a
 * deterministic bit-flip fuzz smoke.
 */

type Pub2Raw = typeof import("./pub2raw");

// Captured before any test rewrites TMPDIR/PATH.
const REAL_TMP = tmpdir();
const REAL_PATH = process.env.PATH ?? "";

const ENV_KEYS = [
  "PATH",
  "TMPDIR",
  "STP_IMPORT_FIXTURE",
  "STP_CONVERT_TIMEOUT_MS",
  "STP_CONVERT_CPU_SECONDS",
  "STP_CONVERT_AS_BYTES",
  "STP_MAX_PUB_BYTES",
] as const;

const savedEnv = new Map<string, string | undefined>();
const scratch: string[] = [];

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv.set(k, process.env[k]);
  // The suite must control fixture mode explicitly — a stray env var here
  // would silently bypass every live-path assertion below.
  delete process.env.STP_IMPORT_FIXTURE;
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

/** Fresh module instance: probe caches emptied, limits re-read from env. */
async function freshImport(): Promise<Pub2Raw> {
  vi.resetModules();
  return import("./pub2raw");
}

async function freshScratch(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(REAL_TMP, prefix));
  scratch.push(dir);
  return dir;
}

/** Write `#!/bin/sh` fakes into a temp bin dir (chmod 755) for PATH injection. */
async function fakeBinDir(scripts: Record<string, string>): Promise<string> {
  const dir = await freshScratch("fake-bin-");
  for (const [name, body] of Object.entries(scripts)) {
    const p = join(dir, name);
    await writeFile(p, body);
    await chmod(p, 0o755);
  }
  return dir;
}

// Every fake pub2raw must answer the module's `--version` probe quickly or
// the probe's own 5s timeout marks the binary unavailable → fixture mode.
const VERSION_GUARD = `if [ "$1" = "--version" ]; then echo "pub2raw 0.0-fake"; exit 0; fi`;

/** Minimal bytes that sniff as a real .pub — the payload content is irrelevant here. */
function pubBytes(): Uint8Array {
  const b = new Uint8Array(560);
  b.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  b.set([0xe8, 0xac, 0x2c, 0x00], 512);
  return b;
}

async function jailLeftovers(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((n) => n.startsWith("pub-import-"));
}

describe("convertPub — wall-clock timeout kill", () => {
  it(
    "SIGKILLs a hung conversion at the (env-shrunk) timeout, never waits it out",
    async () => {
      const bin = await fakeBinDir({
        pub2raw: `#!/bin/sh\n${VERSION_GUARD}\nexec sleep 30\n`,
      });
      process.env.PATH = `${bin}:${REAL_PATH}`;
      process.env.STP_CONVERT_TIMEOUT_MS = "400";
      const mod = await freshImport();

      const t0 = performance.now();
      const out = await mod.convertPub(pubBytes());
      const elapsed = performance.now() - t0;

      expect(out).toEqual({ ok: false, error: "timeout", detail: expect.stringContaining("was killed") });
      // A hang is a finding, not a wait: the 30s sleeper must die in well
      // under 5s or the timeout control has failed.
      expect(elapsed).toBeLessThan(5_000);
    },
    10_000
  );
});

describe("convertPub — scratch-dir jail is wiped on every exit path", () => {
  // Each case points TMPDIR at a fresh dir (os.tmpdir() re-reads env per
  // call) and has the fake log the input path it was handed — proving the
  // jail really lived under OUR dir before asserting it's gone (a wrong
  // TMPDIR would make the leftover check pass vacuously).
  async function runJailCase(scriptBody: (log: string) => string, envExtra?: Record<string, string>) {
    const tmp = await freshScratch("jail-tmp-");
    const log = join(tmp, "seen-input.log");
    const bin = await fakeBinDir({
      pub2raw: `#!/bin/sh\n${VERSION_GUARD}\n${scriptBody(log)}\n`,
    });
    process.env.PATH = `${bin}:${REAL_PATH}`;
    process.env.TMPDIR = tmp;
    Object.assign(process.env, envExtra);
    const mod = await freshImport();
    const out = await mod.convertPub(pubBytes());
    const seenInput = await readFile(log, "utf8");
    expect(seenInput.startsWith(`${tmp}/`)).toBe(true);
    expect(seenInput).toMatch(/pub-import-[^/]+\/input\.pub$/);
    expect(await jailLeftovers(tmp)).toEqual([]);
    return out;
  }

  it("success path: jail created under TMPDIR, wiped after", async () => {
    const out = await runJailCase((log) => `printf '%s' "$1" > "${log}"\necho "fake trace output"`);
    expect(out).toMatchObject({ ok: true, mode: "live", trace: expect.stringContaining("fake trace output") });
  });

  it("parse-failed path: jail wiped even when the parser crashes", async () => {
    const out = await runJailCase((log) => `printf '%s' "$1" > "${log}"\necho "boom: bad escher record" >&2\nexit 3`);
    expect(out).toMatchObject({ ok: false, error: "parse-failed", detail: expect.stringContaining("boom") });
  });

  it(
    "timeout path: jail wiped even when the child is SIGKILLed",
    async () => {
      const out = await runJailCase((log) => `printf '%s' "$1" > "${log}"\nexec sleep 30`, {
        STP_CONVERT_TIMEOUT_MS: "400",
      });
      expect(out).toMatchObject({ ok: false, error: "timeout" });
    },
    10_000
  );
});

describe("convertPub — prlimit rlimit wrapper", () => {
  it("invokes prlimit with exactly --cpu=<soft:hard> --as=<bytes> -- pub2raw <input>", async () => {
    const tmp = await freshScratch("prlimit-log-");
    const argLog = join(tmp, "prlimit-args.log");
    const bin = await fakeBinDir({
      // Recording prlimit: log the argv it received, then exec the wrapped
      // command (everything after `--`) so the pipeline still completes.
      prlimit: [
        "#!/bin/sh",
        `if [ "$1" = "--version" ]; then echo "prlimit 0.0-fake"; exit 0; fi`,
        `printf '%s\\n' "$@" > "${argLog}"`,
        `while [ $# -gt 0 ] && [ "$1" != "--" ]; do shift; done`,
        "shift",
        'exec "$@"',
        "",
      ].join("\n"),
      pub2raw: `#!/bin/sh\n${VERSION_GUARD}\necho "wrapped trace"\n`,
    });
    process.env.PATH = `${bin}:${REAL_PATH}`;
    process.env.STP_CONVERT_CPU_SECONDS = "7";
    process.env.STP_CONVERT_AS_BYTES = "123456789";
    const mod = await freshImport();

    const out = await mod.convertPub(pubBytes());
    expect(out).toMatchObject({ ok: true, mode: "live", trace: expect.stringContaining("wrapped trace") });

    const argv = (await readFile(argLog, "utf8")).trimEnd().split("\n");
    // Exact order: cpu (soft:hard, +5s gap so the kernel raises SIGXCPU
    // instead of jumping straight to SIGKILL), then as, then the command.
    expect(argv.slice(0, 4)).toEqual(["--cpu=7:12", "--as=123456789", "--", "pub2raw"]);
    expect(argv).toHaveLength(5);
    expect(argv[4]).toMatch(/pub-import-[^/]+\/input\.pub$/);
  });

  it("classifies a SIGXCPU death as the 'resource-limit' outcome", async () => {
    const bin = await fakeBinDir({
      // What the kernel does to a CPU-spinning child at the soft rlimit.
      pub2raw: `#!/bin/sh\n${VERSION_GUARD}\nkill -s XCPU $$\nsleep 5\n`,
    });
    process.env.PATH = `${bin}:${REAL_PATH}`;
    const mod = await freshImport();

    const out = await mod.convertPub(pubBytes());
    expect(out).toMatchObject({ ok: false, error: "resource-limit", detail: expect.stringContaining("CPU rlimit") });
  });
});

describe("fixture-mode and rlimit-fallback honesty (GET diagnostic)", () => {
  it("no pub2raw on PATH → fixture mode, and the reason names the install fix", async () => {
    const emptyBin = await fakeBinDir({});
    process.env.PATH = emptyBin; // nothing findable — not pub2raw, not prlimit
    const mod = await freshImport();

    const diag = await mod.importDiagnostics();
    expect(diag.mode).toBe("fixture");
    expect(diag.fixtureForced).toBe(false);
    expect(diag.pub2raw.available).toBe(false);
    expect(diag.reason).toContain("libmspub-tools");
    // rlimits are honestly reported unenforced too — never silently claimed.
    expect(diag.rlimits).toMatchObject({ enforced: false, reason: expect.stringContaining("prlimit") });

    // Conversion still serves the fixture trace through the real path.
    const out = await mod.convertPub(pubBytes());
    expect(out).toMatchObject({ ok: true, mode: "fixture" });
  });

  it("pub2raw present but prlimit absent → live mode runs UNWRAPPED and says so", async () => {
    // Only builtins in the fake — PATH holds nothing else, mirroring a macOS
    // dev box where pub2raw exists but util-linux/prlimit does not.
    const bin = await fakeBinDir({
      pub2raw: `#!/bin/sh\n${VERSION_GUARD}\necho "unwrapped trace"\n`,
    });
    process.env.PATH = bin;
    const mod = await freshImport();

    const diag = await mod.importDiagnostics();
    expect(diag.mode).toBe("live");
    expect(diag.rlimits).toMatchObject({
      enforced: false,
      reason: expect.stringContaining("prlimit not runnable"),
    });

    const out = await mod.convertPub(pubBytes());
    expect(out).toMatchObject({ ok: true, mode: "live", trace: expect.stringContaining("unwrapped trace") });
  });

  it("prlimit present → diagnostics reports the enforced limits", async () => {
    const bin = await fakeBinDir({
      pub2raw: `#!/bin/sh\n${VERSION_GUARD}\necho t\n`,
      prlimit: `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "prlimit 0.0-fake"; exit 0; fi\nexec "$@"\n`,
    });
    process.env.PATH = bin;
    process.env.STP_CONVERT_CPU_SECONDS = "9";
    process.env.STP_CONVERT_AS_BYTES = "555";
    const mod = await freshImport();

    const diag = await mod.importDiagnostics();
    expect(diag.rlimits).toEqual({
      enforced: true,
      via: "prlimit",
      limits: { cpuSeconds: 9, asBytes: 555 },
    });
  });

  it("STP_IMPORT_FIXTURE=1 forces fixture mode over a working binary (e2e's diagnostic contract)", async () => {
    const bin = await fakeBinDir({
      pub2raw: `#!/bin/sh\n${VERSION_GUARD}\necho t\n`,
    });
    process.env.PATH = bin;
    process.env.STP_IMPORT_FIXTURE = "1";
    const mod = await freshImport();

    const diag = await mod.importDiagnostics();
    // The three fields e2e/pub-import.spec.ts pins — adding `rlimits` must
    // not have disturbed them.
    expect(diag.mode).toBe("fixture");
    expect(diag.fixtureForced).toBe(true);
    expect(diag.reason).toContain("STP_IMPORT_FIXTURE");
  });
});

// ---------------------------------------------------------------------------
// Live lane: real /usr/bin/pub2raw (and prlimit where present). Gated on
// STP_LIVE_IMPORT=1 — the deterministic lane above never spawns a real binary.
// ---------------------------------------------------------------------------
describe.runIf(process.env.STP_LIVE_IMPORT === "1")("live pub2raw (STP_LIVE_IMPORT=1)", () => {
  const CORPUS_DIR = join(process.cwd(), "fixtures", "pub-corpus");
  const CORPUS = [
    "3up_tabs.pub",
    "bcim_double_cut.pub",
    "business_card_template_10up.pub", // converts to an empty-but-valid trace
    "production_checkpoint_labels.pub",
  ];

  it(
    "fuzz smoke: 8 deterministic single-byte flips never escape the typed contract",
    async () => {
      const tmp = await freshScratch("live-fuzz-");
      process.env.TMPDIR = tmp;
      // Bound a fuzz-induced hang at 5s so the whole lane stays fast — a
      // timeout outcome is still a clean typed error, and still a finding.
      process.env.STP_CONVERT_TIMEOUT_MS = "5000";
      const mod = await freshImport();

      const src = new Uint8Array(await readFile(join(CORPUS_DIR, "3up_tabs.pub")));
      expect(src.length).toBe(102_400);
      // Hardcoded, deterministic offsets: CFBF header (0, 13, 30), first
      // sector / FAT territory (512, 4096), mid-file (51200), tail (76800,
      // 102399 = last byte). Re-runs always exercise identical mutants.
      const FLIP_OFFSETS = [0, 13, 30, 512, 4096, 51_200, 76_800, 102_399];

      for (const off of FLIP_OFFSETS) {
        const mutated = src.slice();
        mutated[off] ^= 0xff;
        // Contract: never a throw — every mutant yields ok:true or a typed error.
        const out = await mod.convertPub(mutated);
        if (!out.ok) {
          expect(["parse-failed", "timeout", "resource-limit"]).toContain(out.error);
        } else {
          expect(typeof out.trace).toBe("string");
        }
      }
      expect(await jailLeftovers(tmp)).toEqual([]);
    },
    55_000
  );

  it(
    "all four real corpus files convert live with no error",
    async () => {
      const tmp = await freshScratch("live-corpus-");
      process.env.TMPDIR = tmp;
      const mod = await freshImport();
      expect(await mod.fixtureModeActive()).toBe(false);

      for (const name of CORPUS) {
        const bytes = new Uint8Array(await readFile(join(CORPUS_DIR, name)));
        const out = await mod.convertPub(bytes);
        expect(out, `${name} should convert live`).toMatchObject({ ok: true, mode: "live" });
      }
      expect(await jailLeftovers(tmp)).toEqual([]);
    },
    55_000
  );
});
