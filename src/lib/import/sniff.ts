/**
 * Content sniffing for the import endpoint (plan §10.1, POC-enforced):
 * identify by bytes, never by extension or client MIME. Signatures per
 * PUB_TO_IDML_RESEARCH.md Part 1:
 *   - CFBF/OLE2 container magic `D0 CF 11 E0 A1 B1 1A E1` at offset 0
 *   - `Contents`-stream markers `E8 AC 22 00` (Publisher 2000) /
 *     `E8 AC 2C 00` (2002–2019) somewhere in the container
 *   - `E7 AC 2C 00` at offset 0 — the rare v1 flat blob
 *   - `MSCF` at offset 0 — CAB, i.e. a `.puz` pack-and-go (handled in P4)
 */

export type SniffResult =
  | { kind: "pub" } // OLE2 container with a Publisher Contents marker
  | { kind: "pub-v1" } // Publisher 1.0 flat blob
  | { kind: "puz" } // CAB archive — recognized, unpacking lands in P4
  | { kind: "ole2-other" } // OLE2 but no Publisher marker (.doc/.xls/…)
  | { kind: "unknown" };

const CFBF_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const PUB_MARKERS = [
  [0xe8, 0xac, 0x22, 0x00], // v2 / Publisher 2000
  [0xe8, 0xac, 0x2c, 0x00], // Publisher 2002–2019
];
const PUB_V1_MAGIC = [0xe7, 0xac, 0x2c, 0x00];
const CAB_MAGIC = [0x4d, 0x53, 0x43, 0x46]; // "MSCF"

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  return sig.every((b, i) => bytes[i] === b);
}

function contains(bytes: Uint8Array, sig: number[]): boolean {
  outer: for (let i = 0; i <= bytes.length - sig.length; i++) {
    for (let j = 0; j < sig.length; j++) {
      if (bytes[i + j] !== sig[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function sniffPub(bytes: Uint8Array): SniffResult {
  if (startsWith(bytes, CAB_MAGIC)) return { kind: "puz" };
  if (startsWith(bytes, PUB_V1_MAGIC)) return { kind: "pub-v1" };
  if (startsWith(bytes, CFBF_MAGIC)) {
    // The Contents stream is sector-aligned inside the container, so a flat
    // scan finds its marker without walking the OLE2 directory — enough for
    // the accept/reject gate; libmspub does the real structural parse.
    return PUB_MARKERS.some((m) => contains(bytes, m)) ? { kind: "pub" } : { kind: "ole2-other" };
  }
  return { kind: "unknown" };
}
