import { NextResponse, type NextRequest } from "next/server";
import { accessPassword, safeNextPath } from "@/lib/access/session";
import {
  ACCESS_COOKIE,
  ACCESS_TTL_MS,
  createAccessToken,
  timingSafeEquals,
} from "@/lib/access/token";

/**
 * POST /api/access — the shared-password gate's one endpoint
 * (docs/DEPLOY_CLOUD_RUN_PLAN.md). Takes the `/launcher` form's fields, and
 * on a match sets the session cookie `src/middleware.ts` checks.
 *
 * A plain form POST, not a fetch: the gate stands in front of the app, so it
 * must work before any of the app's JavaScript has loaded.
 */

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const submitted = form.get("password");
  const requestedNext = form.get("next");
  const next = safeNextPath(typeof requestedNext === "string" ? requestedNext : null);

  const password = accessPassword();
  if (!password) {
    // No gate configured (dev, e2e, image smoke): nothing to check.
    return seeOther(next);
  }

  if (typeof submitted !== "string" || !timingSafeEquals(submitted, password)) {
    const query = new URLSearchParams({ error: "1" });
    if (next !== "/") query.set("next", next);
    return seeOther(`/launcher?${query}`);
  }

  const expiresAt = Date.now() + ACCESS_TTL_MS;
  const response = seeOther(next);
  response.cookies.set({
    name: ACCESS_COOKIE,
    value: await createAccessToken(password, expiresAt),
    httpOnly: true,
    sameSite: "lax",
    // TLS terminates at the load balancer, so the app's own request is plain
    // HTTP — the forwarded scheme is what says whether Secure is honourable.
    secure: request.headers.get("x-forwarded-proto") === "https",
    path: "/",
    expires: new Date(expiresAt),
  });
  return response;
}

/**
 * 303 (so the browser follows a form POST with GET) to a path on this host.
 *
 * A RELATIVE `Location`, resolved by the client against the URL it asked for.
 * `NextResponse.redirect()` demands an absolute URL, and the only origin the
 * server can see is its own bind address — behind a proxy that is
 * `http://0.0.0.0:8080`, which is where this gate used to send people after a
 * correct password (observed on the deployed POC, 2026-09-09).
 */
function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}
