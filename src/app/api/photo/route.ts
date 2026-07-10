import { NextResponse } from "next/server";
import { heicAvailable } from "@/lib/photo/heic";
import { probeEngine, rlimitsEnforced } from "@/lib/photo/render-host";
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
  const [engine, rlimits, heic] = await Promise.all([
    probeEngine(),
    rlimitsEnforced(),
    heicAvailable(),
  ]);

  // The core raster codecs ride sharp/libvips: present iff the engine probed.
  // SVG rasterizes through the same engine (librsvg). HEIC needs heif-convert
  // (separate probe). BMP is never decoded server-side (v1.4 — prebuilt sharp
  // ships no BMP codec; BMP opens client-side).
  const hasEngine = engine !== null;
  const diagnostics: PhotoDiagnostics = {
    engine,
    jailed: { rlimits },
    // tificc (lcms2-utils) probe lands with the PE5 server stream — until the
    // seam exists, CMYK preservation is honestly absent everywhere.
    cmykPreserve: false,
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
