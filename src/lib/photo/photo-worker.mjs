/**
 * Photo intake/probe worker (plan §3.6, §4 PE1) — the ONLY place `sharp`
 * (libvips) is loaded. It runs as a short-lived child process spawned by
 * render-host.ts, never in the web-server process: a hostile decoder that
 * segfaults, spins, or floods memory takes down this throwaway process inside
 * its scratch jail, not Next.js.
 *
 * Plain ESM JS on purpose — this file is executed directly by `node`, never
 * bundled (the bundler would try to trace `sharp`'s native `.node` binary into
 * the client graph). No TypeScript, no path aliases, no repo imports beyond
 * node built-ins and the dynamically-loaded engine.
 *
 * Protocol (render-host owns the other half):
 *   argv[2]            = jail dir
 *   <jail>/job.json    = { kind: "probe" } | { kind: "intake", mime, limits }
 *   <jail>/input.bin   = the raw upload bytes (intake only)
 *   <jail>/master.bin  = working-master image bytes   (intake success)
 *   <jail>/proxy.bin   = screen-proxy image bytes      (intake success)
 *   <jail>/result.json = the typed outcome (always written on a clean exit)
 *
 * Outcomes are TYPED and written to result.json; the process then exits 0 even
 * for a decode failure, so the host distinguishes an honest "this file won't
 * decode" (result.json present, ok:false) from a jail kill (no result.json +
 * a signal — timeout/resource-limit, classified host-side).
 */

import { readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";

const JAIL = process.argv[2];
const p = (name) => join(JAIL, name);

async function writeResult(obj) {
  await writeFile(p("result.json"), JSON.stringify(obj));
}

/** Map a caught engine error to a typed intake failure code. */
function classifyDecodeError(err) {
  const msg = String(err?.message ?? err ?? "");
  // sharp/libvips refuses an over-limit image at load, before allocation —
  // this is the pixel-flood defence, and it must read as too-many-pixels, not
  // a generic decode death.
  if (/exceeds pixel limit/i.test(msg)) return { error: "too-many-pixels", detail: msg };
  // Everything else — truncated bytes, corrupt headers, unsupported internal
  // codec, a polyglot that dies at transcode — is a decode failure.
  return { error: "decode-failed", detail: msg.slice(0, 500) };
}

async function intake(sharp, job) {
  const input = await readFile(p("input.bin"));
  const limits = job.limits ?? {};
  const limitInputPixels = limits.maxPixels ?? 80_000_000;
  const masterQuality = limits.masterJpegQuality ?? 95;
  const proxyQuality = limits.proxyJpegQuality ?? 85;
  const proxyMaxEdge = limits.proxyMaxEdge ?? 2048;
  const isSvg = job.mime === "image/svg+xml";

  const notes = [];
  let sharpOpts = { limitInputPixels };

  try {
    // SVG is a vector: pick a rasterization density that caps the bitmap's
    // long edge at ~4096 px (bounded — a `<svg width="1e6">` can't ask libvips
    // for a terabyte raster). librsvg's defaults already refuse external
    // <image href> and XXE entities; the pixel cap is the belt to that brace.
    if (isSvg) {
      const RASTER_CAP = 4096;
      const svgMeta = await sharp(input).metadata();
      const longEdge = Math.max(svgMeta.width ?? 0, svgMeta.height ?? 0) || 1;
      const density = longEdge > RASTER_CAP ? Math.max(1, Math.floor((72 * RASTER_CAP) / longEdge)) : 72;
      sharpOpts = { density, limitInputPixels };
    }

    // Header read (cheap, no full decode): EXIF orientation + source space +
    // alpha. metadata() does not enforce limitInputPixels — the flood dies at
    // the encode step below, classified as too-many-pixels there.
    const meta = await sharp(input, sharpOpts).metadata();
    const origOrientation = meta.orientation ?? 1;
    const orientationApplied = origOrientation > 1;
    // colorSpace drives the export-intent default (§3.4); it is reported from
    // the SOURCE even though the master is unpacked to screen RGB below.
    const colorSpace = meta.space === "cmyk" ? "cmyk" : "rgb";
    const hasAlpha = Boolean(meta.hasAlpha) || isSvg;

    // Base pipeline: auto-orient from EXIF (and reset the tag). Metadata is
    // stripped by default — we deliberately do NOT call withMetadata(): the
    // strip IS the CDR posture (§3.6), which is why the export "Strip photo
    // metadata" toggle is locked ON (dev #7).
    let base = sharp(input, sharpOpts).rotate();
    // CMYK arrivals unpack to screen RGB here — sharp force-unpacks CMYK on
    // decode (v1.4 known limitation); the CMYK-preserving master rides the
    // print tranche (PE5). We still report colorSpace "cmyk" above so the
    // export intent defaults correctly.
    if (colorSpace === "cmyk") base = base.toColourspace("srgb");

    // Working master: PNG when alpha must survive (or a rasterized vector),
    // else JPEG at the master quality. Vector → PNG keeps crisp edges.
    let master, masterMime;
    if (isSvg || hasAlpha) {
      master = await base.clone().png().toBuffer({ resolveWithObject: true });
      masterMime = "image/png";
    } else {
      master = await base.clone().jpeg({ quality: masterQuality }).toBuffer({ resolveWithObject: true });
      masterMime = "image/jpeg";
    }

    // Screen proxy: longest edge to PROXY_MAX_EDGE, never upscaled.
    const proxyPipe = base
      .clone()
      .resize({ width: proxyMaxEdge, height: proxyMaxEdge, fit: "inside", withoutEnlargement: true });
    let proxy, proxyMime;
    if (isSvg || hasAlpha) {
      proxy = await proxyPipe.png().toBuffer({ resolveWithObject: true });
      proxyMime = "image/png";
    } else {
      proxy = await proxyPipe.jpeg({ quality: proxyQuality }).toBuffer({ resolveWithObject: true });
      proxyMime = "image/jpeg";
    }

    await writeFile(p("master.bin"), master.data);
    await writeFile(p("proxy.bin"), proxy.data);

    // Honest notes (schema meta.notes). The metadata line is ALWAYS present
    // (CDR); orientation/CMYK/SVG lines are conditional.
    notes.push("Metadata removed when the file was opened");
    if (orientationApplied) notes.push("EXIF orientation applied");
    if (colorSpace === "cmyk")
      notes.push("Opened as screen RGB — CMYK-preserving master lands with the print tranche");
    if (isSvg) notes.push("Vector artwork rasterized to a bitmap when it was opened");

    await writeResult({
      ok: true,
      masterMime,
      width: master.info.width,
      height: master.info.height,
      proxyMime,
      proxyWidth: proxy.info.width,
      proxyHeight: proxy.info.height,
      colorSpace,
      notes,
    });
  } catch (err) {
    await writeResult({ ok: false, ...classifyDecodeError(err) });
  }
}

async function main() {
  const job = JSON.parse(await readFile(p("job.json"), "utf8"));

  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch (err) {
    // The engine itself can't load (missing native binary on this host). The
    // host maps this to an engine-error / null-engine diagnostic.
    await writeResult({ ok: false, error: "engine-error", detail: `sharp failed to load: ${err?.message ?? err}` });
    return;
  }

  // v1.4 spike: libvips' default concurrency ran the pipeline ~3× slower than
  // an explicit setting — pin it to the machine's parallelism.
  sharp.concurrency(availableParallelism?.() ?? 4);

  if (job.kind === "probe") {
    await writeResult({ ok: true, versions: sharp.versions });
    return;
  }
  if (job.kind === "intake") {
    await intake(sharp, job);
    return;
  }
  await writeResult({ ok: false, error: "engine-error", detail: `unknown job kind: ${String(job.kind)}` });
}

main().catch(async (err) => {
  // Last-ditch: an unexpected failure OUTSIDE the typed paths (e.g. job.json
  // unreadable). Try to leave a breadcrumb, then exit nonzero so the host
  // classifies it rather than hanging.
  try {
    await writeResult({ ok: false, error: "engine-error", detail: `worker crashed: ${err?.message ?? err}` });
  } catch {
    /* jail may be gone; the host's no-result-json path covers this */
  }
  process.exit(1);
});
