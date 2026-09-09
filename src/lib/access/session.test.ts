import { afterEach, describe, expect, it } from "vitest";
import { accessPassword, isOpenPath, prototypeUrl, safeNextPath } from "./session";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("accessPassword / prototypeUrl", () => {
  it("reads the deploy's environment, treating empty as unset", () => {
    process.env.STP_ACCESS_PASSWORD = "hunter2";
    process.env.STP_PROTOTYPE_URL = "https://prototype.example";
    expect(accessPassword()).toBe("hunter2");
    expect(prototypeUrl()).toBe("https://prototype.example");

    // An empty variable is how a deploy unsets one — it must not gate the app
    // behind the empty string, nor render a card linking to nowhere.
    process.env.STP_ACCESS_PASSWORD = "";
    process.env.STP_PROTOTYPE_URL = "";
    expect(accessPassword()).toBeUndefined();
    expect(prototypeUrl()).toBeUndefined();

    delete process.env.STP_ACCESS_PASSWORD;
    delete process.env.STP_PROTOTYPE_URL;
    expect(accessPassword()).toBeUndefined();
    expect(prototypeUrl()).toBeUndefined();
  });
});

describe("isOpenPath", () => {
  it("opens the gate page, the gate endpoint and the fonts it needs", () => {
    expect(isOpenPath("/launcher")).toBe(true);
    expect(isOpenPath("/api/access")).toBe(true);
    expect(isOpenPath("/fonts/MotivaSans-Regular.woff2")).toBe(true);
  });

  it("keeps everything else — the app and its upload routes — closed", () => {
    for (const pathname of ["/", "/layout", "/photo", "/api/import", "/api/photo/intake"]) {
      expect(isOpenPath(pathname)).toBe(false);
    }
  });

  it("matches on path segments, not string prefixes", () => {
    // Otherwise `/launcher-secrets` or `/api/accessible` would ride in free.
    expect(isOpenPath("/launcher-secrets")).toBe(false);
    expect(isOpenPath("/api/accessible")).toBe(false);
    expect(isOpenPath("/fonts-private/x.woff2")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps a same-origin path, query string and all", () => {
    expect(safeNextPath("/photo")).toBe("/photo");
    expect(safeNextPath("/?tab=import")).toBe("/?tab=import");
  });

  it("falls back to / for anything missing or off-origin", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("photo")).toBe("/");
    // Open-redirect shapes: protocol-relative, absolute, and the backslash
    // variants clients normalise into them.
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("/photo\\..\\admin")).toBe("/");
    expect(safeNextPath("/ /evil.example")).toBe("/");
    expect(safeNextPath("/\nSet-Cookie: x=y")).toBe("/");
  });
});
