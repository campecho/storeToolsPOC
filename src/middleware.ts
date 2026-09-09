import { NextResponse, type NextRequest } from "next/server";
import { accessPassword, externalOrigin, isOpenPath } from "@/lib/access/session";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access/token";

/**
 * Shared-password gate for the hosted POC (docs/DEPLOY_CLOUD_RUN_PLAN.md).
 *
 * The deployment is public — anyone with the URL reaches this middleware —
 * so the gate has to be the thing that closes it, not the launcher page's
 * markup: `/api/import` and `/api/photo` run native converters on uploaded
 * files (STUBS.md, plan §10.1) and must be behind the same check as the UI.
 *
 * No `STP_ACCESS_PASSWORD` in the environment means no gate at all, which is
 * how dev, e2e and the CI image smoke run.
 */
export async function middleware(request: NextRequest) {
  const password = accessPassword();
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isOpenPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (await verifyAccessToken(password, token, Date.now())) return NextResponse.next();

  // API callers get a status they can act on; browsers get the gate page,
  // carrying where they were headed so the password lands them there.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "This deployment is password-protected." },
      { status: 401 },
    );
  }

  // Built on the origin the VISITOR used, not this server's: `nextUrl` here is
  // the container's bind address, so redirecting to it lands on
  // `http://0.0.0.0:8080` (observed on the deployed POC, 2026-09-09). The
  // runtime rejects a relative `Location`, so the origin has to come from the
  // proxy's headers.
  const carried =
    pathname === "/"
      ? ""
      : `?${new URLSearchParams({ next: `${pathname}${request.nextUrl.search}` })}`;
  const gate = new URL(`/launcher${carried}`, externalOrigin(request.headers, request.nextUrl));
  return NextResponse.redirect(gate, 307);
}

export const config = {
  // Everything except Next's own build output and the favicon: `/fonts` and
  // the gate's own routes are allowed through in the body above, where the
  // list is testable (isOpenPath).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
