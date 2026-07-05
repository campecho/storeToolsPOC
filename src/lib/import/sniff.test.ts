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
