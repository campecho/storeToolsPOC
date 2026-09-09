/**
 * Shared-password access gate — token minting and checking.
 *
 * The deployed POC sits behind one static password (`STP_ACCESS_PASSWORD`,
 * injected by the deploy — docs/DEPLOY_CLOUD_RUN_PLAN.md). Getting it right
 * once at `/launcher` mints the short-lived cookie every other route checks,
 * so the password itself never rides along on later requests.
 *
 * Web Crypto only (no `node:crypto`): this module is imported by
 * `src/middleware.ts`, which runs on the edge runtime.
 */

const ENCODER = new TextEncoder();

/** Domain separator — a signature minted here can't be replayed elsewhere. */
const PURPOSE = "stp-access.v1";

/** Cookie the gate sets; read by the middleware on every request. */
export const ACCESS_COOKIE = "stp_access";

/** A demo session lasts a working day, then the password is asked again. */
export const ACCESS_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Length-then-XOR comparison: the result doesn't depend on *where* two
 * equal-length strings first differ, so a caller can't walk a secret out of
 * the timing. Used for both the signature and the password itself.
 */
export function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, ENCODER.encode(message));
  return base64url(new Uint8Array(mac));
}

/**
 * Mint a cookie value that proves the password was entered, valid until
 * `expiresAt` (epoch ms). The password is the signing key, so rotating it
 * invalidates every outstanding session for free.
 */
export async function createAccessToken(secret: string, expiresAt: number): Promise<string> {
  return `${expiresAt}.${await sign(secret, `${PURPOSE}:${expiresAt}`)}`;
}

/** True when `token` was minted by `secret` and hasn't expired at `now`. */
export async function verifyAccessToken(
  secret: string,
  token: string | undefined,
  now: number,
): Promise<boolean> {
  if (!token) return false;
  const separator = token.indexOf(".");
  if (separator <= 0) return false;

  const expiresAt = Number(token.slice(0, separator));
  // Number("") is 0 and Number(" 1") is 1 — demand digits, nothing else.
  if (!/^\d+$/.test(token.slice(0, separator)) || expiresAt <= now) return false;

  return timingSafeEquals(token.slice(separator + 1), await sign(secret, `${PURPOSE}:${expiresAt}`));
}
