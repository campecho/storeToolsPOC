# Feedback Tracker — Requirements

**What this is:** a concise, referenceable requirements list for the **bug report /
feature request** feature (the field-facing tracker) in the **host POC**. It is a
review artifact, not a plan: it states what the feature must do, derived from the
design handoff and verified against the code as built. It does not supersede
`docs/IMPLEMENTATION_PLAN.md` or `docs/UI_LAYOUT_REDESIGN_PLAN.md`.

**Scope:** host POC only (repo root) — `src/app/feedback/*`,
`src/components/{report,board,detail,releases,overlays}`,
`src/lib/{board,similar,detail}.ts`, `src/lib/store/feedback-store.ts`, and the
global header affordance in `src/components/chrome/AppHeader.tsx`. Nothing here
applies to `publisher-prototype/`.

**Sources:**

| Input | Where | Role |
|---|---|---|
| Handoff spec (screens, interactions, state model, tokens) | `docs/handoff/feedback-tracker/README.md` | Design source of truth |
| Functional design v0.1 | `docs/handoff/feedback-tracker/FUNCTIONAL_DESIGN.md` | Product behavior (§5.1–5.7, §5.9 field side) |
| Implementation plan | `docs/IMPLEMENTATION_PLAN.md` | The build this feature is the subject of |
| UI layout redesign plan | `docs/UI_LAYOUT_REDESIGN_PLAN.md` §Phase 11 | Confirms the feature is kept when old Home retires |

---

## 1. Entry & report flow

1. A persistent **Give feedback** affordance lives in the app header, present on
   every surface, opening a modal over any route — never a route of its own
   (`AppHeader.tsx`, `ReportModal.tsx`).
2. The modal is four steps: `choose` → `bug` | `feature` → `confirm`, or →
   `upvoted` when the associate backs an existing item instead of filing.
3. Step `choose` offers exactly two paths: **Report a problem** and **Request a
   feature**.
4. Both forms take a title (falls back to a default if blank), an optional
   description, and an optional associate name — blank means store-only
   attribution.
5. **Bug only:** a read-only auto-captured context panel — tool/mode, file,
   product spec, what happened, recent steps, environment (store · station · app
   version · timestamp) — plus an "attach the customer file" toggle, default on,
   labelled as sensitive and purged in 14 days.
6. **Feature only:** auto-tag to the current tool/area; no file capture.
7. Submitting creates the item with `status: new`, `votes: 1`, and `mine`,
   `votedByMe`, `followed` all true, plus one preserved report carrying the
   store, time, optional name, and the associate's original words. The item
   unshifts to the top of the board and is highlighted there.

## 2. Consolidation

8. While the title is typed (≥3 meaningful characters), surface up to **3
   similar open items**, ranked by keyword overlap then votes. Gibberish or
   fewer than 3 characters shows nothing (`src/lib/similar.ts`).
9. **Back this** upvotes the existing item and routes to the `upvoted`
   confirmation — no duplicate is filed. This is the primary duplicate-prevention
   mechanism.
10. Delivered (`done`) items are never offered as similar candidates.
11. Team-side merges must aggregate votes onto a canonical item while preserving
    every original report verbatim, and must be reversible. The data model
    supports this (`FeedbackItem.reports[]`); no merge action exists in the field
    build.

## 3. The board

12. One population-wide list, **always sorted by votes descending**. Delivered
    items are excluded from it entirely (`src/lib/board.ts`).
13. Filters: type (all / bug / feature), status (open = new + planned, new,
    planned, declined), hierarchy scope (all / region / district / my store), and
    keyword search over title + area + description.
14. Scope semantics: `mine` = raised or backed by this store; `district` /
    `region` = has backing in that tier; `all` = everything. The result subline
    reflects the active scope and count.
15. Each row shows a toggleable vote button with count, type tag, area, title,
    reach (`N stores · N districts`), comment count, "Raised by your store" when
    applicable, and a status pill.
16. A **Recently shipped** band surfaces deliveries for 7 days
    (`RECENT_SHIP_WINDOW_DAYS`), dismissible per item ("Got it") or all at once;
    acknowledged deliveries drop out.
17. Rows reorder with motion as backing shifts; vote counts pulse on change.
18. The left rail carries the store impact tally, the filters, and a non-ranked
    "stores behind vX" spotlight.

## 4. Item detail

19. The drawer shows: the status timeline (New → Planned → Fixed/Shipped, or →
    Declined/Closed), the delivering release when done (linking to its release
    note), an honest reason when declined, the description, vote and follow
    toggles, the preserved per-store reports with the store's own highlighted,
    and a flat, non-threaded comments list.

## 5. Releases & close-the-loop

20. Release cards run reverse-chronologically: version chip, date, title,
    plain-language summary, `Latest` and `Your store asked` badges, and separate
    **Features** and **Fixes** lists with per-item store credit and a `View →`
    cross-link back to the board item.
21. Every delivered item links to exactly one release, two-directionally.
22. A header bell carries the unread count; notification kinds `shipped` /
    `status` / `backed` route to the celebrate moment, the release note, and the
    item respectively.
23. On the first board landing per session, auto-play a celebrate queue of every
    **unread** shipped notification; playing it marks them read, so a delivery
    celebrates once rather than on every page load. The queue supports prev/next
    and "Dismiss all". A `celebrations` flag turns the moment off, routing
    shipped notifications straight to the release note.

## 6. Identity, votes, persistence

24. The **store** is the unit of voice. Station identity resolves only through
    `getCurrentStation()` (`src/lib/identity.ts`).
25. One vote per store per item, toggleable on every vote surface (board row,
    detail drawer, similar-items panel). Production must enforce this
    server-side.
26. The associate name is always optional; recognition and loop-closing land at
    store level regardless.
27. Recognition is **collective and store-level only** — no individual
    leaderboards, points, or streaks.
28. Motion stays brief and functional, and never blocks counter work.
29. Station state persists under `stp-feedback-v1`, Zod-validated on rehydrate,
    falling back to the seed on mismatch. "Reset demo data" restores the pristine
    seed.

## 7. Out of scope (field build)

30. The team-side **triage console** — ranked queue, de-dup workspace, status and
    release management, telemetry context, Claude Code handoff generation, and the
    moderation queue (`FUNCTIONAL_DESIGN.md` §5.8).

---

## 8. Gaps between the spec and the build

Open decisions, none of them blocking. Stub-level seams are also registered in
`STUBS.md`.

| Gap | Where | Spec says |
|---|---|---|
| Comments are read-only — no compose action in the store | `feedback-store.ts`, `CommentsList.tsx` | A simple comment adds context (§5.2) |
| Captured context is canned, flagged with a "Sample data" chip | `CapturedContextPanel.tsx` | Real tool surfaces publish live context (§5.1) |
| File attach is a boolean toggle — no upload, no retention mechanic | `CapturedContextPanel.tsx` | Attach the file; sensitive handling, 14-day purge (§5.7) |
| Hierarchy is boolean flags with hardcoded labels | `FeedbackItem.inDistrict` / `inRegion`, `scopeLabel()` | Roll-ups come from a fed-in store directory (§5.7) |
| Notifications are seed-only; following generates nothing | `src/lib/data/seed-*.ts` | Status transitions notify reporters, backers, and followers (§5.6) |
| New items hardcode `area: "Design editor"` | `submitReport()` | The tool tags the item to where the associate is (§5.1) |
