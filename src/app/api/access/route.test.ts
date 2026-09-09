import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access/token";
import { POST } from "./route";

const PASSWORD = "hunter2";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

/** The gate's form POST, as a browser sends it. */
function submit(fields: Record<string, string>, headers?: HeadersInit): NextRequest {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  return new NextRequest("http://0.0.0.0:8080/api/access", { method: "POST", body, headers });
}

describe("POST /api/access", () => {
  it("mints a cookie for the right password and honours ?next=", async () => {
    process.env.STP_ACCESS_PASSWORD = PASSWORD;

    const response = await POST(submit({ password: PASSWORD, next: "/photo" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/photo");
    const token = response.cookies.get(ACCESS_COOKIE);
    expect(token).toBeDefined();
    expect(await verifyAccessToken(PASSWORD, token?.value, Date.now())).toBe(true);
    expect(token?.httpOnly).toBe(true);
  });

  it("redirects to a path, never to the host it is bound to", async () => {
    process.env.STP_ACCESS_PASSWORD = PASSWORD;

    // The request URL here is the container's own bind address, which is what
    // the server sees behind a proxy. Building an absolute Location from it
    // sent the deployed POC's visitors to http://0.0.0.0:8080 (2026-09-09);
    // a relative one is resolved against the host the client asked for.
    for (const next of ["/", "/photo", "/?tab=import"]) {
      const location = (await POST(submit({ password: PASSWORD, next }))).headers.get("location");
      expect(location).toBe(next);
      expect(location).not.toContain("0.0.0.0");
    }
  });

  it("sends a wrong password back to the gate, flagged, with no cookie", async () => {
    process.env.STP_ACCESS_PASSWORD = PASSWORD;

    const response = await POST(submit({ password: "nope", next: "/photo" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/launcher?error=1&next=%2Fphoto");
    expect(response.cookies.get(ACCESS_COOKIE)).toBeUndefined();
  });

  it("refuses an off-origin ?next=, landing on / instead", async () => {
    process.env.STP_ACCESS_PASSWORD = PASSWORD;

    const response = await POST(submit({ password: PASSWORD, next: "//evil.example" }));

    expect(response.headers.get("location")).toBe("/");
  });

  it("marks the cookie Secure only when the proxy says the visitor is on HTTPS", async () => {
    process.env.STP_ACCESS_PASSWORD = PASSWORD;

    const plain = await POST(submit({ password: PASSWORD, next: "/" }));
    const forwarded = await POST(
      submit({ password: PASSWORD, next: "/" }, { "x-forwarded-proto": "https" }),
    );

    // TLS terminates at the load balancer, so the app's own request is HTTP;
    // Secure on a plain-HTTP round trip would drop the cookie entirely.
    expect(plain.cookies.get(ACCESS_COOKIE)?.secure).toBe(false);
    expect(forwarded.cookies.get(ACCESS_COOKIE)?.secure).toBe(true);
  });

  it("passes straight through when no password is configured", async () => {
    delete process.env.STP_ACCESS_PASSWORD;

    const response = await POST(submit({ password: "", next: "/layout" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/layout");
    expect(response.cookies.get(ACCESS_COOKIE)).toBeUndefined();
  });
});
