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
    expect(response.headers.get("location")).toBe("http://0.0.0.0:8080/photo");
    const token = response.cookies.get(ACCESS_COOKIE);
    expect(token).toBeDefined();
    expect(await verifyAccessToken(PASSWORD, token?.value, Date.now())).toBe(true);
    expect(token?.httpOnly).toBe(true);
  });

  it("redirects to the host the visitor used, not the one it is bound to", async () => {
    process.env.STP_ACCESS_PASSWORD = PASSWORD;

    // submit() posts to the container's own bind address — what the server
    // sees behind a proxy. Building the Location from that sent the deployed
    // POC's visitors to http://0.0.0.0:8080 after a correct password
    // (2026-09-09); the forwarded headers are where the visitor really is.
    const proxied = { host: "store-tools.example", "x-forwarded-proto": "https" };

    for (const [next, expected] of [
      ["/", "https://store-tools.example/"],
      ["/photo", "https://store-tools.example/photo"],
      ["/?tab=import", "https://store-tools.example/?tab=import"],
    ]) {
      const response = await POST(submit({ password: PASSWORD, next }, proxied));
      expect(response.headers.get("location")).toBe(expected);
      expect(response.headers.get("location")).not.toContain("0.0.0.0");
    }
  });

  it("sends a wrong password back to the gate, flagged, with no cookie", async () => {
    process.env.STP_ACCESS_PASSWORD = PASSWORD;

    const response = await POST(submit({ password: "nope", next: "/photo" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://0.0.0.0:8080/launcher?error=1&next=%2Fphoto",
    );
    expect(response.cookies.get(ACCESS_COOKIE)).toBeUndefined();
  });

  it("refuses an off-origin ?next=, landing on / instead", async () => {
    process.env.STP_ACCESS_PASSWORD = PASSWORD;

    const response = await POST(submit({ password: PASSWORD, next: "//evil.example" }));

    expect(response.headers.get("location")).toBe("http://0.0.0.0:8080/");
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
    expect(response.headers.get("location")).toBe("http://0.0.0.0:8080/layout");
    expect(response.cookies.get(ACCESS_COOKIE)).toBeUndefined();
  });
});
