import { describe, expect, it } from "vitest";
import { sniffPub } from "./sniff";

const CFBF = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function bytes(...parts: (number[] | number)[]): Uint8Array {
  const flat = parts.flatMap((p) => (typeof p === "number" ? Array(p).fill(0) : p));
  return new Uint8Array(flat);
}

describe("sniffPub (plan §10.1 — content, never extension)", () => {
  it("accepts an OLE2 container with the Publisher 2002+ marker", () => {
    expect(sniffPub(bytes(CFBF, 504, [0xe8, 0xac, 0x2c, 0x00], 60))).toEqual({ kind: "pub" });
  });

  it("accepts the Publisher 2000 marker", () => {
    expect(sniffPub(bytes(CFBF, 504, [0xe8, 0xac, 0x22, 0x00]))).toEqual({ kind: "pub" });
  });

  it("rejects OLE2 without a Publisher marker (a .doc is not a .pub)", () => {
    expect(sniffPub(bytes(CFBF, 1024))).toEqual({ kind: "ole2-other" });
  });

  it("recognizes the v1 flat blob", () => {
    expect(sniffPub(bytes([0xe7, 0xac, 0x2c, 0x00], 64))).toEqual({ kind: "pub-v1" });
  });

  it("recognizes CAB (.puz) by MSCF magic", () => {
    expect(sniffPub(bytes([0x4d, 0x53, 0x43, 0x46], 64))).toEqual({ kind: "puz" });
  });

  it("rejects arbitrary bytes and renamed files", () => {
    expect(sniffPub(new TextEncoder().encode("%PDF-1.7 not a pub"))).toEqual({ kind: "unknown" });
    expect(sniffPub(new Uint8Array(0))).toEqual({ kind: "unknown" });
  });

  it("marker in file body is found across sector boundaries", () => {
    const buf = bytes(CFBF, 8000, [0xe8, 0xac, 0x2c, 0x00], 100);
    expect(sniffPub(buf)).toEqual({ kind: "pub" });
  });
});

// P5 adversarial edges: signature-scan boundary conditions an attacker (or a
// truncating proxy) actually produces. Positions are the whole game here —
// magics must bind to offset 0 and the marker scan must reach the final byte.
describe("sniffPub — adversarial edges (P5)", () => {
  const MARKER = [0xe8, 0xac, 0x2c, 0x00];
  const MSCF = [0x4d, 0x53, 0x43, 0x46];

  it("truncated CFBF magic (7 of 8 bytes) is unknown, not a partial match", () => {
    expect(sniffPub(bytes(CFBF.slice(0, 7)))).toEqual({ kind: "unknown" });
  });

  it("finds a marker occupying exactly the last 4 bytes (scan reaches the tail)", () => {
    expect(sniffPub(bytes(CFBF, 500, MARKER))).toEqual({ kind: "pub" });
  });

  it("zero-byte input is unknown", () => {
    expect(sniffPub(new Uint8Array(0))).toEqual({ kind: "unknown" });
  });

  it("CFBF magic at a nonzero offset must NOT match, even with a marker present", () => {
    expect(sniffPub(bytes(1, CFBF, 100, MARKER, 20))).toEqual({ kind: "unknown" });
  });

  it("CAB magic as the final 4 bytes must NOT match (MSCF binds to offset 0)", () => {
    expect(sniffPub(bytes(100, MSCF))).toEqual({ kind: "unknown" });
  });

  it("scans a multi-megabyte container without blowing the time budget", () => {
    // Worst case for the flat scan is a big CFBF file with the marker at the
    // very end (full scan, hit) or absent (full scan, miss). 4 MiB is the
    // shape of a real mid-size .pub.
    const big = new Uint8Array(4 * 1024 * 1024);
    big.set(CFBF, 0);
    const t0 = performance.now();
    expect(sniffPub(big)).toEqual({ kind: "ole2-other" }); // full-miss scan
    big.set(MARKER, big.length - 4);
    expect(sniffPub(big)).toEqual({ kind: "pub" }); // full-hit at the last byte
    expect(performance.now() - t0).toBeLessThan(2_000);
  });
});
