import { describe, expect, it } from "vitest";
import { createAccessToken, timingSafeEquals, verifyAccessToken } from "./token";

const SECRET = "correct horse battery staple";
const NOW = 1_760_000_000_000;
const LATER = NOW + 60_000;

describe("timingSafeEquals", () => {
  it("matches identical strings and rejects everything else", () => {
    expect(timingSafeEquals("hunter2", "hunter2")).toBe(true);
    expect(timingSafeEquals("hunter2", "hunter3")).toBe(false);
    // Length mismatch: no prefix credit for getting the first chars right.
    expect(timingSafeEquals("hunter2", "hunter")).toBe(false);
    expect(timingSafeEquals("", "")).toBe(true);
  });
});

describe("access tokens", () => {
  it("verifies a token it just minted, until it expires", async () => {
    const token = await createAccessToken(SECRET, LATER);

    expect(await verifyAccessToken(SECRET, token, NOW)).toBe(true);
    // Exactly at the expiry, and past it, the session is over.
    expect(await verifyAccessToken(SECRET, token, LATER)).toBe(false);
    expect(await verifyAccessToken(SECRET, token, LATER + 1)).toBe(false);
  });

  it("rejects a token minted under a different password", async () => {
    const token = await createAccessToken(SECRET, LATER);

    // Rotating the password is the revocation mechanism (docs §deploy).
    expect(await verifyAccessToken("rotated password", token, NOW)).toBe(false);
  });

  it("rejects a tampered signature and a tampered expiry", async () => {
    const token = await createAccessToken(SECRET, LATER);
    const [expiry, signature] = token.split(".");

    expect(await verifyAccessToken(SECRET, `${expiry}.${signature.slice(0, -1)}x`, NOW)).toBe(false);
    // Pushing the expiry out doesn't help: it is signed, not just carried.
    expect(await verifyAccessToken(SECRET, `${LATER + 60_000}.${signature}`, NOW)).toBe(false);
  });

  it("rejects malformed cookie values without throwing", async () => {
    for (const token of [
      undefined,
      "",
      ".",
      "nosignature",
      `${LATER}`,
      `.${await createAccessToken(SECRET, LATER)}`,
      `not-a-number.${(await createAccessToken(SECRET, LATER)).split(".")[1]}`,
      ` ${LATER}.${(await createAccessToken(SECRET, LATER)).split(".")[1]}`,
    ]) {
      expect(await verifyAccessToken(SECRET, token, NOW)).toBe(false);
    }
  });
});
