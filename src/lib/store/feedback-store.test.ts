import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useFeedbackStore } from "./feedback-store";

beforeEach(() => {
  useFeedbackStore.setState(useFeedbackStore.getInitialState(), true);
});

const getItem = (id: number) => {
  const item = useFeedbackStore.getState().items.find((i) => i.id === id);
  if (!item) throw new Error(`item ${id} missing`);
  return item;
};

describe("upvote", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("toggles: +1 and votedByMe on first tap, -1 and off on second", () => {
    const before = getItem(1);
    expect(before.votedByMe).toBe(false);

    useFeedbackStore.getState().upvote(1);
    expect(getItem(1).votes).toBe(before.votes + 1);
    expect(getItem(1).votedByMe).toBe(true);

    useFeedbackStore.getState().upvote(1);
    expect(getItem(1).votes).toBe(before.votes);
    expect(getItem(1).votedByMe).toBe(false);
  });

  it("marks the item as backed in the store's district and region on vote", () => {
    // Item 7 starts outside both tiers.
    expect(getItem(7).inDistrict).toBe(false);
    expect(getItem(7).inRegion).toBe(false);

    useFeedbackStore.getState().upvote(7);
    expect(getItem(7).inDistrict).toBe(true);
    expect(getItem(7).inRegion).toBe(true);

    // Removing the vote does not retract tier backing (prototype behavior).
    useFeedbackStore.getState().upvote(7);
    expect(getItem(7).inDistrict).toBe(true);
    expect(getItem(7).inRegion).toBe(true);
  });

  it("pulses justVotedId for 650ms", () => {
    vi.useFakeTimers();
    useFeedbackStore.getState().upvote(1);
    expect(useFeedbackStore.getState().justVotedId).toBe(1);
    vi.advanceTimersByTime(650);
    expect(useFeedbackStore.getState().justVotedId).toBe(null);
  });
});

describe("submitReport", () => {
  it("files a bug with the full prototype shape and unshifts it", () => {
    const s = useFeedbackStore.getState();
    s.openReport();
    s.chooseType("bug");
    s.setReportTitle("Stapler jams every time");
    s.setReportDesc("It broke mid-order.");
    s.setReportName("Sam");
    useFeedbackStore.getState().submitReport();

    const st = useFeedbackStore.getState();
    const item = st.items[0];
    expect(item).toMatchObject({
      id: 100,
      type: "bug",
      title: "Stapler jams every time",
      desc: "It broke mid-order.",
      area: "Design editor",
      status: "new",
      votes: 1,
      districts: 1,
      mine: true,
      votedByMe: true,
      followed: true,
      inDistrict: true,
      inRegion: true,
      comments: [],
    });
    expect(item.reports).toEqual([
      { store: "#1284", when: "just now", name: "Sam", text: "It broke mid-order." },
    ]);
    expect(st.reportStep).toBe("confirm");
    expect(st.newItemId).toBe(100);
    expect(st.nextId).toBe(101);
  });

  it("defaults title/desc/name when left blank", () => {
    const s = useFeedbackStore.getState();
    s.openReport();
    s.chooseType("feature");
    useFeedbackStore.getState().submitReport();

    const item = useFeedbackStore.getState().items[0];
    expect(item.title).toBe("Feature idea");
    expect(item.desc).toBe("An idea to make the tool better.");
    // Anonymous by default — attributed to the store only.
    expect(item.reports[0].name).toBe(null);
    expect(item.reports[0].text).toBe("Feature idea");
  });
});

describe("upvoteFromSimilar", () => {
  it("backs the existing item, moves to the upvoted step, and highlights it", () => {
    const before = getItem(1).votes;
    const s = useFeedbackStore.getState();
    s.openReport();
    s.chooseType("bug");
    useFeedbackStore.getState().upvoteFromSimilar(1);

    const st = useFeedbackStore.getState();
    expect(getItem(1).votes).toBe(before + 1);
    expect(getItem(1).votedByMe).toBe(true);
    expect(st.reportStep).toBe("upvoted");
    expect(st.upvotedId).toBe(1);
    expect(st.highlightId).toBe(1);
    // No duplicate item was created.
    expect(st.items.length).toBe(useFeedbackStore.getInitialState().items.length);
  });
});

describe("report flow state", () => {
  it("openReport resets the form and dismisses the coachmark", () => {
    useFeedbackStore.setState({ reportTitle: "left over", coachOpen: true });
    useFeedbackStore.getState().openReport();
    const st = useFeedbackStore.getState();
    expect(st.reportOpen).toBe(true);
    expect(st.reportStep).toBe("choose");
    expect(st.reportTitle).toBe("");
    expect(st.attachFile).toBe(true);
    expect(st.coachOpen).toBe(false);
  });

  it("backToChoose clears the draft", () => {
    const s = useFeedbackStore.getState();
    s.openReport();
    s.chooseType("bug");
    s.setReportTitle("half-typed");
    useFeedbackStore.getState().backToChoose();
    expect(useFeedbackStore.getState().reportStep).toBe("choose");
    expect(useFeedbackStore.getState().reportTitle).toBe("");
  });
});
