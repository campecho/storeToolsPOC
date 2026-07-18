import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RenderPayloadSchema } from "@/lib/schema/photo";
import { intakeImage, renderImage } from "./render-host";

/**
 * Perf budget gates (photo plan §4 PE10e, §5). PE4's client proxy-adjust budget
 * is gated in ops.test.ts (`applyAdjust` median < 250 ms); this file graduates
 * the other two PE0 dimensions — OPEN (jailed intake of the 12 MP demo) and
 * EXPORT (full-res replay of the geometry-chain recipe) — into CI-checked
 * assertions so a gross regression or a hang fails the `checks` lane.
 *
 * HONEST LIMIT (recorded in STUBS.md too): the ceilings are GENEROUS on purpose.
 * These spawn the real jail (node + sharp startup per call), so wall-clock is
 * dominated by process launch and varies widely with the runner. The gate catches
 * gross regressions and hangs, NOT fine drift; the median is printed each run so
 * the trend is visible, and the real fleet-hardware numbers land at the hardware-
 * lab pass. `scripts/bench-photo.mjs` reproduces these numbers on demand.
 */

const ROOT = process.cwd();
const DEMO = join(ROOT, "public", "photo-demo.jpg");
const GEOMETRY_CHAIN = join(ROOT, "fixtures", "photo-corpus", "recipes", "geometry-chain.json");

/** Median wall-clock (ms) of `runs` sequential calls — the ops.test.ts style. */
async function medianMs(runs: number, fn: () => Promise<unknown>): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

describe("perf budget — open (jailed intake of the 12 MP demo)", () => {
  it(
    "stays under the generous CI ceiling (median of 5 < 12 s)",
    async () => {
      const bytes = readFileSync(DEMO);
      const median = await medianMs(5, async () => {
        const out = await intakeImage(bytes, "image/jpeg");
        expect(out.ok).toBe(true);
      });
      console.info(`intake 12 MP demo median: ${median.toFixed(0)} ms`);
      // Generous: the jailed decode+orient+re-encode+proxy of a 4032×3024 JPEG,
      // process launch included. The dev-box spike put the sharp work at ≈0.4 s;
      // the ceiling leaves ample room for slow CI and only trips on a hang/gross
      // regression.
      expect(median).toBeLessThan(12_000);
    },
    90_000,
  );
});

describe("perf budget — export (full-res replay of the geometry-chain recipe)", () => {
  it(
    "stays under the generous CI ceiling (median of 5 < 15 s)",
    async () => {
      const master = readFileSync(DEMO);
      const raw = JSON.parse(readFileSync(GEOMETRY_CHAIN, "utf8")) as { payload: unknown };
      const payload = RenderPayloadSchema.parse(raw.payload);
      const median = await medianMs(5, async () => {
        const out = await renderImage(master, payload);
        expect(out.ok).toBe(true);
      });
      console.info(`render geometry-chain (12 MP) median: ${median.toFixed(0)} ms`);
      // Generous: full-res crop → rotate → straighten replay at 12 MP through the
      // jail. Same rationale as open — a hang/gross-regression gate, not fine drift.
      expect(median).toBeLessThan(15_000);
    },
    120_000,
  );
});
