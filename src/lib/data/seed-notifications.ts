import type { AppNotification } from "@/schema";

/** Seed content copied verbatim from the handoff prototype (seedNotifs()). */
export const seedNotifications: AppNotification[] = [
  {
    id: "n1",
    kind: "shipped",
    unread: true,
    itemId: 11,
    release: "v1.4",
    text: 'Your store asked for this — "Right guillotine cut re-centered" shipped in v1.4.',
  },
  {
    id: "n2",
    kind: "shipped",
    unread: true,
    itemId: 9,
    release: "v1.4",
    text: 'A bug you backed is fixed — "Bleed now fills on imported PDFs" in v1.4.',
  },
  {
    id: "n3",
    kind: "status",
    unread: true,
    itemId: 2,
    release: null,
    text: '"Large-format resize crash" moved to Planned. You’re following this one.',
  },
  {
    id: "n4",
    kind: "backed",
    unread: false,
    itemId: 2,
    release: null,
    text: '12 more stores backed "Large-format resize crash" with you — 47 in total now.',
  },
];
