import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { ACCESS_COOKIE, createAccessToken } from "@/lib/access/token";
import { middleware } from "./middleware";

const PASSWORD = "hunter2";
const ORIGIN = "https://store-tools.example";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

function request(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${ACCESS_COOKIE}=${cookie}`);
  return new NextRequest(new URL(path, ORIGIN), { headers });
}

/** The header Next sets on a pass-through (`NextResponse.next()`). */
const isPassThrough = (response: Response) => response.headers.has("x-middleware-next");

describe("access middleware", () => {
  it("does nothing when the deployment sets no password", async () => {
    delete process.env.STP_ACCESS_PASSWORD;

    for (const path of ["/", "/photo", "/api/import"]) {
      expect(isPassThrough(await middleware(request(path)))).toBe(true);
    }
  });

  describe("with a password configured", () => {
    afterEach(() => {
      delete process.env.STP_ACCESS_PASSWORD;
    });

    const gated = (path: string, cookie?: string) => {
      process.env.STP_ACCESS_PASSWORD = PASSWORD;
      return middleware(request(path, cookie));
    };

    it("sends an unauthenticated browser to the gate, carrying where it was headed", async () => {
      const response = await gated("/photo?zoom=2");

      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location") ?? "");
      expect(location.pathname).toBe("/launcher");
      expect(location.searchParams.get("next")).toBe("/photo?zoom=2");
    });

    it("sends a bare visitor to the gate with nothing to carry", async () => {
      const location = new URL((await gated("/")).headers.get("location") ?? "");

      expect(location.pathname).toBe("/launcher");
      expect(location.searchParams.has("next")).toBe(false);
    });

    it("answers API callers with 401 rather than a redirect to HTML", async () => {
      // The upload/convert routes are the reason this gate exists (STUBS.md).
      const response = await gated("/api/import");

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ ok: false, error: "unauthorized" });
    });

    it("lets the gate itself, its endpoint and the brand fonts through", async () => {
      for (const path of ["/launcher", "/api/access", "/fonts/MotivaSans-Regular.woff2"]) {
        expect(isPassThrough(await gated(path))).toBe(true);
      }
    });

    it("lets a valid session cookie through, and stops an expired or foreign one", async () => {
      const now = Date.now();
      const valid = await createAccessToken(PASSWORD, now + 60_000);
      const expired = await createAccessToken(PASSWORD, now - 1);
      const foreign = await createAccessToken("some other password", now + 60_000);

      expect(isPassThrough(await gated("/photo", valid))).toBe(true);
      expect((await gated("/photo", expired)).status).toBe(307);
      expect((await gated("/photo", foreign)).status).toBe(307);
    });
  });
});
