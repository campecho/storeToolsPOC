import { NextResponse, type NextRequest } from "next/server";
import { accessPassword, externalOrigin, safeNextPath } from "@/lib/access/session";
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

  // The origin the visitor used — see externalOrigin: this server's own is the
  // container's bind address, which is nowhere from a browser.
  const origin = externalOrigin(request.headers, request.nextUrl);

  const password = accessPassword();
  if (!password) {
    // No gate configured (dev, e2e, image smoke): nothing to check.
    return seeOther(origin, next);
  }

  if (typeof submitted !== "string" || !timingSafeEquals(submitted, password)) {
    const query = new URLSearchParams({ error: "1" });
    if (next !== "/") query.set("next", next);
    return seeOther(origin, `/launcher?${query}`);
  }

  const expiresAt = Date.now() + ACCESS_TTL_MS;
  const response = seeOther(origin, next);
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

/** 303 so the browser follows a form POST with GET, on the visitor's origin. */
function seeOther(origin: string, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, origin), { status: 303 });
}
