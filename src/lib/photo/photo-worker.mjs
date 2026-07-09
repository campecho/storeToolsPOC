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
 *   <jail>/job.json    = { kind: "probe" }
 *                      | { kind: "intake", mime, limits }
 *                      | { kind: "render", steps, format, quality, limits }
 *   <jail>/input.bin   = the raw upload bytes (intake) OR master bytes (render)
 *   <jail>/master.bin  = working-master image bytes   (intake success)
 *   <jail>/proxy.bin   = screen-proxy image bytes      (intake success)
 *   <jail>/output.bin  = encoded export bytes          (render success)
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

/* ------------------------------------------------------------------ */
/* Render — execute the host-compiled steps (the dumb half of the seam) */
/* ------------------------------------------------------------------ */

const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * An SVG alpha mask sized to the crop window: a white shape on a transparent
 * ground, rasterized in-jail by librsvg. dest-in compositing keeps the image
 * only where the shape is opaque. Built from INTEGER dims (host-validated) —
 * no client string reaches this markup. Rounded radius = 8% of the short edge
 * (matches the client canvas); circle = the ellipse inscribed in the window.
 */
function shapeMaskSvg(shape, w, h) {
  if (shape === "circle") {
    return Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="#fff"/></svg>`,
    );
  }
  const r = Math.round(0.08 * Math.min(w, h));
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  );
}

async function render(sharp, job) {
  const input = await readFile(p("input.bin"));
  const steps = Array.isArray(job.steps) ? job.steps : [];
  const format = job.format === "png" ? "png" : "jpeg";
  const quality = Number.isInteger(job.quality) ? clampN(job.quality, 1, 100) : 90;
  const limitInputPixels = job.limits?.maxPixels ?? 80_000_000;
  const notes = [];

  try {
    // Decode the master ONCE (pixel cap enforced at load — the flood defence,
    // classified too-many-pixels if it trips). Intermediates ride as lossless
    // PNG between steps: sharp can't chain arbitrary op sequences, and a PNG
    // round-trip is self-describing and avoids compounding JPEG loss across the
    // chain — deterministic by construction (plan §4 PE3). Fine at 12 MP.
    let buf = await sharp(input, { limitInputPixels }).png().toBuffer();

    for (const step of steps) {
      if (step.kind === "extract") {
        const meta = await sharp(buf).metadata();
        const W = meta.width ?? 0;
        const H = meta.height ?? 0;
        // Clamp to the current buffer so a rounded rect never addresses OOB.
        const width = clampN(step.width, 1, W);
        const height = clampN(step.height, 1, H);
        const left = clampN(step.left, 0, W - width);
        const top = clampN(step.top, 0, H - height);
        let pipe = sharp(buf).extract({ left, top, width, height });
        if (step.shape === "rounded" || step.shape === "circle") {
          // Shaped crop → alpha mask; the output carries transparency.
          const mask = shapeMaskSvg(step.shape, width, height);
          pipe = pipe.ensureAlpha().composite([{ input: mask, blend: "dest-in" }]);
        }
        buf = await pipe.png().toBuffer();
      } else if (step.kind === "rotate") {
        const turns = ((step.turns % 4) + 4) % 4;
        if (turns !== 0) buf = await sharp(buf).rotate(turns * 90).png().toBuffer();
      } else if (step.kind === "flip") {
        // horizontal = left↔right mirror (flop); vertical = top↔bottom (flip).
        buf = await (step.axis === "horizontal" ? sharp(buf).flop() : sharp(buf).flip()).png().toBuffer();
      } else if (step.kind === "straighten") {
        const deg = Number(step.degrees) || 0;
        if (Math.abs(deg) >= 1e-9) {
          // Rotate about centre, growing to the rotated bounding box with a
          // transparent fill, then cover-scale by the host's straightenScale and
          // re-extract the CENTERED pre-op window. Offsets come from the ACTUAL
          // post-rotate dims (read from info — never assumed) and are clamped so
          // rounding can never push the extract out of bounds.
          const rot = await sharp(buf)
            .rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer({ resolveWithObject: true });
          const RW0 = rot.info.width;
          const RH0 = rot.info.height;
          const scaledW = Math.max(1, Math.round(RW0 * step.scale));
          const scaledH = Math.max(1, Math.round(RH0 * step.scale));
          const winW = clampN(step.width, 1, scaledW);
          const winH = clampN(step.height, 1, scaledH);
          const left = clampN(Math.round((scaledW - winW) / 2), 0, scaledW - winW);
          const top = clampN(Math.round((scaledH - winH) / 2), 0, scaledH - winH);
          buf = await sharp(rot.data)
            .resize(scaledW, scaledH, { fit: "fill" })
            .extract({ left, top, width: winW, height: winH })
            .png()
            .toBuffer();
        }
      } else {
        // The host compiled these, so an unknown kind is our bug, not the file's.
        throw new Error(`unknown render step: ${String(step?.kind)}`);
      }
    }

    // Final encode. Metadata is stripped by default (CDR — no withMetadata()).
    const finalMeta = await sharp(buf).metadata();
    let encoded;
    let mime;
    if (format === "png") {
      encoded = await sharp(buf).png().toBuffer({ resolveWithObject: true });
      mime = "image/png";
    } else {
      // JPEG has no alpha: flatten onto white (a no-op when already opaque) and
      // note it when transparency was actually present.
      if (finalMeta.hasAlpha) notes.push("Transparency flattened onto white for JPEG");
      encoded = await sharp(buf)
        .flatten({ background: "#ffffff" })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      mime = "image/jpeg";
    }

    await writeFile(p("output.bin"), encoded.data);
    await writeResult({
      ok: true,
      mime,
      width: encoded.info.width,
      height: encoded.info.height,
      notes,
    });
  } catch (err) {
    // A decode/encode death is the file's fault — typed, never a throw the host
    // has to reclassify. (classifyDecodeError surfaces too-many-pixels too.)
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
  if (job.kind === "render") {
    await render(sharp, job);
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
