import type { Release } from "@/schema";

/** Seed content copied verbatim from the handoff prototype (seedReleases()). */
export const seedReleases: Release[] = [
  {
    version: "v1.4",
    date: "Jun 24, 2026",
    title: "Cleaner edges, straighter cuts, faster proofs.",
    summary:
      "This one's all about the finish. Bleeds now fill to the edge on imported PDFs, the right guillotine cut lands where it should, and you can send a customer a proof in one tap.",
    yourStore: true,
    latest: true,
    features: [{ id: 10, title: "One-click proof PDF", stores: 10, yours: false }],
    fixes: [
      { id: 9, title: "Bleed now fills on imported PDFs", stores: 8, yours: true },
      { id: 11, title: "Right guillotine cut re-centered", stores: 9, yours: true },
    ],
  },
  {
    version: "v1.3",
    date: "May 19, 2026",
    title: "Publisher files come in cleaner.",
    summary:
      "Old .pub files convert with fewer surprises — fonts no longer swap themselves out silently, so what you see is what prints.",
    yourStore: false,
    latest: false,
    features: [],
    fixes: [{ id: 12, title: "Fonts no longer substitute silently on .pub import", stores: 6, yours: false }],
  },
  {
    version: "v1.2",
    date: "Apr 15, 2026",
    title: "Groundwork for large format.",
    summary:
      "Faster handling of big banner files and the first per-device cut-template calibration tools land in beta.",
    yourStore: false,
    latest: false,
    features: [{ id: null, title: "Per-device cut calibration (beta)", stores: 5, yours: false }],
    fixes: [{ id: null, title: "Faster load for files over 100 MB", stores: 7, yours: false }],
  },
  {
    version: "v1.1",
    date: "Mar 18, 2026",
    title: "Fit and finish.",
    summary:
      "Dozens of small fixes from your first month with the suite — snappier panels, clearer preflight warnings, fewer surprises.",
    yourStore: false,
    latest: false,
    features: [],
    fixes: [{ id: null, title: "Clearer preflight warning wording", stores: 4, yours: false }],
  },
  {
    version: "v1.0",
    date: "Feb 24, 2026",
    title: "Print Studio launches across every store.",
    summary:
      "The suite replaces the old Publisher workflow. Open any file, pick a product, and print — same-day.",
    yourStore: false,
    latest: false,
    features: [{ id: null, title: "Unified file intake and product picker", stores: 0, yours: false }],
    fixes: [],
  },
];
