import { NextResponse } from "next/server";
import { MAX_PUB_BYTES } from "@/lib/import/limits";
import { mapToLayoutDocument } from "@/lib/import/mapper";
import { buildModel } from "@/lib/import/model";
import { avScanHook, convertPub, importDiagnostics } from "@/lib/import/pub2raw";
import type { ImportReport } from "@/lib/import/report";
import { sniffPub } from "@/lib/import/sniff";
import { parseTrace } from "@/lib/import/trace-parser";

/**
 * POST /api/import — the `.pub` on-ramp (plan §10.2, P1). The POC's first
 * server endpoint: multipart upload → content-sniff → size cap → AV hook →
 * pub2raw (or fixture trace) → trace parser → mapper → `{ doc, report }`.
 *
 * CONTRACT: the response's `doc` is a schema-valid v1 `LayoutDocument` and
 * `report` matches `ImportReportSchema` — the swappable-backend interface any
 * production conversion service implements against (plan §10.7).
 *
 * Exposure guard (plan §10.1): size cap + timeout here; this endpoint ships
 * behind the demo deployment and is never a public anonymous upload surface.
 */

export const runtime = "nodejs";

type Fail = { ok: false; error: string; message: string };
const fail = (status: number, error: string, message: string) =>
  NextResponse.json<Fail>({ ok: false, error, message }, { status });

/**
 * GET /api/import — diagnostic: is this server converting real files or
 * serving the demo fixture, and why? `curl <host>/api/import` answers the
 * "why am I seeing the GRAND OPENING flyer?" question directly.
 */
export async function GET() {
  return NextResponse.json(await importDiagnostics());
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad-request", "Expected a multipart form upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail(400, "bad-request", "Attach the .pub file as the 'file' field.");
  }
  if (file.size > MAX_PUB_BYTES) {
    return fail(413, "too-large", `File exceeds the ${Math.round(MAX_PUB_BYTES / 1024 / 1024)} MB import limit.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Content-sniff, never trust the extension (plan §10.1).
  const sniff = sniffPub(bytes);
  if (sniff.kind === "puz") {
    return fail(422, "puz-not-yet", "Pack-and-go (.puz) unpacking arrives in P4 — import the inner .pub for now.");
  }
  if (sniff.kind === "ole2-other") {
    return fail(422, "not-publisher", "That's an Office container, but not a Publisher publication.");
  }
  if (sniff.kind === "unknown") {
    return fail(422, "not-publisher", "That file doesn't look like a Publisher (.pub) publication.");
  }

  await avScanHook(file.name, bytes);

  const converted = await convertPub(bytes);
  if (!converted.ok) {
    return fail(
      422,
      converted.error,
      converted.error === "timeout"
        ? "Conversion timed out — the file may be damaged or too complex."
        : "Publisher parser couldn't read this file — it may be damaged or an unsupported version."
    );
  }

  const name = file.name.replace(/\.(pub|puz)$/i, "") || "Imported publication";
  const { doc, fidelity, fonts, notes } = mapToLayoutDocument(buildModel(parseTrace(converted.trace)), name);

  const report: ImportReport = {
    mode: converted.mode,
    source: { filename: file.name, bytes: file.size },
    fidelity,
    fonts,
    notes:
      converted.mode === "fixture"
        ? [
            {
              tier: 2,
              message:
                "Fixture mode: this is the canned demo publication, not your file's contents — live conversion runs where libmspub-tools is installed (the Docker image).",
            },
            ...notes,
          ]
        : notes,
    overset: [],
  };

  return NextResponse.json({ ok: true, doc, report });
}
