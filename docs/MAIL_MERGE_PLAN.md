# Mail Merge Plan — Store Tools POC (host app)

**Status:** proposal, 2026-09-15 — awaiting confirmation. This is the
"own plan" that `docs/UI_LAYOUT_REDESIGN_PLAN.md` Phase 10 requires before
mail-merge work starts. No code is written until the decisions in §8 are
confirmed.

Scope note: this plan targets the **host POC at the repo root** (Next.js app
under `src/`), not `publisher-prototype/`. It replaces Microsoft Publisher's
mail merge (Mailings tab) for the layout editor at `/layout`: import a
recipient list from Excel or CSV, place its columns as fields in text boxes on
the canvas, see placeholders in **plan view**, click through records in
**preview view**, and view or fix the imported rows in a **review data**
modal. Merged *output* (print, PDF, "Generate Sheets") is designed for but
not built here — see §8 decision 6.

---

## 1. What the sources say

| Source | What it binds |
|---|---|
| `publisher-prototype/docs/microsoft_publisher_feature_requirements.md` §7.1 | Data sources (Excel, CSV, Outlook, Access, other); merge fields, address blocks, greeting lines, field formatting, recipient filtering and sorting, preview merged records, generate/print/PDF merged output. "Data mapping should be clear and correctable. Invalid or missing fields should be flagged. Large recipient lists must process reliably." |
| `docs/Desktop_Publisher_Design_Doc.md` §4.7 | CSV/TSV/XLSX/JSON sources; text tokens and image merge; conditional logic; catalog (repeating) merge and one-record-per-page; live preview; per-record PDF. |
| `docs/UI_LAYOUT_REDESIGN_PLAN.md` §2 "Dialogs", Phase 10, decisions 1 and 7 | The figma frame `mail-merge-setup`: a dialog with a steps rail **Select Data Source → Map Fields → Preview Records → Generate Sheets**, a source `customers_q4.xlsx`, a field-mapping table, and "Matched: 847 of 1,203 recipients". Mail merge is Phase 10 (deferred, needs its own plan). The five-item menu set is canonical (no Mailings menu — the eight-item variants in the mail-merge frames are drift); the right-panel tabs are fixed at Page / Text / Layers / Preflight. |
| `publisher-prototype/src/core/registry/tools/data.ts`, `panels.ts` (`data-merge`) | The prototype's merge-field contract: insert **inline in text** when clicking inside a text frame, as a standalone field frame on empty canvas; preview toggle is **view state, never document history**; missing fields are flagged **wherever the field renders**; a `format` option (as entered / upper / lower / title case); real data-source connection, batch generation, and merged print/PDF are process-boundary (SURFACE) operations. |
| `publisher-prototype/src/core/model/objects.ts` `MergeFieldObjectSchema` | A standalone merge field is a text-frame-like object carrying `field` (the column name) and optional `text` styling; inline fields are "a text-engine tranche concern". |
| `docs/SECURITY_CONSIDERATIONS.md` §2.4 and the VDP row | Merge lists are concentrated PII: minimize, expire, never accumulate; sanitize CSV formula-injection prefixes on any export. |
| `docs/LAYOUT_EDITOR_PLAN.md` §1.3, §6 | Data merge / VDP deferred to "their own suite slices" — this plan is that slice for the editor. |

## 2. Publisher's mail merge as the yardstick

What a Publisher user reaches for on the Mailings tab, and where each lands
in this plan. **v1** = built by this plan. **Later** = the model supports it,
a follow-up plan builds it. **Out** = not a browser-app capability, or owned
by another slice.

| Publisher capability | Disposition | Notes |
|---|---|---|
| Select Recipients → use an existing list (Excel) | **v1** | `.xlsx` (§4.3). `.xls` (binary BIFF) is Later — the dialog says "save as .xlsx or .csv". |
| Select Recipients → CSV / text file | **v1** | Comma, tab, or semicolon delimited (sniffed), RFC 4180 quoting, BOM. |
| Select Recipients → Outlook contacts / Access | **Out** | Desktop integrations; §7.1 lists them, the browser cannot reach them. Recorded in `STUBS.md`. |
| Select Recipients → type a new list | Later | The review-data grid already edits rows; a "start a blank list" columns editor is a small follow-up. |
| Insert Merge Field (inline «Field» at the caret) | **v1** | Inline field runs (§4.1). |
| Bind a whole text box to a column | **v1** | The user's "assign columns to text fields": a box whose content is one field run (§4.2, §4.7). Publisher does this with a text box holding a single field. |
| Edit Recipient List: include/exclude checkboxes, sort, find | **v1** | Review-data modal (§4.5). Plus cell editing, which Publisher only allows on its own lists. |
| Edit Recipient List: filter by column value, find duplicates, validate addresses | Later | Filtering = the same `records.ts` selector with a predicate; UI is a follow-up. |
| Preview Results, record navigation (first/prev/next/last), Exclude this recipient, Find recipient | **v1** | Status-bar navigator + canvas banner (§4.4). |
| Address Block, Greeting Line | Later | Composites over inline runs ("Dear " + «First Name» + ","); a helper that inserts the sequence is a small follow-up. |
| Field formatting (case switches, number/date formats) | Later | The prototype's `format` option; the run's font/size/color/alignment already come from the text box. |
| Picture field (image merge), catalog merge area (repeating records), conditional content | Later | Design doc §4.7. Image merge needs a `field` on picture frames plus per-record asset resolution; catalog merge needs a repeating region — both are their own plans. |
| Finish & Merge → print, merge to new publication, PDF | **Out of this plan** | The editor has no print or export pipeline yet (`MenuCluster.tsx`'s Print is inert, `STUBS.md`: "export/print still land with the print-production slice"). §4.11 states what the model gives that slice. |

## 3. Where the POC is today

- **Text model** (`src/lib/schema/layout.ts`): schema v4; a text frame is
  `text.paragraphs[]` of styled `runs[]` (`{ text, font, color }`), frame-level
  style is derived by `textSummary` (`src/lib/layout/text.ts`). No token,
  variable, or field concept exists anywhere in `src/`.
- **Canvas**: `TextFrameNode` in `src/components/layout-editor/canvas/ObjectNode.tsx`
  renders paragraphs and runs as `div`/`span` with `runCss`/`paraCss`;
  editing is the uncontrolled contentEditable `TextEditOverlay.tsx`, bridged by
  `rich-text-dom.ts` (styles ride `data-rs` JSON attributes; the DOM is parsed
  back to paragraphs on every input; one history step per session).
- **Store** (`src/lib/store/layout-store.ts`): Zustand, gesture-grained
  history (`commitGesture`, `transient`), persist to localStorage
  (`partialize: doc, level, unit`, migrate-on-read `merge`), session-only view
  state (`zoom`, `spread`, `editingTextId`…). Documents of record are
  `.staples` files (`src/lib/storage/container.ts`: `manifest.json` +
  `document.json` + `assets/<id>`).
- **Import**: `src/lib/import/` is the `.pub` importer only; no CSV or
  spreadsheet parsing; `fflate` (zip) is already a dependency.
- **UI surfaces**: Insert band (`ribbon/InsertBand.tsx`: captioned
  `RibbonGroup`s of 52px `Tile`s), inspector tabs Page / Text / Layers /
  Preflight (`inspector/Inspector.tsx`; the Text tab targets the edited or
  selected text frame via `useTextTarget.ts`), status bar with live page
  navigation and view chips (`StatusBar.tsx`), shared `Modal` primitive
  (`src/components/ui/Modal.tsx`, first consumer `FindReplaceDialog.tsx`),
  amber `MasterBanner.tsx` over the canvas, preflight rule engine
  (`src/lib/layout/preflight.ts`) with a tab, badge, and canvas pins.
- **Output**: none for the layout editor (see §2, last row).

## 4. Design

### 4.1 Document model (schema delta — additive, version stays 4)

Two additions, both following the repo's additive rule ("absent = default,
pre-delta documents parse unchanged" — the shape parameters and `swatches` /
`assets` / `guides` precedents in `layout.ts`). No migration; v1–v3 documents
still migrate to v4 and simply carry `merge: null`.

**A field run.** `TextRunSchema` gains an optional column binding:

```ts
export const TextRunSchema = z.object({
  text: z.string(),
  font: FontPropsSchema,
  color: PaintSchema,
  /** Mail merge (docs/MAIL_MERGE_PLAN.md §4.1): the data-source column this
      run stands for. A field run's `text` is always its placeholder label,
      «Column» — plan view shows it, preview view shows the record's value;
      the label rides in `text` so every reader that ignores `field`
      (find/replace, overset measurement, preflight labels) still sees
      sensible content. Absent = a literal run. */
  field: z.string().optional(),
}).superRefine(/* field present ⇒ text === fieldLabel(field) */);
```

The style of a field run is the run's own `font`/`color`, and its
alignment is the paragraph's — so **the text box controls display font,
size, color, and alignment** exactly as it does for literal text, through
the same three surfaces (Home band, Text tab, keyboard toggles). Nothing
new to learn.

**The data source.** `LayoutDocumentSchema` gains `merge`, defaulted:

```ts
// src/lib/schema/merge.ts
export const MergeSourceSchema = z.object({
  name: z.string(),                     // "customers_q4.xlsx" — the label everywhere
  kind: z.enum(["csv", "xlsx"]),
  sheet: z.string().optional(),         // worksheet name, xlsx only
  importedAt: z.string(),               // ISO
});
export const MergeRecordSchema = z.object({
  id: z.string(),                       // stable across sort/exclude/edit
  cells: z.array(z.string()),           // one per column; always text
  included: z.boolean(),                // false = skipped by preview and any output
});
export const MergeDataSchema = z.object({
  source: MergeSourceSchema,
  columns: z.array(z.string()).min(1),  // trimmed, unique (dupes suffixed " (2)"), blanks named "Column N"
  records: z.array(MergeRecordSchema),
  sort: z.object({ column: z.string(), dir: z.enum(["asc", "desc"]) }).optional(),
}).superRefine(/* every record has columns.length cells; sort.column ∈ columns */);

// layout.ts
merge: MergeDataSchema.nullable().default(null),
```

Why the records live **in the document** (decision 2): the review-data
modal edits them (a document mutation with undo, like every other edit), the
`.staples` file must reopen with the same list (a browser cannot re-resolve a
file path the way Publisher re-links an `.xlsx`), and preview needs them in
memory anyway. Cells are text only: what merges is what prints, and the
review grid is the place to fix a value. Import caps keep the serialized
document small enough for the persist layer (§4.3).

### 4.2 Field semantics

- `fieldLabel(column)` = `«Column»` (guillemets, as Publisher shows fields).
- **Resolution** (`src/lib/merge/fields.ts`, pure): `resolveRunText(run, record, columns)`
  returns `run.text` for literal runs, the record's cell for a resolvable
  field, and `run.text` (the label) for an **unresolved** field — a column
  the current source does not have, or no source at all. Unresolved fields
  render with the error tint (`#ffefed` / `#a30000`) in both views and raise a
  preflight error (§4.10): "flagged wherever the field renders".
- **Empty cell** in preview renders as empty text (Publisher's behaviour).
  Suppressing the blank *line* it may leave is an Address Block feature —
  Later.
- **Binding a whole box** = replace the box's paragraphs with one paragraph
  holding one field run in the box's dominant style (`textSummary`) and
  first paragraph's alignment. **Unbinding** removes the field runs from the
  box; an emptied box keeps one empty run carrying the style (the schema's
  never-empty rule). Both are one history step.
- A **standalone field** (Publisher's field-only text box; the prototype's
  `mergeField` object) is a text frame with a single field run — no new
  object type (decision 5).
- Fields on **master pages** resolve like any other; fields on hidden or
  non-print layers follow those layers' rules.
- **Re-importing** a source (same or different file) keeps every field run;
  they re-resolve by column name, and the ones that no longer match are
  flagged. Column names are fixed at import (no renaming in v1) so a
  binding never silently changes meaning.

### 4.3 Importing a data source (`src/lib/merge/`, framework-free, browser-side)

Parsing runs **in the browser**: nothing is posted to the server (the PII
rule), and `/api/import` stays a `.pub`-only route.

- `csv.ts` — RFC 4180 parser: quoted fields, doubled quotes, embedded
  newlines, CRLF/LF, UTF-8 BOM; delimiter sniffed from the header line
  (comma / tab / semicolon). Ragged rows pad with `""`. ~120 lines + tests.
- `xlsx.ts` — a minimal Office Open XML reader over `fflate`'s `unzipSync`
  (decision 3, no new dependency): `xl/workbook.xml` + its `.rels` for the
  sheet list and paths; `xl/sharedStrings.xml` (`<si><t>` and rich-run
  `<r><t>` concatenated); `xl/styles.xml` `cellXfs` → `numFmtId` for date
  detection (built-in ids 14–22, 45–47 and custom formats with y/m/d/h/s
  outside quotes); the chosen sheet's `<c r= s= t=><v>` cells: shared and
  inline strings, `str` formula results, booleans, errors (→ `""`), numbers.
  Numbers become `String(value)`; date-styled serials become `M/D/YYYY`
  (honouring `date1904`). Merged cells keep their value in the top-left
  cell; missing cells are `""`; the header is the first non-empty row.
  Element extraction is a small tolerant tokenizer (no `DOMParser`, so
  vitest's node environment can test it). ~250 lines + tests.
  **Known limitation, stated in the dialog:** Excel *display* formats
  (currency symbols, leading zeros, percent) are not reproduced in v1 —
  format the column as text in Excel or fix it in the review grid. This is
  the same class of complaint Publisher's OLE DB path draws.
- `source.ts` — `normalize(raw)` → `MergeData`: trims headers, dedupes
  them, names blanks, drops trailing empty rows, assigns record ids, and
  enforces the **caps**: 2,000 records, 60 columns, 500 KB of cell text
  (constants in `limits.ts`, tunable). Over-cap files are refused with a
  message naming the cap; §7.1's "large lists must process reliably" is
  met *up to the cap* in v1 and the sidecar design in §8 decision 2 is the
  path past it.
- `read-file.ts` — `readMergeFile(file: File)`: sniffs by content (zip
  signature → xlsx; else text → csv; never by extension, the `sniff.ts`
  rule), returns `MergeData` or a typed error (`unsupported-xls`,
  `too-large`, `no-header`, `parse-error`).
- **Security**: values are inert text in React (escaped); no CSV export
  exists in v1 — if one lands, prefix-escape `= + - @ \t \r` per
  `SECURITY_CONSIDERATIONS.md`. The list lives in the document the user
  saves and in the localStorage recovery copy for the session; "Remove data
  source" clears both (`merge: null`, records gone from the next persist
  write). No server, no telemetry, no retention beyond the user's file.

### 4.4 Plan view and preview view

Preview is **session view state** in the store, never history and never
persisted (the `spread` precedent; the prototype's rule):

```ts
mergePreview: boolean;              // false = plan view
previewRecordId: string | null;     // id, not index — survives sort/exclude/edit
```

- **Plan view** (default): field runs render as chips — the run's own
  style, plus a light tint (`#ecf4fd`) and a 1px dotted underline so a field
  reads as a field; unresolved chips use the error tint. Chips are chrome for
  the editor only; thumbnails (`PageThumb`, `MasterThumb`) render the plain
  label with no chip and never resolve records.
- **Preview view**: `TextFrameNode` receives the current record and renders
  `resolveRunText` per run; no chip chrome, so the page looks like the
  output. Only the main canvas resolves; thumbnails stay in plan view.
- **Record navigation** lives in the status bar (`StatusBar.tsx`), the
  existing home of view chips and live page navigation: a **Preview** chip
  beside the single/spread toggles, and when on, `⏮ ◀ Record 3 of 847 ▶ ⏭`
  over the *included, sorted* records, an **Exclude** toggle for the current
  record, and an **Edit list** link to the review modal. Hidden entirely
  when the document has no data source. A thin banner over the canvas (the
  `MasterBanner.tsx` pattern, guide-blue not amber) reads "Previewing record
  3 of 847 · Return to plan view", so preview cannot be mistaken for the
  layout.
- **Editing during preview**: double-clicking a text box opens the overlay
  seeded with the *placeholder chips* (the editable truth); the at-rest
  render returns to values when the session ends. Preview never alters what
  is stored.
- **When the current record goes away** (excluded, deleted, or filtered out
  by a re-import) the navigator moves to the nearest included record;
  removing the data source turns preview off.
- **Overflow**: the live overset badge measures whatever is rendered, so in
  preview it reports overflow for the current record — a feature. A
  "check every record" pass is Later (§4.10).

### 4.5 Review data modal

`ReviewDataModal.tsx` on the shared `Modal` (wider: 900px; the grid scrolls
inside a fixed-height body, not the modal). One `RecordGrid` component,
reused as the setup dialog's Preview Records step (§4.6).

- Header: source name, sheet, "N records · M included · Matched K"
  (§8 decision 7), **Change source** (opens setup step 1), **Remove data
  source** (confirm; also drops preview).
- Grid: include checkbox column, then one column per header; click a header
  to sort (persisted `merge.sort`, drives preview and output order); a find
  box filters *rows shown* (view-only, not persisted); row count of the
  filter.
- Editing: click a cell to edit (`input`), Enter/Tab/blur commits, Escape
  reverts; one history step per commit. **Add row** appends an empty
  included record; **Delete row** on the focused row (confirm when the row
  has content). Undo/redo in the editor undoes these like any edit.
- Columns whose header is bound to a field on the canvas show a small
  "field" badge; unresolved fields on the canvas appear as a warning line
  above the grid ("2 fields have no matching column: «Zip», «Phone»").
- **Preview on canvas** button: closes the modal, turns preview on at the
  focused row.

### 4.6 Mail Merge Setup dialog (the figma `mail-merge-setup` frame)

`MergeSetupDialog.tsx`: `Modal` at ~760px with a left steps rail
(**Select Data Source → Map Fields → Preview Records → Generate Sheets**);
steps are reachable in any order once a source exists.

1. **Select Data Source** — dropzone + file picker (`.csv, .tsv, .txt,
   .xlsx`); after a read: source card (name, kind, sheet dropdown when the
   workbook has several — re-reads on change), first five rows as a table,
   "N records · M columns", the display-format note (§4.3), and the typed
   errors. "Change source" and "Remove" here too.
2. **Map Fields** — a table of every text box on the document's pages and
   masters (page or master · label, using the same labelling preflight
   gives its issues — the module-private `objectLabel` in `preflight.ts`,
   exported for this) with a column dropdown:
   choosing a column **binds the box** (§4.2); a box holding inline fields
   among literal text shows "Custom (2 fields)" with an "Unbind all" action;
   "— none —" unbinds. This is the "assign columns to text fields"
   surface the request asks for; the Text tab (§4.7) does the same for the
   selected box.
3. **Preview Records** — the `RecordGrid` (§4.5) with the "Matched: K of N"
   readout and **Preview on canvas**.
4. **Generate Sheets** — rendered, **disabled**, with the honest caption
   "Merged output lands with print production" (`PROTOTYPE-ONLY:` tag +
   `STUBS.md` row, the repo's inert-affordance convention).

Figma access dropped for this repo (the `.fig` is a local file, no file key
in the docs), so the dialog is built from the redesign plan's frame notes
and the existing primitives; a styling verification pass against the live
frame is a follow-up, exactly as Phase 11 recorded.

### 4.7 Where the controls live (no new menu, no new tab)

Decision 1 rules out a Mailings menu; decision 7 fixes the inspector tabs.
Mail merge therefore rides existing surfaces:

| Surface | Addition |
|---|---|
| **Insert band** (`InsertBand.tsx`) | New `RibbonGroup` **Mail merge**: **Data source** tile (opens the setup dialog), **Merge field ▾** (a column list on the shared `Popover` primitive, `src/components/ui/Popover.tsx`; inserts at the caret when a text session is open, appends to the selected text box otherwise, or creates a text box at the page centre holding just the field when nothing is selected — the prototype's three insert cases), **Review data** tile. The two data tiles disable with a tooltip until a source exists. |
| **Text tab** (`inspector/TextTab.tsx`) | New **Mail merge** section under the typography controls when the target box exists and a source is loaded: **Insert field ▾**, **Bind box to column ▾** (current binding shown), and the box's fields as removable chips. Uses `useTextTarget`, so it follows the edited-or-selected box like every other text control. |
| **Status bar** (`StatusBar.tsx`) | Preview chip, record navigator, Exclude, Edit list (§4.4). |
| **Canvas** | Field chips; preview banner. |
| **Modals** | Setup dialog (§4.6), review-data modal (§4.5). |
| **Preflight tab** | The two merge rules (§4.10), located like any other issue. |

If the team prefers a fifth inspector tab or a Mailings menu instead, that
re-opens decisions 1 and 7 — stop-and-ask, per `CLAUDE.md`.

### 4.8 Store actions and history

Document actions (history, via `mapSurfaceObjects` / `pushed` like their
neighbours):

```
setMergeData(data | null)           // import, change source, remove
setMergeCell(recordId, col, value)
setRecordIncluded(recordId, included)
setMergeSort(sort | undefined)
addMergeRecord() / removeMergeRecord(recordId)
insertMergeField(frameId, column, at: "end")     // the non-caret paths
bindFrameToColumn(frameId, column) / unbindFrame(frameId)
```

Session actions (no history, not persisted):

```
setMergePreview(on) / setPreviewRecord(id) / stepPreviewRecord("first" | "prev" | "next" | "last")
requestFieldInsert(column)          // caret path, consumed by the edit overlay (§4.9)
setMergeDialog("setup" | "review" | null)
```

`setMergeData` also drops a `sort` whose column the new source lacks and
clears the preview state (§4.4). Selectors in `src/lib/merge/records.ts`
(pure, tested): `orderedRecords`, `includedRecords`, `currentRecord`,
`matchedCount`, `neighbourRecord`.
Persist: `partialize` already carries `doc`, so `merge` rides along; the
session fields are excluded like `spread`. `undo`/`redo` snapshot `doc`, so
merge edits are undoable; the persist `merge` function needs no change
(the schema defaults `merge` to `null`).

### 4.9 The contentEditable bridge (`rich-text-dom.ts`)

A field run seeds as an **atomic chip**:
`<span contenteditable="false" data-field="Column" data-rs="…">«Column»</span>`.
Chromium treats a non-editable inline as one unit: the caret lands before
or after it, Backspace/Delete removes it whole, typing never lands inside.

- `seedEditableDom`: emit the chip for `run.field`; `parseEditableDom`:
  a `data-field` element yields one token `{ text: label, style, field }`
  without descending; `tokensToRuns` includes `field` in the merge key so
  chips never coalesce with neighbours or each other.
- `walkPositions` / caret restore: a chip counts as one position of its
  label length with no interior offsets, so a reseed never puts the caret
  inside it.
- **Insert at caret**: `TextEditOverlay` watches `fieldInsertRequest`
  (`{ column, seq }`); on change it builds the chip in the current run's
  style at the selection range (`Range.insertNode`, collapsing after), then
  runs the same parse-and-`setTextParagraphs` path as `onInput`, so the
  session's single history commit still covers it. The session survives
  the click on the ribbon or Text tab exactly as it survives the styling
  clicks today (reseed + caret restore); if the selection has nonetheless
  left the overlay, the chip goes at the last captured caret offset, else
  at the end. Plain-text paste stays plain (a pasted «Name» is literal
  text, not a field).
- Cmd/Ctrl+B/I/U and the styling surfaces map over field runs like any run
  (`applyToAllRuns` is unchanged).

### 4.10 Preflight

Two rules in `src/lib/layout/preflight.ts` (`PreflightRule` union grows):

- `merge-unresolved` (**error**): a field run whose column the source lacks,
  or any field run when `merge` is null. Title "Merge field has no column",
  detail names the field and the source, location as the other rules, and
  the locate action selects the box.
- `merge-empty-list` (**warning**): fields exist and every record is
  excluded (nothing would merge).

Later: `merge-overflow-any-record` — measure each box against the longest
value per bound column (a headless pass like `OversetCheck`), so a long
name that overflows is caught before output.

### 4.11 Interactions with existing features

- **Find & Replace** (`src/lib/layout/find-replace.ts`): `findMatches` and
  `replaceInDoc` skip runs with `field` — a replace can never rewrite a
  placeholder. (The label is still visible content for overset measurement
  and preflight labels, which is why it lives in `text`.)
- **Import** (`.pub`): §7.1 asks that Publisher merge placeholders be
  preserved and unresolved data-source references reported, not fatal. The
  mapper produces no fields today (libmspub's trace carries none we consume);
  if a later import lands them, they are field runs with `merge: null` and
  the `merge-unresolved` rule is exactly the "reported, not blocking"
  behaviour asked for.
- **Save / Open** (`container.ts`): `document.json` carries `merge`;
  `parseLayoutPayload` accepts it through the defaulted schema. Older builds
  strip the unknown key on read (Zod strips), which is the §13.2 tolerance
  the container already relies on.
- **Masters, layers, clipboard, duplicate**: field runs are ordinary runs;
  copies keep their `field`.
- **Photo editor, templates, picker**: untouched.
- **Output (for the print-production slice)**: merged output = for each
  included record in `orderedRecords`, render every page with that record
  through the same `resolveRunText`, excluding non-print layers. The model
  here needs nothing further; the "Generate Sheets" step un-disables when
  that pipeline exists.

### 4.12 Alignment with the publisher prototype

- Same column-name binding (`field: string`), same "flag wherever it
  renders" and "preview is view state" rules, same three insert cases.
- Divergence, deliberate: the POC has no `mergeField` object type — its
  per-run text model already exists, so a standalone field is a one-run text
  frame. At merge time the prototype's `MergeFieldObject` maps to that shape
  (a rename-class change, like the Paint adoption in Phase 12). The
  prototype's `format` option is Later here (§2).
- The prototype's data-merge panel bundles data sources, fields, filtering,
  and preview into one panel; the POC spreads them over the setup dialog,
  Text tab, and status bar because decisions 1 and 7 fix its chrome.
  Functionally identical; recorded here so the eventual merge is a UI
  rehoming, not a model change.

## 5. Implementation phases

Each phase lands independently on its own branch; gate for every phase:
`npm run typecheck`, `npm run lint`, `npm run test`, `npm run e2e` green
(the `ci.yml` checks and e2e lanes), plus a review pass. Commits touch the
host repo only (no `publisher-prototype/` files). Store changes stay in
`layout-store.ts`; the schema change is M0's and needs decision 1 first.

- **M0 — Schema and core library (no UI).** `src/lib/schema/merge.ts`;
  `field` on `TextRunSchema` and `merge` on `LayoutDocumentSchema`
  (`layout.ts`), exports in `schema/index.ts`; `src/lib/merge/`
  (`csv.ts`, `xlsx.ts`, `source.ts`, `limits.ts`, `fields.ts`,
  `records.ts`) with colocated tests; fixtures `fixtures/merge/*.csv|xlsx`
  (generated by `scripts/gen-merge-fixtures.mjs` over `fflate`, plus any
  Excel-authored file the store can supply) and
  `fixtures/layout-document.v4-merge.json` (a document with a source and
  fields, beside the existing v4 example); store document actions (§4.8)
  and their tests.
- **M1 — Data source.** `read-file.ts`; `MergeSetupDialog.tsx` with the
  steps rail, step 1 live, steps 2–3 placeholders, step 4 disabled; Insert
  band **Mail merge** group with the Data source tile (the other two tiles
  arrive with their phases); `.staples` round-trip e2e in `storage.spec.ts`.
- **M2 — Fields on the canvas.** Chip render in `TextFrameNode`; chip
  seed/parse/caret in `rich-text-dom.ts`; caret insert in
  `TextEditOverlay.tsx`; Merge field ▾ tile; Text tab section; setup step 2
  (Map Fields); find/replace skip; store insert/bind/unbind actions.
- **M3 — Preview.** Session state; status-bar Preview chip and navigator;
  `MergePreviewBanner.tsx`; record resolution in `TextFrameNode`; step 3's
  "Preview on canvas"; keyboard: none new (Escape closes dialogs via
  `Modal`).
- **M4 — Review data modal.** `RecordGrid.tsx`, `ReviewDataModal.tsx`
  (also mounted as step 3); cell edit, include/exclude, sort, find,
  add/delete row, matched readout; Review data tile; Edit list link.
- **M5 — Preflight, registry, docs.** The two rules and tab copy;
  `STUBS.md` rows (Generate Sheets inert; Outlook/Access/.xls unsupported);
  README section; a measured check of persist-write cost at the caps (a
  2,000 × 20 fixture dragged on the canvas) — if visible, the sidecar in
  §8 decision 2 becomes its own follow-up; the figma styling verification
  pass when file access returns.

Rough shape: M0 is the largest (two parsers with tests); M2 is the riskiest
(the contentEditable bridge — prove the chip round-trip in e2e before the
Text tab work); M3–M5 are UI over tested selectors.

## 6. Testing

Unit (vitest, colocated, node environment):
- `csv.test.ts`: RFC 4180 corpus (quotes, doubled quotes, embedded
  newlines, CRLF, BOM, ragged rows, each delimiter, empty file, header-only).
- `xlsx.test.ts`: generated workbooks — shared and inline strings, rich-text
  runs, numbers, booleans, errors, formula results, date-styled serials in
  both date systems, merged cells, sparse rows, multiple sheets, a workbook
  with no rows; an Excel-authored fixture when supplied; refusal of `.xls`
  and of over-cap files.
- `source.test.ts`: header dedupe/naming/trim, trailing-row drop, caps.
- `fields.test.ts`: label, resolve (literal / resolved / unresolved / empty),
  bind and unbind (style preserved, never-empty rule), fields-in-document,
  unresolved listing.
- `records.test.ts`: ordering with and without sort, included filter,
  neighbour stepping at the ends, matched count, id stability across edits.
- `layout.test.ts` (schema): v4 without `merge` parses; with `merge`
  parses; field/label invariant refuses drift; cells-length invariant.
- `layout-store.test.ts`: every §4.8 action, history membership (document
  actions push, session actions don't), persist round-trip carries `merge`
  and drops preview state.
- `preflight.test.ts`: both rules, hidden/non-print exclusion.
- `find-replace.test.ts`: field runs skipped.
- `container.test.ts`: `.staples` pack/unpack with `merge`.

E2E (playwright, `e2e/layout-editor.spec.ts` + `storage.spec.ts`, fixture
`e2e/fixtures/recipients.csv` and `recipients.xlsx`):
- Import a CSV through the dialog (`setInputFiles`), see the count.
- Insert a field at the caret while editing; chip appears; Backspace removes
  it whole; text before/after survives.
- Bind a box from the Text tab; the box shows «Column» in the box's style.
- Toggle preview: values appear; next/prev change them; Exclude drops the
  record from the count; return to plan view restores chips.
- Edit a cell in the review modal; the canvas preview reflects it; undo
  reverts it.
- Save then open the `.staples` file: source, records, and fields intact.
- Preflight shows the unresolved error after "Remove data source".

## 7. Out of scope for this plan (for the record)

Merged output (print / PDF / new publication); Outlook and Access sources;
`.xls`; typed new lists; address block and greeting line; field formatting
switches; column-value filtering, duplicate finding, address validation;
picture fields; catalog / repeating merge; conditional content; a
merge-aware overflow pass across all records; renaming columns.

## 8. Decisions requiring sign-off (stop-and-ask, `CLAUDE.md`)

1. **Schema delta is additive, version stays 4** — `field?` on runs with the
   label invariant, `merge` on the document defaulted to `null`. *Recommend
   yes:* the same rule the shape parameters, swatches, assets, and guides
   used; no migration; older builds read the file minus merge.
2. **Records live in the document**, persisted with it and saved in the
   `.staples` file, capped at 2,000 records / 60 columns / 500 KB cell text.
   *Recommend yes* for the POC. Implications to accept: the recipient list is
   PII inside the user's document and its localStorage recovery copy
   (client-only, cleared by Remove data source); lists past the cap are
   refused. *Alternative recorded:* a sidecar — records in the IndexedDB
   store (the asset-blob pattern) and a `merge/records.json` container
   entry, with `partialize` stripping them — removes the cap's persist cost
   at the price of a second persistence path; adopt only if M5's
   measurement shows the write cost.
3. **XLSX via an in-repo minimal reader over `fflate`, no new dependency**
   (~250 lines + tests; supported subset in §4.3; display formats not
   reproduced). *Recommend yes.* *Alternative:* add SheetJS (`xlsx`) for
   formatted-text fidelity (`w` values) — a new dependency (the npm release
   lags the vendor's own distribution and carries advisories), so it needs
   the dependency decision under `CLAUDE.md`.
4. **UI placement** per §4.7: Insert band group, Text tab section, status
   bar navigator, two modals; no Mailings menu, no fifth inspector tab.
   *Recommend yes* (keeps decisions 1 and 7 intact).
5. **Inline field runs, no `mergeField` object type**; a standalone field is
   a one-run text box. *Recommend yes* (§4.12).
6. **Output is out of this plan**; the model is output-ready (§4.11) and the
   Generate Sheets step ships disabled with the honest caption. *Recommend
   yes* — building output here would mean building the print pipeline here.
7. **"Matched: K of N"** = included records in which every column bound on
   the canvas is non-empty. *Recommend yes* as the working definition until
   the figma frame is verified.
8. **Header row** = the first non-empty row, always (Publisher's
   assumption); no "first row has headers" toggle in v1. *Recommend yes.*
9. **Caps** as stated in decision 2 — confirm they cover the store's typical
   lists, or set the numbers.

## 9. Open questions

- The `mail-merge-setup` figma frame: what the Map Fields table maps
  (column ↔ text box, as assumed here, or column ↔ a fixed field set like
  Publisher's address matching), and what "Matched" counts. Needs the file
  key or a screenshot.
- Excel-authored sample lists from a store (for the xlsx fixtures) and the
  size of a typical job (for decision 9).
- Whether preview should also drive the Pages panel thumbnails (this plan
  says no — thumbnails stay in plan view).
