/**
 * Deployment-facing configuration for the shared-password gate, plus the two
 * pure decisions the gate needs (which paths stay open, where a post-login
 * redirect may point). Kept free of `next/headers` and `node:*` so
 * `src/middleware.ts` can import it on the edge runtime.
 *
 * See docs/DEPLOY_CLOUD_RUN_PLAN.md for how the deploy supplies these.
 */

/**
 * The gate's password, or `undefined` when the deployment didn't set one —
 * in which case the app serves openly. That's deliberate: `npm run dev`,
 * the Playwright suite, and the CI image smoke all run without a password,
 * and every one of them would otherwise need a login step.
 */
export function accessPassword(): string | undefined {
  const value = process.env.STP_ACCESS_PASSWORD;
  return value ? value : undefined;
}

/**
 * Absolute URL of the deployed publisher prototype — the launcher's second
 * card. Unset (dev, or before the prototype's first deploy) hides the card
 * rather than shipping a dead link.
 */
export function prototypeUrl(): string | undefined {
  const raw = process.env.STP_PROTOTYPE_URL?.trim();
  if (!raw) return undefined;

  // A bare host — `publisher-prototype-….a.run.app`, which is how a deploy
  // variable usually gets pasted — is a RELATIVE href in HTML, so the card
  // would point back into this app and go nowhere (observed 2026-09-09).
  // Assume https for a schemeless value, and drop anything that doesn't end
  // up an http(s) URL rather than rendering a dead card.
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The origin the visitor actually used, from the proxy's own headers.
 *
 * Redirects have to name an absolute URL (Next's middleware runtime rejects a
 * relative `Location`), and the server can't see where the visitor knocked:
 * behind Cloud Run its own origin is the bind address, so building from it
 * sent people to `http://0.0.0.0:8080` (observed 2026-09-09). Cloud Run passes
 * the caller's `Host` through and terminates TLS, hence `x-forwarded-proto`.
 *
 * `fallback` (the request's own URL) covers a direct hit with no Host header.
 * Trusting these headers is the standard posture behind a proxy that sets
 * them; the worst a forged `Host` does here is redirect its own sender.
 */
export function externalOrigin(headers: Headers, fallback: URL): string {
  // Both headers can be a comma-separated chain; the first entry is the client.
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  if (!host) return fallback.origin;

  const forwardedProto = (headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  return `${forwardedProto || fallback.protocol.replace(":", "")}://${host}`;
}

/**
 * Paths the gate never blocks: the gate page itself, the endpoint that
 * checks the password, and the brand fonts that page renders in.
 */
const OPEN_PATHS = ["/launcher", "/api/access", "/fonts"];

export function isOpenPath(pathname: string): boolean {
  return OPEN_PATHS.some((open) => pathname === open || pathname.startsWith(`${open}/`));
}

/**
 * Where to send a visitor after a correct password. Only a same-origin
 * absolute path is honoured — a `?next=` of `//evil.example` or
 * `https://evil.example` is an open-redirect, and `/\evil` is the same trick
 * through a backslash some clients normalise.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  // A backslash anywhere: clients differ on whether they normalise it to a
  // slash, so `/\evil.example` can become scheme-relative downstream.
  if (value.includes("\\")) return "/";
  // No whitespace or control characters — same reasoning, different vector.
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return "/";
  return value;
}
