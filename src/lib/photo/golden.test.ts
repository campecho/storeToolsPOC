import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { imageDimensions, sniffImageMime } from "@/lib/import/image-meta";
import { RenderPayloadSchema } from "@/lib/schema/photo";
import { compileRenderPlan, renderImage } from "./render-host";

/**
 * The GOLDEN-RECIPE HARNESS (plan §4 PE3, §5) — the export spine's drift gate.
 * Committed recipes under fixtures/photo-corpus/recipes/ are replayed through the
 * REAL render path (render-host.renderImage → photo-worker.mjs → sharp) and the
 * output bytes are asserted EQUAL to the committed golden, byte-for-byte. A
 * regression anywhere in the compile-or-render chain — or an encoder move —
 * surfaces here as a diff, and `npm run refresh:photo-goldens` regenerates them.
 *
 * Three layers per recipe, mirroring the PARITY-BY-SHARED-CODE seam (§1.3):
 *   (a) COMPILE PARITY — compileRenderPlan(payload.recipe, demoDims) must
 *       deep-equal the recipe's COMMITTED `compiled` block. That committed block
 *       is what the plain-JS refresh script feeds the worker (it can't import the
 *       TS compiler); this assertion is what keeps the two from silently
 *       diverging — change the compiler and this fails until the recipe is
 *       regenerated.
 *   (b) GOLDEN — renderImage(master, payload) bytes === the committed golden.
 *   (c) DETERMINISM (the PE3 done-when) — two independent renders are
 *       byte-identical (folded into (b): both renders equal the golden AND each
 *       other, reusing the same buffers).
 *
 * `sharp` ships with `npm install`, so there is NO fixture-free mode — the render
 * is always live. The suite only SKIPS (never fails) when the committed fixtures
 * are absent: the integrator generates them with `npm run refresh:photo-goldens`
 * and commits the result.
 */

const ROOT = process.cwd();
const RECIPES_DIR = join(ROOT, "fixtures", "photo-corpus", "recipes");
const GOLDENS_DIR = join(ROOT, "fixtures", "photo-corpus", "goldens");
const MASTER_PATH = join(ROOT, "public", "photo-demo.jpg");
const EXT: Record<string, string> = { jpeg: "jpg", png: "png" };

const haveFixtures = existsSync(RECIPES_DIR) && existsSync(MASTER_PATH);
const recipeFiles = haveFixtures
  ? readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".json")).sort()
  : [];

// The master's SOURCE dims by the SAME cheap header read renderImage does, so
// the compile-parity assertion compiles against exactly what the host will.
const master = haveFixtures ? readFileSync(MASTER_PATH) : Buffer.alloc(0);
const demoDims = haveFixtures ? imageDimensions(master, sniffImageMime(master) ?? "") : undefined;

if (!haveFixtures || recipeFiles.length === 0 || !demoDims) {
  describe("golden-recipe harness", () => {
    it.skip("photo-corpus fixtures missing — run `npm run refresh:photo-goldens` to generate them", () => {});
  });
} else {
  for (const file of recipeFiles) {
    const name = file.replace(/\.json$/, "");
    const raw = JSON.parse(readFileSync(join(RECIPES_DIR, file), "utf8")) as {
      source: string;
      payload: unknown;
      compiled: { steps: unknown[]; out: { w: number; h: number } };
    };
    // The client is untrusted (§3.6): validate the payload exactly as the route
    // does before it reaches the compiler — this also fills schema defaults.
    const payload = RenderPayloadSchema.parse(raw.payload);
    const goldenPath = join(GOLDENS_DIR, `${name}.${EXT[payload.format]}`);
    const goldenExists = existsSync(goldenPath);

    describe(`golden: ${name}`, () => {
      it("compiles to the recipe's committed plan (compile parity)", () => {
        const plan = compileRenderPlan(payload.recipe, { w: demoDims.width, h: demoDims.height });
        expect(plan).toEqual(raw.compiled);
      });

      const golden = it.skipIf(!goldenExists);
      golden(
        "renders byte-identical to the committed golden across two runs (drift gate + determinism)",
        async () => {
          const expected = readFileSync(goldenPath);
          const a = await renderImage(master, payload);
          const b = await renderImage(master, payload);
          expect(a.ok).toBe(true);
          expect(b.ok).toBe(true);
          if (!a.ok || !b.ok) return;
          // (b) exact-match against the committed golden — the gate's teeth.
          expect(a.bytes.equals(expected)).toBe(true);
          // (c) determinism — the two independent renders agree byte-for-byte.
          expect(a.bytes.equals(b.bytes)).toBe(true);
        },
        45_000,
      );
    });
  }
}
