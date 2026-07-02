# STUBS.md — what isn't real, and what "real" requires

The dev-team-first registry (per the prototype rules, §2.5): every stub, mock, and
deliberately-inert affordance in this POC, with the swap story. Regenerate the raw list any
time with:

```bash
grep -rnE "STUB:|MOCK:|PROTOTYPE-ONLY:|CONTRACT:|PROD-TODO:|ASSUMPTION:" src/
```

**Scope note:** the POC is fully client-side — there is no backend, auth service, or external
API yet. The seams below are where those arrive. The Zod schemas in `src/lib/schema/` are the
portable contracts (`CONTRACT:` tags); a committed example document lives at
`fixtures/layout-document.v1.json`.

## Seams & stubs

| Area | File(s) | What's faked | To make real |
|---|---|---|---|
| Station identity | `src/lib/identity.ts` | Hardcoded `#1284` behind `getCurrentStation()` | Real station/associate resolution (device registration or SSO). Swap touches only this file. |
| Persistence — tracker | `src/lib/store/feedback-store.ts` | `localStorage` (`stp-feedback-v1`), schema-validated on rehydrate | Backend persists the `PersistedFeedbackSchema` shape per store, keyed by station identity. |
| Persistence — layout docs | `src/lib/store/layout-store.ts` | `localStorage` (`stp-layout-v1`), schema-validated on rehydrate | Backend persists `LayoutDocument` per publication; v1→v2 migration per plan §9 (prototype drops-and-reseeds; production must migrate). |
| Tracker demo data | `src/lib/data/seed-*.ts` | Seeded items/releases/notifications (authored wire content); "Reset demo data" restores it | Real feedback/release feeds; seeds become test fixtures. |
| Captured bug context | `src/components/report/CapturedContextPanel.tsx` | Canned capture rows behind a **"Sample data" badge** | Tool surfaces publish live context (file, SKU, recent actions, environment) into the store; the panel reads it. |
| Release participation | `src/components/board/BoardRail.tsx` (`TOP_STORES`) | Fixture store list | Query stores that backed items in the latest release. |
| Rollup hierarchy | `src/components/board/BoardRail.tsx` | "Region · Northeast" / "District 118" demo labels | Real region/district from store identity. |
| Product/SKU binding | `src/components/layout-editor/inspector/PageTab.tsx` | "Choose a product →" link is inert; `doc.product` schema field already renders when set | Catalog/spec-sync slice (plan §6) wires the picker; the schema needs no change. |
| Fonts | `src/lib/layout/text.ts`, `public/fonts/README` | Motiva Sans renders via system fallback | License + drop WOFF2 files into `public/fonts/` (README there documents the exact step). |

## Inert-by-design affordances (`PROTOTYPE-ONLY:`)

Visible-but-static chrome, kept so the tool's ceiling reads as reachable (each maps to a
deferred slice in `docs/LAYOUT_EDITOR_PLAN.md` §6):

- Editor ribbon: **File** tab (open/save/export), **Arrange/View/Help** tabs, Home band's
  Clipboard/Editing groups + list/¶ controls + Styles "+ New", Insert band's
  Masters/Shapes/Table/Hyperlink tiles, Text band's Space + Link boxes/Wrap.
- Status bar: two-page **spread** view toggle (facing pages, plan §6).
- App header: global search face and the avatar circle (future suite surfaces).
- Tool palette: the **Table** tool arms but reports "coming later in the beta" honestly.

## Known gaps (`PROD-TODO:`)

- **Storage migrations:** both stores drop-and-reseed on shape mismatch; production migrates
  (`src/lib/store/*.ts`, `src/lib/schema/layout.ts`).
- **Storage write failures:** quota/private-mode write errors only log; needs a visible
  "changes aren't being saved" state (both persist configs).
- **PII:** associate names + free-prose report/comment text are unclassified
  (`src/lib/schema/index.ts`); set classification/retention before data leaves the browser.
- **Referential integrity:** `page.masterId` is a guarded soft reference; a real store
  enforces it on write (`src/lib/schema/layout.ts`).
- **File-size watch:** `layout-store.ts` (~750 lines) and `CanvasViewport.tsx` (~600) should
  split (store slices; gesture hook) as L7+ grows them.

## Assumptions to confirm (`ASSUMPTION:`)

| Value | Where | Guess |
|---|---|---|
| Station id `#1284` | `src/lib/identity.ts` | Demo copy from the wires |
| Region/district labels | `src/components/board/BoardRail.tsx` | "Northeast" / "District 118" |
| Station/app version copy | `src/components/report/CapturedContextPanel.tsx` | "Station POS-3 · v1.3.2" |
| Undo depth 50 | `src/lib/store/layout-store.ts` | Desktop-publishing norm |
| Zoom 10–400%, page 1–240 in | `src/lib/layout/geometry.ts` | Working-range guesses (large-format friendly) |
| Snap radius 6px (screen) | `src/lib/layout/snap.ts` | Feel-based; confirm on store hardware |
| Curated font list | `src/lib/layout/text.ts` | In-store set TBD; Motiva licensing pending |
| Recently-shipped band window (7 days) | board logic / seeds | Product to confirm |
