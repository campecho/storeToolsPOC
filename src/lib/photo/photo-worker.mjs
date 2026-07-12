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
 *                      | { kind: "erase",  steps, rect, maskFile, limits }
 *   <jail>/input.bin   = the raw upload bytes (intake) OR master bytes (render/erase)
 *   <jail>/overlay-<id>.png = a pre-rendered overlay raster the host wrote for a
 *                      render `composite` step (PE6) — decoded+resized in-jail
 *   <jail>/erase-<id>.png = a stored-explicit erase patch (PE9), a PRIOR erase
 *                      op's fill — composited during render/erase step replay
 *   <jail>/mask.png    = the brushed grayscale-on-black mask for an erase job (PE9)
 *   <jail>/master.bin  = working-master image bytes   (intake success)
 *   <jail>/proxy.bin   = screen-proxy image bytes      (intake success)
 *   <jail>/output.bin  = encoded export bytes          (render success)
 *   <jail>/patch.bin   = the erase patch PNG for mask.rect            (erase success)
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
const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

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

/**
 * Replay host-compiled steps to a lossless-PNG intermediate buffer — the DUMB
 * half of the render seam (plan §3.3), shared by the render encode and the PE9
 * erase fill: both need the effective image at the END of a step chain. Decodes
 * the master ONCE under the pixel cap (the flood defence, classified
 * too-many-pixels if it trips), then materializes a PNG per step — sharp can't
 * chain arbitrary op sequences, and a PNG round-trip is self-describing and
 * avoids compounding JPEG loss across the chain, deterministic by construction
 * (plan §4 PE3). Fine at 12 MP.
 */
async function replaySteps(sharp, input, steps, limitInputPixels) {
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
    } else if (step.kind === "extend") {
      // Grow the canvas (bleedExpand / fitToSize-fit). extendWith maps the
      // host's strategy: mirror → libvips 'mirror' (reflect the border),
      // smear → libvips 'copy' (replicate the edge pixel outward — the
      // documented smear↔copy mapping), solid → 'background' with the
      // host-supplied colour (default white). Edge sizes are host-validated
      // ints; re-clamped defensively.
      const top = Math.max(0, Math.round(step.top));
      const bottom = Math.max(0, Math.round(step.bottom));
      const left = Math.max(0, Math.round(step.left));
      const right = Math.max(0, Math.round(step.right));
      const extendWith =
        step.strategy === "mirror" ? "mirror" : step.strategy === "smear" ? "copy" : "background";
      const extendOpts = { top, bottom, left, right, extendWith };
      if (extendWith === "background") extendOpts.background = step.color || "#ffffff";
      buf = await sharp(buf).extend(extendOpts).png().toBuffer();
    } else if (step.kind === "resize") {
      // Stored-explicit resolved dims → a fill resize (aspect was resolved
      // host-side by geometry.ts/fit.ts; the worker just hits the target).
      const w = Math.max(1, Math.round(step.width));
      const h = Math.max(1, Math.round(step.height));
      buf = await sharp(buf).resize(w, h, { fit: "fill" }).png().toBuffer();
    } else if (step.kind === "adjust") {
      // The ONE pointwise tone/colour pass. This block is DUPLICATED FROM
      // ops.ts `applyAdjust` BY CONTRACT — this plain-JS worker cannot import
      // the TS parity core, so the loop is copied byte-for-byte and
      // parity.test.ts is the guard that the two stay identical (a byte drift
      // there is a red test, not a broken export). Model (adjust-math.ts):
      // LUT-FIRST then MATRIX, alpha untouched, single Math.round + clamp
      // 0..255 per channel.
      //
      // Materialize the current image to raw RGBA (ensureAlpha so alpha always
      // exists and rides through untouched), transform in place, re-wrap as a
      // 4-channel raw buffer for the next step / final encode.
      const { data, info } = await sharp(buf)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const lutR = step.lutR;
      const lutG = step.lutG;
      const lutB = step.lutB;
      const len = data.length - (data.length % 4);
      if (step.identityMatrix) {
        // Tone/temperature only — three table lookups per pixel.
        for (let i = 0; i < len; i += 4) {
          data[i] = lutR[data[i]];
          data[i + 1] = lutG[data[i + 1]];
          data[i + 2] = lutB[data[i + 2]];
          // data[i + 3] — alpha — untouched.
        }
      } else {
        const m = step.matrix;
        const m0 = m[0], m1 = m[1], m2 = m[2];
        const m3 = m[3], m4 = m[4], m5 = m[5];
        const m6 = m[6], m7 = m[7], m8 = m[8];
        for (let i = 0; i < len; i += 4) {
          // LUT first…
          const r = lutR[data[i]];
          const g = lutG[data[i + 1]];
          const b = lutB[data[i + 2]];
          // …then the saturation matrix, rounded + clamped once per channel.
          data[i] = clampByte(Math.round(m0 * r + m1 * g + m2 * b));
          data[i + 1] = clampByte(Math.round(m3 * r + m4 * g + m5 * b));
          data[i + 2] = clampByte(Math.round(m6 * r + m7 * g + m8 * b));
          // data[i + 3] — alpha — untouched.
        }
      }
      buf = await sharp(data, {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
        .png()
        .toBuffer();
    } else if (step.kind === "composite") {
      // Placed raster: an overlay (PE6) OR a stored-explicit erase patch (PE9).
      // The PNG the HOST wrote into the jail (step.file is a jail-local basename
      // — `overlay-<id>.png` or `erase-<id>.png` — never a host path) is decoded
      // under the pixel cap, alpha-ensured, and RESIZED to the host-declared
      // width×height (fit fill). That decode+resize IS the sanitize/re-encode of
      // an UNTRUSTED client raster (§3.6): a hostile or oversized raster dies
      // HERE, in this throwaway jail — and a decode failure surfaces as
      // decode-failed via the catch below (classifyDecodeError). It is composited
      // at (left, top) OVER the current image. An overlay is placed art ABOVE the
      // adjusted photo (its composite is appended after the terminal adjust); an
      // erase patch is photo content composited INLINE at its recipe position
      // (before the adjust), so tone applies over it — matching the client
      // preview. JPEG/TIFF/CMYK flatten alpha into the image at the final encode;
      // PNG keeps it.
      const w = Math.max(1, Math.round(step.width));
      const h = Math.max(1, Math.round(step.height));
      const left = Math.round(step.left);
      const top = Math.round(step.top);
      const overlayBytes = await readFile(p(step.file));
      const overlay = await sharp(overlayBytes, { limitInputPixels })
        .ensureAlpha()
        .resize(w, h, { fit: "fill" })
        .png()
        .toBuffer();
      buf = await sharp(buf)
        .composite([{ input: overlay, left, top }])
        .png()
        .toBuffer();
    } else {
      // The host compiled these, so an unknown kind is our bug, not the file's.
      throw new Error(`unknown render step: ${String(step?.kind)}`);
    }
  }

  return buf;
}

async function render(sharp, job) {
  const input = await readFile(p("input.bin"));
  const steps = Array.isArray(job.steps) ? job.steps : [];
  const format = job.format === "png" ? "png" : job.format === "tiff" ? "tiff" : "jpeg";
  const quality = Number.isInteger(job.quality) ? clampN(job.quality, 1, 100) : 90;
  const limitInputPixels = job.limits?.maxPixels ?? 80_000_000;
  // Colour intent for the terminal colour pass (PE5). CMYK needs a jail-local
  // ICC profile the HOST copied in (job.iccProfile is a basename inside the jail,
  // never a host path) — absent → honest sRGB fallback.
  const intent = job.intent === "cmyk" ? "cmyk" : "srgb";
  const iccProfile = typeof job.iccProfile === "string" ? p(job.iccProfile) : null;
  const notes = [];

  try {
    const buf = await replaySteps(sharp, input, steps, limitInputPixels);

    // Final encode + the TERMINAL colour pass (PE5). Metadata is stripped by
    // default (CDR — no withMetadata()). Keyed on (format, intent):
    //   • png            → ALWAYS sRGB. PNG has no CMYK representation, so a cmyk
    //                      intent DOWNGRADES to sRGB and is noted (the route
    //                      surfaces X-Photo-Intent-Downgraded). withIccProfile
    //                      tags the sRGB profile.
    //   • jpeg/tiff cmyk → toColourspace('cmyk') + withIccProfile(<jail GRACoL>):
    //                      4-channel CMYK separated through the committed profile,
    //                      byte-identical embed (v1.4 spike). Needs the jail-local
    //                      profile; without one, honest sRGB fallback.
    //   • jpeg/tiff srgb → withIccProfile('srgb') tag.
    // TIFF ships LZW (lossless) — a sane print default; `quality` only bites the
    // JPEG encoder.
    const finalMeta = await sharp(buf).metadata();
    const wantsCmyk = intent === "cmyk" && iccProfile !== null && format !== "png";
    let encoded;
    let mime;
    let space;

    if (format === "png") {
      if (intent === "cmyk") notes.push("PNG has no CMYK — exported as sRGB");
      encoded = await sharp(buf).withIccProfile("srgb").png().toBuffer({ resolveWithObject: true });
      mime = "image/png";
      space = "srgb";
    } else {
      // jpeg or tiff. Flatten alpha when the container can't carry it (jpeg) or a
      // CMYK separation would otherwise choke on a 4th channel.
      let pipe = sharp(buf);
      const mustFlatten = Boolean(finalMeta.hasAlpha) && (format === "jpeg" || wantsCmyk);
      if (mustFlatten) {
        if (format === "jpeg") notes.push("Transparency flattened onto white for JPEG");
        pipe = pipe.flatten({ background: "#ffffff" });
      }
      if (wantsCmyk) {
        pipe = pipe.toColourspace("cmyk").withIccProfile(iccProfile);
        space = "cmyk";
      } else {
        pipe = pipe.withIccProfile("srgb");
        space = "srgb";
      }
      if (format === "tiff") {
        encoded = await pipe.tiff({ quality, compression: "lzw" }).toBuffer({ resolveWithObject: true });
        mime = "image/tiff";
      } else {
        // mozjpeg buffers the ENTIRE image for its optimized-scan search, and a
        // 13+ MP CMYK frame blows the RLIMIT_AS ceiling ("VipsJpeg: Insufficient
        // memory (case 4)") — the PE5 e2e sweep's finding. Baseline libjpeg
        // streams, so CMYK encodes drop mozjpeg; sRGB keeps it (smaller files,
        // half the channel volume). No golden carries a CMYK JPEG, so bytes of
        // committed fixtures are unaffected.
        encoded = await pipe
          .jpeg({ quality, mozjpeg: !wantsCmyk })
          .toBuffer({ resolveWithObject: true });
        mime = "image/jpeg";
      }
    }

    await writeFile(p("output.bin"), encoded.data);
    await writeResult({
      ok: true,
      mime,
      space,
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

/* ------------------------------------------------------------------ */
/* Erase — the classical fill (patch-from-surround + soft-mask blend)   */
/* ------------------------------------------------------------------ */

/**
 * The deterministic classical fill (PE9's honest stand-in, plan §4 PE9) — the ONE
 * piece of new pixel code. Given a raw RGBA window `img` (`w`×`h`) and a
 * single-channel mask window `mask` (same dims, 0..255 LUMINANCE per the
 * ErasePayloadSchema mask contract), it reconstructs the masked region from its
 * surroundings and feathers the seam by the soft mask value. Mutates `img` in
 * place. All math is integer/float with a FIXED visitation order — no Math.random
 * (determinism is a repo invariant; the same inputs yield byte-identical patches,
 * the stored-explicit contract's teeth). The model service swaps this fill behind
 * the SAME erase-op contract (STUBS.md).
 *
 * Algorithm (contract, not narration):
 *  1. BASE — patch-from-surround by onion-peel diffusion. A pixel is UNKNOWN when
 *     mask ≥ HARD; the outer ring of the (client-padded) rect is known. Each pass
 *     fills every unknown pixel adjacent to a KNOWN one with the mean of its known
 *     8-neighbours, then promotes them to known — a deterministic inward peel (a
 *     pass reads only pixels known BEFORE it, so within-pass order can't matter).
 *     The window edge is a wall (outside is never sampled), which the padding
 *     makes moot; a pass cap + mean-of-known fallback guards an all-masked window.
 *  2. SMOOTH — a few 3×3 box-blur passes over FILLED pixels only, each reading a
 *     per-pass snapshot (order-independent), so the diffusion doesn't band.
 *  3. BLEND — over the ORIGINAL by the soft factor a = mask/255:
 *     out = orig·(1−a) + fill·a. Brush feathering (0<mask<255) becomes the seam;
 *     a=0 pixels stay byte-identical to the source. Alpha rides through untouched.
 */
function classicalFill(img, mask, w, h) {
  const HARD = 128; // mask ≥ HARD ⇒ reconstruct from surround (the binary base set)
  const SMOOTH_PASSES = 2;
  const N = w * h;

  // Reconstructed RGB starts from the original; unknown pixels get overwritten.
  const fillR = new Float64Array(N);
  const fillG = new Float64Array(N);
  const fillB = new Float64Array(N);
  const known = new Uint8Array(N); // 1 = value trusted (original or already filled)
  const wasUnknown = new Uint8Array(N); // the pixels the base actually reconstructs
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    fillR[i] = img[o];
    fillG[i] = img[o + 1];
    fillB[i] = img[o + 2];
    const u = mask[i] >= HARD ? 1 : 0;
    wasUnknown[i] = u;
    known[i] = u ? 0 : 1;
  }

  // (1) Onion-peel diffusion. Pass count is bounded: a padded region fills in a
  // few rings; w+h+1 covers the worst geometry.
  let remaining = 0;
  for (let i = 0; i < N; i++) if (!known[i]) remaining++;
  const maxPasses = w + h + 1;
  for (let pass = 0; pass < maxPasses && remaining > 0; pass++) {
    // Frontier = unknown pixels with ≥1 known 8-neighbour; compute all their new
    // values from the CURRENT known set, then commit + promote together.
    const frontier = [];
    const newR = [];
    const newG = [];
    const newB = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (known[i]) continue;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (!known[j]) continue;
            sr += fillR[j];
            sg += fillG[j];
            sb += fillB[j];
            n++;
          }
        }
        if (n === 0) continue; // no known neighbour yet — a later ring reaches it
        frontier.push(i);
        newR.push(sr / n);
        newG.push(sg / n);
        newB.push(sb / n);
      }
    }
    if (frontier.length === 0) break; // trapped (all-masked) — the fallback fills it
    for (let k = 0; k < frontier.length; k++) {
      const i = frontier[k];
      fillR[i] = newR[k];
      fillG[i] = newG[k];
      fillB[i] = newB[k];
      known[i] = 1;
      remaining--;
    }
  }

  // Fallback for any still-unknown pixel (pathological, e.g. every pixel masked):
  // the mean of the originally-known pixels — deterministic, never a random seed.
  if (remaining > 0) {
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (wasUnknown[i]) continue;
      sr += fillR[i];
      sg += fillG[i];
      sb += fillB[i];
      n++;
    }
    const mr = n ? sr / n : 0;
    const mg = n ? sg / n : 0;
    const mb = n ? sb / n : 0;
    for (let i = 0; i < N; i++) {
      if (known[i]) continue;
      fillR[i] = mr;
      fillG[i] = mg;
      fillB[i] = mb;
      known[i] = 1;
    }
  }

  // (2) Smooth FILLED pixels only, reading a per-pass snapshot so the box blur is
  // order-independent (deterministic). 3×3 including self.
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const snapR = Float64Array.from(fillR);
    const snapG = Float64Array.from(fillG);
    const snapB = Float64Array.from(fillB);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!wasUnknown[i]) continue;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            sr += snapR[j];
            sg += snapG[j];
            sb += snapB[j];
            n++;
          }
        }
        fillR[i] = sr / n;
        fillG[i] = sg / n;
        fillB[i] = sb / n;
      }
    }
  }

  // (3) Soft-mask blend back into img (RGB only; alpha rides through untouched).
  for (let i = 0; i < N; i++) {
    const a = mask[i] / 255;
    if (a <= 0) continue; // keep — byte-identical to the source
    const o = i * 4;
    img[o] = clampByte(Math.round(img[o] * (1 - a) + fillR[i] * a));
    img[o + 1] = clampByte(Math.round(img[o + 1] * (1 - a) + fillG[i] * a));
    img[o + 2] = clampByte(Math.round(img[o + 2] * (1 - a) + fillB[i] * a));
  }
}

/**
 * Erase job (PE9): replay the geometry + prior-erase slice to the effective image
 * the brush was drawn on (no encode), decode+resize the brushed mask to those
 * dims and read ONE greyscale channel (flattening any hostile alpha onto black
 * first — the mask contract), then run classicalFill on the rect window and
 * encode that window as the stored-explicit patch PNG. Scoped to the window for
 * perf (the rect is client-padded around the strokes). Outcome typed to
 * result.json; a decode/encode death is the file's fault (classifyDecodeError).
 */
async function erase(sharp, job) {
  const input = await readFile(p("input.bin"));
  const steps = Array.isArray(job.steps) ? job.steps : [];
  const limitInputPixels = job.limits?.maxPixels ?? 80_000_000;
  const maskFile = typeof job.maskFile === "string" ? job.maskFile : "mask.png";
  const rect = job.rect ?? {};

  try {
    const buf = await replaySteps(sharp, input, steps, limitInputPixels);

    // Effective dims (read from info — never assumed).
    const meta = await sharp(buf).metadata();
    const effW = meta.width ?? 0;
    const effH = meta.height ?? 0;

    // Clamp the rect into the effective image — defence in depth (the host
    // validated it, but the worker never trusts a coordinate blindly).
    const rx = clampN(Math.round(rect.x ?? 0), 0, Math.max(0, effW - 1));
    const ry = clampN(Math.round(rect.y ?? 0), 0, Math.max(0, effH - 1));
    const rw = clampN(Math.round(rect.w ?? 0), 1, effW - rx);
    const rh = clampN(Math.round(rect.h ?? 0), 1, effH - ry);

    // The rect window of the effective image, raw RGBA.
    const win = await sharp(buf)
      .ensureAlpha()
      .extract({ left: rx, top: ry, width: rw, height: rh })
      .raw()
      .toBuffer();

    // The brushed mask, resized to the effective dims (fit fill), any alpha
    // flattened onto BLACK so a transparent-white hostile upload can't read as
    // full-remove, then ONE greyscale channel — cropped to the same window.
    const maskBytes = await readFile(p(maskFile));
    const maskWin = await sharp(maskBytes, { limitInputPixels })
      .resize(effW, effH, { fit: "fill" })
      .flatten({ background: "#000000" })
      .greyscale()
      .extract({ left: rx, top: ry, width: rw, height: rh })
      .raw()
      .toBuffer();

    // The deterministic fill, mutating the window raw buffer in place.
    classicalFill(win, maskWin, rw, rh);

    const patch = await sharp(win, { raw: { width: rw, height: rh, channels: 4 } })
      .png()
      .toBuffer({ resolveWithObject: true });

    await writeFile(p("patch.bin"), patch.data);
    await writeResult({ ok: true, width: patch.info.width, height: patch.info.height });
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
  if (job.kind === "render") {
    await render(sharp, job);
    return;
  }
  if (job.kind === "erase") {
    await erase(sharp, job);
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
