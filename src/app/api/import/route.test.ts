import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_PUB_BYTES } from "@/lib/import/limits";
import { GET, POST } from "./route";

/**
 * Adversarial proof for the /api/import surface (plan §10.1, P5): every
 * hostile upload dies at the right gate with the right status and copy, and
 * nothing but a genuine .pub reaches conversion. Next 15 route handlers are
 * plain functions over the platform Request/Response, so the attacks are
 * constructed natively (Node 22 File/FormData/Request) — no server, no HTTP.
 *
 * No test here spawns a subprocess: every rejection fires before convertPub,
 * and the happy path forces fixture mode (STP_IMPORT_FIXTURE is read
 * per-call), so the file is deterministic with no binaries installed.
 */

const CFBF_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const PUB_MARKER = [0xe8, 0xac, 0x2c, 0x00];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Bytes that sniff as a genuine Publisher publication. */
function pubBytes(): Uint8Array {
  const b = new Uint8Array(560);
  b.set(CFBF_MAGIC, 0);
  b.set(PUB_MARKER, 512);
  return b;
}

/** PNG-looking bytes — a real image signature, nothing Publisher about it. */
function pngBytes(): Uint8Array {
  const b = new Uint8Array(128);
  b.set(PNG_MAGIC, 0);
  return b;
}

function postUpload(bytes: Uint8Array, filename: string): Promise<Response> {
  const fd = new FormData();
  // Fresh copy: the ArrayLike constructor pins Uint8Array<ArrayBuffer>, which
  // BlobPart requires (a plain Uint8Array may sit on a SharedArrayBuffer).
  fd.append("file", new File([new Uint8Array(bytes)], filename));
  return POST(new Request("http://test/api/import", { method: "POST", body: fd }));
}

// --- minimal stored-CAB builder (adapted from cab.test.ts's in-test builder;
// --- that file is frozen, so the pattern is duplicated, not imported) -------
const u16 = (n: number): Buffer => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};

/** Valid single-folder, single-block STORED cabinet wrapping one file. */
function storedCab(name: string, data: Uint8Array): Uint8Array {
  const nameZ = Buffer.concat([Buffer.from(name, "ascii"), Buffer.from([0])]);
  const fileEntry = Buffer.concat([u32(data.length), u32(0), u16(0), u16(0), u16(0), u16(0), nameZ]);
  const dataSec = Buffer.concat([u32(0), u16(data.length), u16(data.length), Buffer.from(data)]);
  const coffFiles = 36 + 8; // CFHEADER + one CFFOLDER
  const coffCabStart = coffFiles + fileEntry.length;
  const header = Buffer.concat([
    Buffer.from("MSCF"),
    u32(0), // reserved1
    u32(coffCabStart + dataSec.length), // cbCabinet
    u32(0), // reserved2
    u32(coffFiles),
    u32(0), // reserved3
    Buffer.from([3, 1]), // versionMinor, versionMajor
    u16(1), // cFolders
    u16(1), // cFiles
    u16(0), // flags
    u16(0), // setID
    u16(0), // iCabinet
  ]);
  const folder = Buffer.concat([u32(coffCabStart), u16(1), u16(0)]);
  return new Uint8Array(Buffer.concat([header, folder, fileEntry, dataSec]));
}

const savedFixture = process.env.STP_IMPORT_FIXTURE;
beforeEach(() => {
  delete process.env.STP_IMPORT_FIXTURE;
});
afterEach(() => {
  if (savedFixture === undefined) delete process.env.STP_IMPORT_FIXTURE;
  else process.env.STP_IMPORT_FIXTURE = savedFixture;
});

describe("POST /api/import — request-shape gates (400)", () => {
  it("rejects a non-multipart body", async () => {
    const res = await POST(
      new Request("http://test/api/import", {
        method: "POST",
        body: JSON.stringify({ file: "nope" }),
        headers: { "content-type": "application/json" },
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "bad-request" });
  });

  it("rejects multipart with no 'file' field", async () => {
    const fd = new FormData();
    fd.append("note", "hello");
    const res = await POST(new Request("http://test/api/import", { method: "POST", body: fd }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "bad-request" });
  });
});

describe("POST /api/import — size cap (413)", () => {
  it("rejects a file one byte over MAX_PUB_BYTES before sniffing it", async () => {
    const res = await postUpload(new Uint8Array(MAX_PUB_BYTES + 1), "big.pub");
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "too-large" });
    expect(body.message).toContain("25 MB");
  });
});

describe("POST /api/import — content sniff owns the gate (422)", () => {
  it("rejects a CFBF container with no Publisher marker (a '.doc' in disguise)", async () => {
    const doc = new Uint8Array(1024);
    doc.set(CFBF_MAGIC, 0);
    const res = await postUpload(doc, "report.pub");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "not-publisher" });
    expect(body.message).toContain("Office container");
  });

  it("rejects junk bytes", async () => {
    const res = await postUpload(new TextEncoder().encode("%PDF-1.7 definitely not a pub"), "junk.pub");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, error: "not-publisher" });
  });

  it("rejects a zero-byte file", async () => {
    const res = await postUpload(new Uint8Array(0), "empty.pub");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, error: "not-publisher" });
  });

  it("rejects PNG bytes named evil.pub — the extension lies, the bytes don't", async () => {
    const res = await postUpload(pngBytes(), "evil.pub");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, error: "not-publisher" });
  });
});

describe("POST /api/import — .puz inner-file re-sniff (422)", () => {
  it("rejects a valid CAB whose inner file is a PNG named inner.pub", async () => {
    // The archive is structurally perfect and the archived NAME claims .pub —
    // only the re-sniff of the EXTRACTED bytes catches the lie.
    const res = await postUpload(storedCab("inner.pub", pngBytes()), "package.puz");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: "puz-not-publisher" });
    expect(body.message).toContain("aren't a Publisher");
  });
});

describe("POST /api/import — happy path (fixture mode)", () => {
  it("converts a genuine .pub under STP_IMPORT_FIXTURE=1 and reports honestly", async () => {
    process.env.STP_IMPORT_FIXTURE = "1";
    const res = await postUpload(pubBytes(), "flyer.pub");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.doc).toBeTruthy();
    expect(Array.isArray(body.doc.pages)).toBe(true);
    expect(body.doc.pages.length).toBeGreaterThan(0);
    expect(body.report.mode).toBe("fixture");
    expect(body.report.source).toMatchObject({ filename: "flyer.pub", bytes: 560 });
    // The fixture note is the visible "this is not your file" honesty hook.
    expect(body.report.notes[0].message).toContain("Fixture mode");
  });

  it("a .puz wrapping a genuine .pub takes the identical conversion path", async () => {
    process.env.STP_IMPORT_FIXTURE = "1";
    const res = await postUpload(storedCab("publication.pub", pubBytes()), "packngo.puz");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.report.mode).toBe("fixture");
  });
});

describe("GET /api/import — diagnostic shape", () => {
  it("keeps the e2e-pinned fields and carries the new rlimits posture", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const diag = await res.json();
    expect(diag.mode === "fixture" || diag.mode === "live").toBe(true);
    expect(typeof diag.fixtureForced).toBe("boolean");
    expect(typeof diag.reason).toBe("string");
    // New in P5: the rlimit posture is always present — enforced (with the
    // limits) or an explicit reason why not. Never silent.
    expect(diag.rlimits).toBeTruthy();
    if (diag.rlimits.enforced) {
      expect(diag.rlimits.via).toBe("prlimit");
      expect(diag.rlimits.limits.cpuSeconds).toBeGreaterThan(0);
      expect(diag.rlimits.limits.asBytes).toBeGreaterThan(0);
    } else {
      expect(typeof diag.rlimits.reason).toBe("string");
    }
  });
});
