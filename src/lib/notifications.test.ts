import { describe, it, expect } from "vitest";
import { decorateNotification, notificationDestination } from "./notifications";
import { seedNotifications } from "@/data";

const byId = (id: string) => {
  const n = seedNotifications.find((n) => n.id === id);
  if (!n) throw new Error(`notification ${id} missing`);
  return n;
};

describe("decorateNotification", () => {
  it("tints the icon bubble by kind", () => {
    expect(decorateNotification(byId("n1")).iconBg).toBe("#FBEBEB"); // shipped
    expect(decorateNotification(byId("n3")).iconBg).toBe("#eef4fb"); // status
    expect(decorateNotification(byId("n4")).iconBg).toBe("#eef7ef"); // backed
  });

  it("labels the action by kind", () => {
    expect(decorateNotification(byId("n1")).action).toBe("See what shipped →");
    expect(decorateNotification(byId("n3")).action).toBe("View on the board →");
    expect(decorateNotification(byId("n4")).action).toBe("View on the board →");
  });
});

describe("notificationDestination", () => {
  it("shipped + celebrations on → celebrate moment", () => {
    expect(notificationDestination(byId("n1"), true)).toEqual({
      type: "celebrate",
      itemId: 11,
      release: "v1.4",
    });
  });

  it("shipped + celebrations off → straight to the release note", () => {
    expect(notificationDestination(byId("n1"), false)).toEqual({ type: "releases" });
  });

  it("status/backed without a release → the item on the board", () => {
    expect(notificationDestination(byId("n3"), true)).toEqual({ type: "board", itemId: 2 });
    expect(notificationDestination(byId("n4"), true)).toEqual({ type: "board", itemId: 2 });
  });
});
