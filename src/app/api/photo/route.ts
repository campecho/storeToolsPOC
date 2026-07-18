import { NextResponse } from "next/server";
import { heicAvailable } from "@/lib/photo/heic";
import { tificcAvailable } from "@/lib/photo/lcms";
import { probeEngine, rlimitsEnforced, workerPresent } from "@/lib/photo/render-host";
import { PhotoDiagnosticsSchema, type PhotoDiagnostics } from "@/lib/schema/photo";

/**
 * GET /api/photo — capability diagnostics (plan §3.1, §3.5). Extends the
 * `GET /api/import` mode/rlimits pattern with a per-format matrix: which
 * decoders this server actually has. `curl <host>/api/photo` answers "why
 * can't this box open my HEIC?" directly.
 *
 * CONTRACT: the body is exactly `PhotoDiagnosticsSchema` (parsed before send —
 * a drifted shape fails loudly here, never as a broken client).
 */

export const runtime = "nodejs";

export async function GET() {
  const [engine, rlimits, worker, heic, cmykPreserve] = await Promise.all([
    probeEngine(),
    rlimitsEnforced(),
    workerPresent(),
    heicAvailable(),
    tificcAvailable(),
  ]);

  // The core raster codecs ride sharp/libvips: present iff the engine probed.
  // SVG rasterizes through the same engine (librsvg). HEIC needs heif-convert
  // (separate probe). BMP is never decoded server-side (v1.4 — prebuilt sharp
  // ships no BMP codec; BMP opens client-side).
  const hasEngine = engine !== null;
  const diagnostics: PhotoDiagnostics = {
    engine,
    jailed: { rlimits, worker },
    // The CMYK-preserving path is live iff the jailed `tificc` (lcms2-utils)
    // probes OK — a colour-path capability independent of the codecs (§1.3, PE5).
    // Absent here (dev container) → the no-re-separation path is honestly off.
    cmykPreserve,
    formats: {
      jpeg: hasEngine,
      png: hasEngine,
      webp: hasEngine,
      gif: hasEngine,
      tiff: hasEngine,
      heic,
      svg: hasEngine,
      bmp: false,
    },
  };

  return NextResponse.json(PhotoDiagnosticsSchema.parse(diagnostics));
}
