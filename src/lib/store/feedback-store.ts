import { create } from "zustand";
import type { FeedbackItem, ItemType, Release, AppNotification } from "@/schema";
import type { TypeFilter, StatusFilter, ScopeFilter } from "@/lib/board";
import { seedItems, seedReleases, seedNotifications } from "@/data";

/**
 * The tracker's state, ported from the handoff prototype's single Component class.
 * Names are kept aligned with the prototype so the .dc.html source stays a usable
 * reference. The prototype's `view` state is replaced by Next.js routes; navigation
 * happens in components, the store only owns data + overlay/UI state.
 *
 * In-memory only for now — localStorage persistence + demo reset land in Step 7.
 */

export type ReportStep = "choose" | "bug" | "feature" | "upvoted" | "confirm";

export interface CelebrateEntry {
  itemId: number;
  release: string | null;
}

export interface FeedbackState {
  // identity & recognition
  store: string;
  impact: number;

  // data
  items: FeedbackItem[];
  releases: Release[];
  notifications: AppNotification[];

  // report flow
  reportOpen: boolean;
  reportStep: ReportStep;
  reportTitle: string;
  reportDesc: string;
  reportName: string;
  attachFile: boolean;
  upvotedId: number | null;
  newItemId: number | null;
  nextId: number;

  // board / cross-surface UI
  highlightId: number | null;
  justVotedId: number | null;
  coachOpen: boolean;
  detailId: number | null;

  // board filters
  fType: TypeFilter;
  fStatus: StatusFilter;
  fScope: ScopeFilter;
  query: string;

  // notifications & celebrate moment
  notifOpen: boolean;
  /** Configurable tweak (prototype prop): off routes shipped notifications straight to the release note. */
  celebrations: boolean;
  celebrateOpen: boolean;
  celebrateQueue: CelebrateEntry[];
  celebrateIndex: number;
  /** Auto-play fires once per session, on the first board landing. */
  autoCelebrated: boolean;
  /** Set when a notification routes to the board with a detail open — skips the auto-play once. */
  suppressAutoCelebrate: boolean;

  // actions — report flow
  openReport: () => void;
  closeReport: () => void;
  chooseType: (type: ItemType) => void;
  backToChoose: () => void;
  setReportTitle: (v: string) => void;
  setReportDesc: (v: string) => void;
  setReportName: (v: string) => void;
  toggleAttach: () => void;
  /** Back an existing similar item instead of filing a duplicate. */
  upvoteFromSimilar: (id: number) => void;
  /** File the new item: unshift with status new, one vote, one preserved report. */
  submitReport: () => void;

  // actions — items
  upvote: (id: number) => void;
  toggleFollow: (id: number) => void;

  // actions — UI
  setHighlight: (id: number | null) => void;
  dismissCoach: () => void;
  openDetail: (id: number) => void;
  closeDetail: () => void;
  setTypeFilter: (v: TypeFilter) => void;
  setStatusFilter: (v: StatusFilter) => void;
  setScopeFilter: (v: ScopeFilter) => void;
  setQuery: (v: string) => void;

  // actions — notifications & celebrate
  toggleNotif: () => void;
  closeNotif: () => void;
  markRead: (id: string) => void;
  /** Route target for a notification that opens an item on the board. */
  goToNotifiedItem: (itemId: number) => void;
  /** First board landing per session: queue every shipped notification and celebrate. */
  maybeAutoCelebrate: () => void;
  openCelebrate: (queue: CelebrateEntry[]) => void;
  closeCelebrate: () => void;
  celebratePrev: () => void;
  celebrateNext: () => void;
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  store: "#1284",
  impact: 7,

  items: seedItems,
  releases: seedReleases,
  notifications: seedNotifications,

  reportOpen: false,
  reportStep: "choose",
  reportTitle: "",
  reportDesc: "",
  reportName: "",
  attachFile: true,
  upvotedId: null,
  newItemId: null,
  nextId: 100,

  highlightId: null,
  justVotedId: null,
  coachOpen: true,
  detailId: null,

  fType: "all",
  fStatus: "all",
  fScope: "all",
  query: "",

  notifOpen: false,
  celebrations: true,
  celebrateOpen: false,
  celebrateQueue: [],
  celebrateIndex: 0,
  autoCelebrated: false,
  suppressAutoCelebrate: false,

  openReport: () =>
    set({
      reportOpen: true,
      reportStep: "choose",
      reportTitle: "",
      reportDesc: "",
      reportName: "",
      attachFile: true,
      coachOpen: false,
      notifOpen: false,
    }),
  closeReport: () => set({ reportOpen: false }),
  chooseType: (type) => set({ reportStep: type }),
  backToChoose: () => set({ reportStep: "choose", reportTitle: "", reportDesc: "" }),
  setReportTitle: (v) => set({ reportTitle: v }),
  setReportDesc: (v) => set({ reportDesc: v }),
  setReportName: (v) => set({ reportName: v }),
  toggleAttach: () => set((s) => ({ attachFile: !s.attachFile })),

  upvoteFromSimilar: (id) => {
    get().upvote(id);
    set({ reportStep: "upvoted", upvotedId: id, highlightId: id });
  },

  submitReport: () => {
    const s = get();
    const type: ItemType = s.reportStep === "bug" ? "bug" : "feature";
    const id = s.nextId;
    const title =
      s.reportTitle.trim() || (type === "bug" ? "Reported problem" : "Feature idea");
    const item: FeedbackItem = {
      id,
      type,
      title,
      desc:
        s.reportDesc.trim() ||
        (type === "bug" ? "Something went wrong." : "An idea to make the tool better."),
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
      reports: [
        {
          store: s.store,
          when: "just now",
          name: s.reportName.trim() || null,
          text: s.reportDesc.trim() || title,
        },
      ],
    };
    set((st) => ({
      items: [item, ...st.items],
      reportStep: "confirm",
      nextId: st.nextId + 1,
      newItemId: id,
    }));
  },

  upvote: (id) => {
    const it = get().items.find((i) => i.id === id);
    if (!it) return;
    const nowVoted = !it.votedByMe;
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? {
              ...i,
              votes: i.votes + (nowVoted ? 1 : -1),
              votedByMe: nowVoted,
              inDistrict: nowVoted ? true : i.inDistrict,
              inRegion: nowVoted ? true : i.inRegion,
            }
          : i,
      ),
      justVotedId: id,
    }));
    setTimeout(() => set({ justVotedId: null }), 650);
  },

  toggleFollow: (id) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, followed: !i.followed } : i)),
    })),

  setHighlight: (id) => set({ highlightId: id }),
  dismissCoach: () => set({ coachOpen: false }),
  openDetail: (id) => set({ detailId: id, notifOpen: false }),
  closeDetail: () => set({ detailId: null, suppressAutoCelebrate: false }),
  setTypeFilter: (v) => set({ fType: v }),
  setStatusFilter: (v) => set({ fStatus: v }),
  setScopeFilter: (v) => set({ fScope: v }),
  setQuery: (v) => set({ query: v }),

  toggleNotif: () => set((s) => ({ notifOpen: !s.notifOpen, coachOpen: false })),
  closeNotif: () => set({ notifOpen: false }),
  markRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, unread: false } : n)),
    })),

  goToNotifiedItem: (itemId) =>
    set({ notifOpen: false, detailId: itemId, suppressAutoCelebrate: true }),

  maybeAutoCelebrate: () => {
    const s = get();
    // A notification just routed here with a detail open — let it show. The
    // flag holds (rather than consuming once) so double-invoked mount effects
    // (React StrictMode) stay harmless; closeDetail clears it.
    if (s.suppressAutoCelebrate) {
      if (s.detailId != null) return;
      set({ suppressAutoCelebrate: false }); // stale flag — clear and fall through
    }
    if (s.autoCelebrated) return;
    if (!s.celebrations) {
      set({ autoCelebrated: true });
      return;
    }
    const shipped = s.notifications.filter((n) => n.kind === "shipped");
    if (!shipped.length) {
      set({ autoCelebrated: true });
      return;
    }
    set({
      autoCelebrated: true,
      celebrateOpen: true,
      celebrateQueue: shipped.map((n) => ({ itemId: n.itemId, release: n.release })),
      celebrateIndex: 0,
      notifOpen: false,
      detailId: null,
    });
  },

  openCelebrate: (queue) =>
    set({ celebrateOpen: true, celebrateQueue: queue, celebrateIndex: 0, notifOpen: false }),
  closeCelebrate: () => set({ celebrateOpen: false, celebrateQueue: [], celebrateIndex: 0 }),
  celebratePrev: () => set((s) => ({ celebrateIndex: Math.max(0, s.celebrateIndex - 1) })),
  celebrateNext: () =>
    set((s) => ({ celebrateIndex: Math.min(s.celebrateQueue.length - 1, s.celebrateIndex + 1) })),
}));

/** Number of unread notifications — drives the header bell badge. */
export function selectUnreadCount(s: FeedbackState): number {
  return s.notifications.filter((n) => n.unread).length;
}
