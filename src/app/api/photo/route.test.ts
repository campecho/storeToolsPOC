import { describe, expect, it } from "vitest";
import { PhotoDiagnosticsSchema } from "@/lib/schema/photo";
import { GET } from "./route";

/**
 * GET /api/photo diagnostics (plan §3.5). The body must satisfy
 * PhotoDiagnosticsSchema exactly, and — since sharp ships with npm — the
 * engine and its core-codec matrix are live in this lane. BMP is always false
 * (client-decode path); HEIC tracks the heif-convert probe (typically absent
 * on a bare CI box, present in the Docker/live lane).
 */

describe("GET /api/photo", () => {
  it(
    "returns a schema-valid capability matrix with a live sharp engine",
    async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      const parse = PhotoDiagnosticsSchema.safeParse(body);
      expect(parse.success).toBe(true);
      if (!parse.success) return;

      const d = parse.data;
      // sharp installs with the package — engine present, core codecs true.
      expect(d.engine).not.toBeNull();
      expect(d.engine?.name).toBe("sharp");
      expect(d.formats.jpeg).toBe(true);
      expect(d.formats.png).toBe(true);
      expect(d.formats.tiff).toBe(true);
      expect(d.formats.svg).toBe(true);
      // BMP never decodes server-side; heic is a boolean either way.
      expect(d.formats.bmp).toBe(false);
      expect(typeof d.formats.heic).toBe("boolean");
      expect(typeof d.jailed.rlimits).toBe("boolean");
      // The worker file always resolves from the repo root (vitest cwd); the
      // false case is the standalone-misdeploy story the docker lane guards.
      expect(d.jailed.worker).toBe(true);
    },
    15_000,
  );
});
