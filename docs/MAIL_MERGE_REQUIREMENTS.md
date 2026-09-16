# Mail Merge — Feature Requirements (Store Tools POC, host app)

**Status:** draft, 2026-09-16 — companion to `docs/MAIL_MERGE_PLAN.md`
(proposal, awaiting confirmation). This document describes **what the user
can do and what they see**; the plan describes **how it is built**. It makes
no technical decisions. Where a requirement below depends on a plan decision
that is still open (plan §8), the requirement says so, so that the two
documents can be revised together when the decisions are signed off.

Scope note: this document targets the **host POC at the repo root** (the
layout editor at `/layout`), not `publisher-prototype/`. It covers the v1
mail-merge slice the plan defines: connecting a recipient list, placing its
columns as fields in text boxes, previewing records on the canvas, and
reviewing or fixing the list. Merged output (print, PDF, sheets) is deferred
and appears here only as the user-facing expectation set by the disabled
step (§7.11).

How to read this document:

- **§3 Journeys** walks the happy paths step by step (what the user does,
  what the tool shows).
- **§4 Exceptions** lists everything that can go wrong or be unexpected, with
  what the user sees and how they recover.
- **§5–§7** are the functional requirements, numbered for traceability
  (`MM-xx`), grouped by area. Each is **v1** unless marked **Later** (the
  model supports it, a follow-up builds it) or **Out** (not this product, or
  owned by another slice).
- **§8–§10** are user expectations, deferred scope, and open questions.
- Items tagged **(proposed)** are this document's additions: behaviour the
  plan does not state, written here because a requirements reader needs an
  answer. They are collected in §10 question 9 for confirmation, and the
  plan should adopt or amend them when it is revised.
- Items tagged **(conflicts with plan)** are requirements stated by the
  product owner that the plan as written does not meet. Both lines are
  quoted in §10 question 12; the plan must change before that work starts
  (`CLAUDE.md` stop-and-ask).

---

## 1. Purpose and users

### 1.1 What the feature is for

A store associate has a design (a postcard, a certificate, a name badge, a
letter) and a list of people or items (customers, staff, products). Mail merge
lets them place list columns into the design once, see each record filled in,
and then produce one copy per record. This replaces Microsoft Publisher's
Mailings tab for the layout editor.

### 1.2 Who uses it

Per `docs/Desktop_Publisher_Design_Doc.md` §3.1, users are in-store retail
associates, from twenty-year Publisher veterans to first-week novices. The
feature must therefore:

- Feel familiar to a Publisher user (same vocabulary: recipient list, merge
  field, preview results, exclude recipient).
- Be discoverable by a novice without training: one obvious entry point, a
  guided setup dialog, and errors that say what to do next.
- Never silently alter the design or the data. Every change is visible and
  undoable.

### 1.3 Sources this document binds

| Source | What it contributes |
|---|---|
| `publisher-prototype/docs/microsoft_publisher_feature_requirements.md` §7.1 | The Publisher yardstick: data sources, merge fields, filtering and sorting, preview, generate/print/PDF. "Data mapping should be clear and correctable. Invalid or missing fields should be flagged. Large recipient lists must process reliably." |
| `docs/UI_LAYOUT_REDESIGN_PLAN.md` §2 "Dialogs", Phase 10, decisions 1 and 7 | The `mail-merge-setup` figma frame (steps rail Select Data Source → Map Fields → Preview Records → Generate Sheets; "Matched: 847 of 1,203 recipients"); no Mailings menu; the four fixed inspector tabs. |
| `docs/MAIL_MERGE_PLAN.md` | The v1 / Later / Out split (§2), the surfaces (§4.7), the behaviours (§4.2–§4.11), and the open decisions (§8). |
| `docs/SECURITY_CONSIDERATIONS.md` §2.4 | Merge lists are concentrated personal data: minimize, expire, never accumulate. |

---

## 2. Vocabulary

| Term | Meaning in this document |
|---|---|
| **Data source** | The file the recipient list came from (a `.csv`, `.tsv`, `.txt`, or `.xlsx`), identified everywhere by its file name and, for a workbook, the sheet name. |
| **Recipient list** / **list** | The rows and columns imported from the data source and now carried by the document. |
| **Record** | One row of the list. A record is either **included** (previewed and, later, output) or **excluded** (skipped). |
| **Column** | One column of the list, named by its header cell. Column names are fixed at import. |
| **Field** | A placeholder in a text box that stands for a column. Shown as **«Column»** (guillemets, as Publisher shows them). |
| **Field chip** | How a field looks on the canvas in plan view: the placeholder with a light tint and a dotted underline. |
| **Inline field** | A field sitting among ordinary text inside a text box ("Dear «First Name»,"). |
| **Bound text box** | A text box whose entire content is one field. "Bind box to column" makes one; Publisher users know it as a text box holding a single field. |
| **Standalone field** | A bound text box created for the purpose, e.g. by inserting a field with nothing selected. Not a distinct kind of object to the user. |
| **Unresolved field** | A field whose column does not exist in the current data source, or any field when there is no data source. |
| **Plan view** | The normal editing view. Fields show as placeholders. |
| **Preview view** | A view in which fields show the values of one chosen record. Editing still works and edits the placeholders. Turning preview on or off never changes the document. |
| **Preview toggle** | The status-bar control that switches between plan view and preview view. |
| **Editing session** | The state of a text box after a double-click, while the caret is in it and text can be typed. |
| **Matched** | The count shown as "Matched: K of N". K = included records in which every column that is bound on the canvas has a value (working definition per plan §8 decision 7). N = all records in the list **(proposed)**; the plan does not say whether N counts all or only included records. See §10 question 1. |
| **Review data** | The dialog for viewing and fixing the list: sort, find, include/exclude, edit cells, add and delete rows. |
| **Mail Merge Setup** | The guided dialog with the steps rail Select Data Source → Map Fields → Preview Records → Generate Sheets. |

---

## 3. Journeys (happy paths)

Each journey is written as *user does → tool shows*. Journeys assume the
document is open in the layout editor at `/layout`.

### J1. Connect a recipient list

1. User opens the **Insert** band and finds the **Mail merge** group with
   three tiles: **Data source**, **Merge field ▾**, **Review data**. Only
   **Data source** is enabled; the other two show a tooltip explaining a
   data source is needed first.
2. User clicks **Data source** → the **Mail Merge Setup** dialog opens on
   step 1, **Select Data Source**, with a drop zone and a file picker that
   accepts `.csv`, `.tsv`, `.txt`, and `.xlsx`.
3. User drops or picks `customers_q4.xlsx` → the dialog shows a **source
   card**: file name, kind, and (for a workbook with several sheets) a
   **sheet** dropdown; a table of the **first five rows** under their
   column headers; a count line "N records · M columns"; and an info icon
   whose popover explains that Excel currency and percent formats are not
   reproduced (leading zeros are kept; see MM-DS-15).
4. User changes the sheet dropdown (if shown) → the card and preview rows
   re-read from the chosen sheet.
5. The list is now the document's data source. The steps rail unlocks
   **Map Fields** and **Preview Records**; **Generate Sheets** is visible
   but disabled (see J10). The **Merge field ▾** and **Review data** tiles
   enable. The status bar gains the **Preview** toggle.
6. User closes the dialog (Escape, the close control, or by continuing to
   another step and closing from there).

Variant: the same journey with a `.csv` (comma, tab, or semicolon separated;
the delimiter is detected, the user is not asked).

### J2. Insert a field while typing

1. User double-clicks a text box and places the caret after "Dear ".
2. User clicks **Merge field ▾** on the Insert band (or **Insert field ▾** in
   the **Text** tab's **Mail merge** section) → a list of the source's
   columns appears.
3. User picks **First Name** → the placeholder **«First Name»** appears at
   the caret, in the style of the surrounding text, and the caret lands
   after it. The editing session continues; the user keeps typing ",". If
   the click on the column list has moved the caret out of the box, the
   field goes where the caret last was in the box, or at the end of its
   text.
4. The field appears as a **field chip**: the box's own font, size, and
   color, with a light tint and a dotted underline so it reads as a field
   and not as typed text.
5. Backspace or Delete with the caret beside the chip removes the **whole
   field** in one keystroke; the text on either side is untouched. Typing
   never lands *inside* a field.
6. Undo reverses the insertion together with the rest of that editing
   session, as any other text edit does.

### J3. Bind a whole text box to a column

1. User selects (or is editing) a text box, opens the **Text** tab, and
   finds the **Mail merge** section beneath the typography controls (shown
   only when a data source is loaded).
2. User opens **Bind box to column ▾** and picks **Company** → the box's
   content is replaced by the single placeholder **«Company»**, keeping the
   box's dominant font, size, color, and the first paragraph's alignment.
3. The Text tab now shows the current binding ("Company") and lists the
   box's fields, each with a remove control.
4. Alternative path: **Mail Merge Setup → Map Fields** lists every text box
   on every page and master (labelled the way the Preflight tab labels
   objects) with a column dropdown per row; choosing a column binds that
   box the same way. "— none —" unbinds. A box that mixes fields and typed
   text shows "Custom (2 fields)" as the dropdown's current value with an
   **Unbind all** action beside it; choosing a column from that dropdown
   replaces the whole content with the single field **(proposed:** the plan
   names the label and the action but not whether the dropdown remains).
5. Binding and unbinding are each one undo step.

### J4. Insert a field with no caret

1. **A text box is selected but not being edited.** User picks a column from
   **Merge field ▾** → the placeholder is appended to the end of the box's
   text.
2. **Nothing is selected.** User picks a column → a new text box appears at
   the centre of the current page containing just that field (a standalone
   field), ready to be moved, resized, and styled.
3. Either action is one undo step.

### J5. Style a field

1. User selects text that includes a field (or selects the box) and uses
   any of the usual text controls: Home band, Text tab, or keyboard
   shortcuts for bold, italic, underline.
2. The field takes the style like any run of text. There is nothing
   merge-specific to learn: the text box controls display font, size,
   color, and alignment for fields exactly as for literal text.

### J6. Preview records on the canvas

1. User clicks the **Preview** toggle in the status bar (beside the single /
   spread view controls) → the canvas switches to **preview view**: every
   field shows the value from the first included record **(proposed:** the
   plan does not say which record the toggle starts on), with no chip
   styling, so the page looks like the finished piece.
2. A thin blue banner appears above the canvas: "Previewing record 1 of 847 ·
   Return to plan view".
3. The status bar shows a record navigator: **⏮ ◀ Record 1 of 847 ▶ ⏭**
   over the included records in the list's sort order, an **Exclude**
   control for the current record, and an **Edit list** link.
4. User steps with ▶ / ◀ and jumps with ⏮ / ⏭ → values on the canvas change
   with each record. The count and position update.
5. User clicks **Exclude** on a record that should not merge → the record
   leaves the included set; the navigator moves to the nearest included
   record; the count drops by one. Re-including a record is done in Review
   data (tick its checkbox); see §10 question 11.
6. User clicks "Return to plan view" on the banner (or the **Preview**
   toggle again) → placeholders return. Nothing in the document has
   changed; preview is never part of undo history and is not saved with
   the file.
7. Page thumbnails stay in plan view throughout (placeholders, no values).

### J7. Review and fix the list

1. User clicks **Review data** on the Insert band (or **Edit list** in the
   status bar) → the **Review data** dialog opens: a header with the source
   name and sheet, "N records · M included · Matched K", **Change source**,
   and **Remove data source**; then a grid with an include checkbox per row
   and one column per header. The same grid also appears as the setup
   dialog's **Preview Records** step, there with the "Matched: K of N"
   readout and **Preview on canvas**, and without the header actions
   (**Change source** and **Remove** live on step 1).
2. **Sort:** user clicks a column header → rows sort by that column
   (ascending; a second click reverses the direction **(proposed:** the
   plan names both directions but not the gesture). The sort is saved with
   the document and sets the order used by preview and, later, output.
3. **Find:** user types in the find box → only rows containing the text (in
   any column, case-insensitive) are shown, with a "showing X of N" count.
   The filter is a view aid only: it is not saved and excludes nothing.
   This is also how a Publisher user's "Find recipient" is met in v1.
4. **Include / exclude:** user unticks a row's checkbox → the record is
   excluded (kept in the list, skipped by preview and output). Ticking
   restores it.
5. **Edit a cell:** user clicks a cell → it becomes editable. Enter, Tab, or
   clicking away commits; Escape reverts. Each commit is one undo step.
6. **Add row:** user clicks **Add row** → an empty, included record appears
   at the end, ready to fill in.
7. **Delete row:** user focuses a row and clicks **Delete row** → the record
   is removed (with a confirmation when the row has content).
8. Columns that are bound to a field on the canvas carry a small **field**
   badge in their header, so the user can see which columns matter to the
   design.
9. User clicks **Preview on canvas** → the dialog closes and preview view
   opens at the focused row.
10. Undo and redo in the editor step back through list edits (cell edits,
    include/exclude, add/delete row, sort) exactly as through design edits.

### J8. Change the data source

1. User opens **Mail Merge Setup** (via **Data source**, or **Change source**
   in the Review data dialog) and picks a new file, or the same file after
   editing it in Excel.
2. The list is replaced by the new file's rows. Every field on the canvas is
   kept and re-matched **by column name**: fields whose column exists in the
   new file resolve normally; fields whose column is missing become
   unresolved (see E-F1). Excluded/included state and cell edits from the
   old list do not carry over, since the rows are new **(proposed:** implied
   by the plan's replace-the-list behaviour, not stated).
3. If the saved sort was on a column the new file lacks, the sort is
   cleared. If preview was on, it stays on and shows the first included
   record of the new list (plan §4.4; the plan's §4.8 says preview is
   cleared instead — see §10 question 10).
4. The replacement is one undo step; undo brings back the previous list.

### J9. Save, close, reopen

1. User saves the document (`.staples`). The data source name, the list
   (records, included/excluded state, sort), and every field travel with
   the file.
2. User reopens the file later, on the same or another machine → the list
   and fields are exactly as saved. No re-linking to the original file is
   needed and none is attempted.
3. Between saves, the editor's normal session recovery copy also carries the
   list, so a reload does not lose it.

### J10. Reach the Generate Sheets step

1. User opens **Mail Merge Setup → Generate Sheets** → the step is shown
   but disabled, with the caption "Merged output lands with print
   production".
2. The user understands that producing the merged copies is a later
   capability of the print pipeline, not a missing button. Everything set up
   so far (list, fields, sort, inclusions) will be what that step uses.

### J11. Remove the data source

1. User clicks **Remove data source** (Review data header, or step 1 of the
   setup dialog) → a confirmation. **(proposed** wording; the plan requires
   the confirmation but not its content:) it explains that the list will be
   removed from the document and the recovery copy, and that fields on the
   canvas will remain as placeholders flagged for attention.
2. User confirms → the list is gone; preview turns off; the **Merge field ▾**
   and **Review data** tiles disable; the status bar hides the **Preview**
   toggle; fields on the canvas show as unresolved (E-F1) so the user can
   find and remove them or connect a new source.
3. Removal is one undo step.

---

## 4. Exceptions and edge cases

Each row: the situation, what the user sees, and what they can do.

### 4.1 Importing a data source

| ID | Situation | What the user sees | Recovery |
|---|---|---|---|
| E-I1 | The file is a legacy binary `.xls` workbook | The source card is replaced by a message: this format is not supported; save the workbook as `.xlsx` or `.csv` and try again. Nothing in the document changes. | Re-save in Excel; pick again. |
| E-I2 | The file is some other type (PDF, image, a Word document renamed to `.csv`) | "This file could not be read as a recipient list." The kind is judged by the file's contents, not its name, so a mislabelled file is caught. **(proposed:** the plan reads any non-workbook file as delimited text; without a text-versus-binary check such a file would import with garbage headers or fail with a read error.) | Pick a `.csv` / `.tsv` / `.txt` / `.xlsx`. |
| E-I3 | The file is damaged or cannot be parsed | A read error naming the file, without partial data. Nothing in the document changes. | Re-export the file; pick again. |
| E-I4 | The file is empty, or has no header row | "No header row found." The document is unchanged. A file with a header row and **no data rows** is different: it imports as a list with "0 records · M columns", ready for **Add row**. | Add rows to the file and re-import, or add rows in Review data. |
| E-I5 | The first non-empty row is not a header (e.g. a title line above the table) | The tool always treats the first non-empty row as the header (plan §8 decision 8); the user sees odd column names such as "Q4 Customers" and "Column 2" in the preview rows. | Delete the title rows in the file and re-import. See §10 for the "first row has headers" toggle question. |
| E-I6 | Two header cells have the same name; a header cell is blank | Duplicate names are suffixed ("Email", "Email (2)"); blank names become "Column N". The source card's preview rows show the names as they will appear in field lists. | Rename headers in the file and re-import if the generated names are unwanted. |
| E-I7 | Some rows have fewer cells than the header (ragged CSV) | Missing cells are blank; no error. | Fix in the Review data grid if the blanks matter. |
| E-I8 | Excel cells carry display formatting: currency, percent, custom date formats | Values import as their underlying text or number; a date-styled cell imports as `M/D/YYYY`; "$1,200.00" imports as "1200". The source card's info popover states this limitation up front. | Format the column as text in Excel before import, or fix values in the Review data grid. |
| E-I13 | A column such as ZIP code shows leading zeros in Excel, whether the cells are text ("02134") or numbers with a zero-padding format (2134 shown as 02134); or a CSV holds "02134" | The value imports exactly as Excel shows it: "02134". Numeric-looking text is never turned into a number. **(conflicts with plan:** §4.3 lists leading zeros among the display formats "not reproduced in v1"; see MM-DS-15 and §10 question 12.) | None needed; this is required behaviour. |
| E-I9 | The list exceeds the size limits (plan §8 decisions 2 and 9 set them at 2,000 records, 60 columns, or 500 KB of cell text, pending sign-off) | The import is refused with a message naming the limit that was hit. The document is unchanged. | Split or trim the list; re-import. |
| E-I10 | A workbook has several sheets and the first is not the right one | The source card shows a sheet dropdown, defaulting to the first sheet **(proposed** default). | Choose the sheet; the preview re-reads. |
| E-I11 | A workbook has merged cells, or cells showing an error (`#N/A`, `#REF!`) | A merged cell's value imports once, in its first (top-left) position; the other cells of the merge are blank. Error cells import blank. | Fix in the file or in the Review data grid. |
| E-I12 | The user closes the dialog right after reading a file | The read list *is already* the document's data source once the source card shows it; there is no separate "apply" step **(proposed:** the plan's step 1 offers "Change source" and "Remove" on the card, which implies the read applied immediately, but it does not say so). | Undo, or **Remove data source**. |

### 4.2 Fields on the canvas

| ID | Situation | What the user sees | Recovery |
|---|---|---|---|
| E-F1 | A field's column does not exist in the current source, or there is no source at all (after a re-import, a Remove, or in a document opened from elsewhere) | The field appears in the **error tint** in both plan and preview view, wherever it is (page, master, layer). The Preflight tab lists an **error** naming the field and the source; its locate action selects the box. When a source exists, the Review data dialog also shows a warning line above the grid: "2 fields have no matching column: «Zip», «Phone»". | Connect a source that has the column, rename the column in the file and re-import, or delete the field. |
| E-F2 | The user pastes text that looks like a field ("«Name»") | It is ordinary text, not a field, and does not get chip styling or resolve in preview. | Delete it and insert the field from the column list. |
| E-F3 | The user tries to place the caret inside a field, or type into it | The caret lands before or after the field; typing goes beside it, never inside. | None needed. |
| E-F4 | The user presses Backspace or Delete beside a field | The whole field is removed in one keystroke, never partially. | Undo restores it. |
| E-F5 | The user runs Find & Replace with a term that appears in a placeholder, or that would span a placeholder | Placeholders are never matched, counted, or rewritten. A search for "First Name" finds typed occurrences only. | Fields are edited only through the merge controls. |
| E-F6 | A box that holds inline fields is bound to a column from the Map Fields table or the Text tab | The box's content, fields and text alike, is replaced by the single field. | Undo. |
| E-F7 | The user unbinds a box that contains only a field | The box empties but keeps its style, so the next typed text looks right. | Type, or delete the box. |
| E-F8 | A field sits on a master page, on a hidden layer, or on a non-printing layer | It resolves in preview like any other field; visibility follows the layer's rules; Preflight follows its existing hidden / non-print exclusions. | None needed. |
| E-F9 | The user copies, duplicates, or pastes objects containing fields, within or between pages | Fields survive as fields. | None needed. |
| E-F10 | The user selects a column from **Merge field ▾** when nothing is selected and no editing session is open | A new text box appears at the page centre holding just that field. | Move or delete it; undo. |
| E-F11 | The user opens a document that was saved from a Publisher `.pub` import carrying merge placeholders | Any placeholders that the importer brings across appear as unresolved fields (E-F1): reported, not fatal. (The importer produces none today; this is the required behaviour if it later does.) | Connect a source or delete the fields. |

### 4.3 Preview view and record navigation

| ID | Situation | What the user sees | Recovery |
|---|---|---|---|
| E-P1 | A record's cell is empty for a bound column | The field shows as empty text for that record (Publisher's behaviour). A blank line may remain; suppressing it is an Address Block feature (Later). | Fill the cell in Review data, or accept. |
| E-P2 | Fields exist and every record is excluded | Preflight shows a **warning** that nothing would merge. Preview view has no record to show: the navigator reads "0 of 0" and the canvas shows placeholders **(proposed** for the navigator and canvas; the plan defines only the warning). | Include at least one record. |
| E-P3 | The current preview record is excluded, deleted, or no longer exists after a source change | The navigator moves to the nearest included record (the first, after a source change); preview stays on. See §10 question 10 for the plan's own tension on the source-change case. | None needed. |
| E-P4 | The data source is removed while preview is on | Preview turns off; the banner and navigator disappear; placeholders return. | None needed. |
| E-P5 | A long value overflows its text box in preview | The editor's live overflow badge reports it for the record being shown, so the user catches it while stepping through. A "check every record" pass is Later. | Enlarge the box, shorten the value, or reduce the size. |
| E-P6 | The user double-clicks a text box while in preview view | The box opens for editing showing the **placeholders**, not the record's values, since placeholders are what can be edited. When editing ends the box shows values again. | None needed; this is expected. |
| E-P7 | The user looks at page thumbnails or master thumbnails during preview | Thumbnails stay in plan view (placeholders). Only the main canvas shows records. See §10. | None needed. |
| E-P8 | The user closes and reopens the document, or reloads the editor | The document opens in plan view; preview state is not saved. | Turn preview on again. |
| E-P9 | The document has no data source | The **Preview** toggle and record navigator are not shown at all. | Connect a source. |
| E-P10 | The user changes the list's sort while preview is on | The navigator's order and "Record n of N" position follow the new sort; the current record stays current. | None needed. |

### 4.4 Review data dialog

| ID | Situation | What the user sees | Recovery |
|---|---|---|---|
| E-R1 | The user deletes a row that has content | A confirmation before the row is removed. Empty rows are removed without one. | Cancel, or undo afterwards. |
| E-R2 | The user deletes the last remaining row | The list has no records; the header line reads "0 records · 0 included" **(proposed)**; if fields exist, the Preflight warning (E-P2) applies. | Add row, or import again. |
| E-R3 | The user types a find term that matches nothing | "Showing 0 of N" and an empty grid; the filter is view-only, so nothing is excluded. | Clear the find box. |
| E-R4 | The user edits a cell then presses Escape | The cell reverts to its previous value; no undo step is recorded. | None needed. |
| E-R5 | The user edits a cell then clicks away (focus leaves the cell) | The edit commits, as with Enter or Tab. | Undo. |
| E-R6 | The user sorts by a column then changes the data source to one without it | The sort is cleared; the grid shows the new list in file order. | Sort again. |
| E-R7 | A column is bound on the canvas but empty in many rows | The column's header carries the **field** badge; the "Matched" count excludes those rows so the user can see how many records are incomplete. | Fill the cells, exclude the rows, or accept. |
| E-R8 | The user clicks **Change source** or **Remove data source** from the dialog | Change source opens the setup dialog on step 1. Remove asks for confirmation (J11). | Cancel. |
| E-R9 | The user adds a row and leaves it blank | It is an included, blank record: preview shows empty fields for it, and it counts against "Matched". | Fill it in or delete it. |

### 4.5 Setup dialog

| ID | Situation | What the user sees | Recovery |
|---|---|---|---|
| E-S1 | The user opens **Map Fields** or **Preview Records** before any source exists | The steps rail shows them but they are not reachable; only **Select Data Source** is active. | Pick a file. |
| E-S2 | The user opens **Map Fields** in a document with no text boxes | An empty table with a hint to add a text box (or insert a field, which creates one) **(proposed)**. | Add a text box, or use **Merge field ▾**. |
| E-S3 | The user clicks **Generate Sheets** | The step is disabled; its caption explains that merged output lands with print production. Nothing happens. | None; see §7.11. |
| E-S4 | The user presses Escape in any step | The dialog closes; whatever was done (a read list, a binding) stands, since each action applied immediately and is undoable **(proposed;** see E-I12). | Undo if unwanted. |

### 4.6 Saving, compatibility, and data handling

| ID | Situation | What the user sees | Recovery |
|---|---|---|---|
| E-D1 | A `.staples` file saved with a recipient list is opened in an older build of the editor that predates mail merge | The document opens without the list, and the older build has no notion of a field: every field becomes plain text reading «Column», with no tint and no Preflight error. Saving from that build makes the change permanent: the list is dropped and the fields stay literal text. | Reopen the original file in a current build; do not save from the older one. |
| E-D2 | The user shares or hands off a `.staples` file that carries a recipient list | The list travels inside the file, including any personal data. The confirmation on Remove data source and, **(proposed)**, a note on the setup dialog's source card make it clear that the list is part of the document. | **Remove data source** before sharing, if the recipient of the file should not have the list. |
| E-D3 | The user wants the list gone from this machine | **Remove data source** clears it from the document; the editor's recovery copy drops it at its next automatic write; nothing was ever sent anywhere else. Undo can bring the list back until the session ends, and any `.staples` file saved earlier still contains it. | Save again after removing; delete or re-save earlier copies of the file. |
| E-D4 | A cell value begins with `=`, `+`, `-`, `@` (spreadsheet formula prefixes) | It is plain text everywhere in the editor and previews as typed. Should a list export ever exist, such values must be escaped so a downstream spreadsheet does not execute them. | None. |

---

## 5. Functional requirements — data source and list

### 5.1 Data sources

The tool must:

- **MM-DS-1** Accept a recipient list from a `.csv`, `.tsv`, or `.txt` text
  file with comma, tab, or semicolon delimiters, detecting the delimiter
  without asking; handle quoted values, quotes inside quotes, values with
  line breaks, either line-ending convention, and the invisible marker some
  editors put at the start of a file (it must not become part of the first
  header name).
- **MM-DS-2** Accept a recipient list from an `.xlsx` workbook, letting the
  user choose the sheet when there is more than one; read text, numbers,
  dates, booleans, and formula results as text values; import a merged
  cell's value once, in its first position; import error cells as blank.
- **MM-DS-3** Judge the file type by its contents, not its extension.
  **(proposed)** Refuse a file that is neither a workbook nor delimited
  text with a message naming the supported formats (see E-I2).
- **MM-DS-4** Refuse legacy binary `.xls` with a message telling the user to
  save as `.xlsx` or `.csv`. (**Later:** read `.xls` directly.)
- **MM-DS-5** Treat the first non-empty row as the header row (plan §8
  decision 8). Trim header names; make duplicates unique with a numeric
  suffix; name blank headers "Column N". Refuse a file with no header row.
- **MM-DS-6** Drop trailing empty rows; pad short rows with blank cells;
  accept a header-only file as a list with zero records.
- **MM-DS-7** Enforce list size limits and refuse an over-limit file with a
  message naming the limit, leaving the document unchanged. Limit values
  are a product decision pending plan §8 decision 9.
- **MM-DS-8** State the display-format limitation (currency, percent, and
  custom formats not reproduced) at the point of import, behind an info
  icon on the source card (MM-CP-3), with the two remedies (format as text
  in Excel; fix in Review data).
- **MM-DS-9** Show, immediately after reading a file: the file name and
  kind, the sheet (workbooks), the first five rows under their headers, and
  "N records · M columns".
- **MM-DS-10** Allow the data source to be changed (same or different file)
  and removed (with confirmation) from both the setup dialog and the Review
  data dialog.
- **MM-DS-11** Store the recipient list, its source name, its included /
  excluded states, and its sort **in the document**, so a saved file reopens
  with the same list without re-linking (plan §8 decision 2).
- **MM-DS-12** Never send the recipient list anywhere the user did not put
  it: it exists only in the document the user saves and in the editor's
  session recovery copy, and **Remove data source** clears both.
- **MM-DS-13 (Out)** Outlook contacts and Access databases: not reachable
  from the browser; recorded as intentionally unavailable.
- **MM-DS-14 (Later)** Start a new blank list and define its columns in the
  editor.
- **MM-DS-15 (conflicts with plan)** Retain leading zeros. A value that
  Excel shows with leading zeros, such as a ZIP code, must import exactly as
  shown ("02134"), whether the cell holds text or a number with a
  zero-padding display format; a CSV value "02134" must stay "02134". This
  falls under "every cell is text" (MM-RC-3), and it is called out because
  Publisher handled it badly and ZIP codes are the store's most common
  merge column. The plan's §4.3 currently excludes leading zeros from v1;
  see §10 question 12.

### 5.2 Records and columns

The tool must:

- **MM-RC-1** Give each record a stable identity that survives sorting,
  excluding, and editing, so that "the current record" and undo history
  refer to the same row throughout.
- **MM-RC-2** Keep column names fixed from import to the next import, so a
  field never silently changes meaning. (**Later:** rename columns.)
- **MM-RC-3** Treat every cell as text. What the user sees in the grid is
  what previews and what will output.
- **MM-RC-4** Support a saved sort on one column, ascending or descending,
  that defines preview order and future output order; clear it if a source
  change removes the column.
- **MM-RC-5** Support per-record include / exclude; excluded records stay
  in the list, are skipped by preview and output, and can be re-included.
- **MM-RC-6** Expose "N records · M included · Matched K" wherever the list
  is summarised (Review data header, Preview Records step), with Matched as
  defined in §2.

---

## 6. Functional requirements — fields on the canvas

### 6.1 Placing fields

The tool must:

- **MM-FD-1** Offer a list of the source's columns from **Merge field ▾**
  (Insert band) and **Insert field ▾** (Text tab, Mail merge section).
- **MM-FD-2** Insert a field **at the caret** when a text box is being
  edited, in the surrounding text's style, and keep the editing session
  open afterwards; if the caret has left the box, place the field where the
  caret last was, or at the end of the text.
- **MM-FD-3** Append a field to the **end** of a selected text box's text
  when the box is selected but not being edited.
- **MM-FD-4** Create a new text box at the centre of the current page
  holding just the field when nothing is selected.
- **MM-FD-5** Bind a whole text box to a column from the Text tab
  (**Bind box to column ▾**) and from the setup dialog's Map Fields table:
  replace the box's content with the single field, keeping the box's
  dominant style and first-paragraph alignment.
- **MM-FD-6** Unbind a box from Map Fields ("— none —", or **Unbind all**
  for a mixed box), and remove individual fields from the Text tab's field
  list; an emptied box keeps its style.
- **MM-FD-7** Show the current binding and list the box's fields, each
  with a remove control, in the Text tab for the edited-or-selected box.
- **MM-FD-8** List every text box on pages and masters in Map Fields, with
  the same labelling the Preflight tab uses to name objects, a column
  dropdown per box, "— none —" to unbind, and for boxes that mix fields and
  typed text the dropdown value "Custom (n fields)" with **Unbind all**
  beside it **(proposed** that the dropdown remains; see J3 step 4).
- **MM-FD-9** Make binding, unbinding, and every field insertion a single
  undo step (an at-caret insertion joins its editing session's step).
- **MM-FD-10 (Later)** Address Block and Greeting Line helpers that insert a
  sequence of fields and punctuation in one action.
- **MM-FD-11 (Later)** Per-field formatting switches (as entered, UPPER,
  lower, Title Case; number and date formats).
- **MM-FD-12 (Later)** Picture fields (image swapped per record), catalog /
  repeating regions, and conditional content.

### 6.2 How fields look and behave

The tool must:

- **MM-FB-1** Display a field in plan view as **«Column»** with a light tint
  and dotted underline, in the surrounding text's own font, size, and color,
  so it is recognisable as a field without looking foreign to the text.
- **MM-FB-2** Display an **unresolved** field in the error tint in both plan
  and preview view, wherever it appears.
- **MM-FB-3** Treat a field as atomic in editing: the caret lands before or
  after it, Backspace/Delete removes it whole, typing never lands inside.
- **MM-FB-4** Let the text box's ordinary controls (Home band, Text tab,
  keyboard shortcuts) style fields exactly as they style text: font, size,
  color, bold/italic/underline, alignment.
- **MM-FB-5** Treat pasted text that resembles a placeholder as literal
  text.
- **MM-FB-6** Preserve fields through copy, paste, duplicate, master pages,
  and layer operations.
- **MM-FB-7** Exclude fields from Find & Replace matching, counting, and
  replacement; a query that would span a placeholder finds nothing.
- **MM-FB-8** Show fields in thumbnails as their plain placeholder label
  (no chip, never a record value).

---

## 7. Functional requirements — preview, review, setup, validation, output

### 7.1 Preview view

The tool must:

- **MM-PV-1** Provide a **Preview** toggle in the status bar (beside the
  single / spread view controls), shown only when a data source exists.
- **MM-PV-2** In preview view, show every field on the main canvas as the
  current record's value, with no chip styling, so the page looks like the
  output.
- **MM-PV-3** Show a thin banner over the canvas reading "Previewing record
  n of N · Return to plan view", visually distinct from the master-page
  banner, so preview cannot be mistaken for the layout.
- **MM-PV-4** Treat preview as a viewing choice, not part of the document:
  never an undo step, never saved with the document; a reopened document
  starts in plan view.
- **MM-PV-5** Show an empty cell as empty text.
- **MM-PV-6** When a box is opened for editing during preview, show the
  placeholders (not values); show values again when editing ends.
- **MM-PV-7** Report text overflow for the record currently shown through
  the existing overflow badge. (**Later:** a check across all records.)
- **MM-PV-8** Turn preview off when the data source is removed.
- **MM-PV-9** Keep thumbnails in plan view during preview (see §10).

### 7.2 Record navigation

The tool must:

- **MM-NV-1** Show, when preview is on, a status-bar navigator
  **⏮ ◀ Record n of N ▶ ⏭** over the included records in sort order.
- **MM-NV-2** Offer **Exclude** for the current record from the navigator,
  moving to the nearest included record afterwards; re-including happens in
  Review data (see §10 question 11).
- **MM-NV-3** Offer **Edit list** from the navigator, opening Review data.
- **MM-NV-4** Move to the nearest included record whenever the current one
  is excluded, deleted, or absent after a source change.
- **MM-NV-5 (proposed)** Show "0 of 0" and placeholders when no record is
  included.
- **MM-NV-6** Meet "Find recipient" in v1 through **Edit list** and the
  Review data find box (MM-RV-5); the navigator itself has no find control.

### 7.3 Review data dialog

The tool must:

- **MM-RV-1** Open from the **Review data** tile and the navigator's **Edit
  list**; present the same grid, without the header actions, as the setup
  dialog's Preview Records step.
- **MM-RV-2** Show a header with source name, sheet, "N records · M included
  · Matched K", **Change source**, and **Remove data source**.
- **MM-RV-3** Show a grid with an include checkbox per row and one column
  per header, scrolling within a fixed-height body.
- **MM-RV-4** Sort by clicking a column header (saved with the document).
- **MM-RV-5** Filter the rows shown with a find box (any column,
  case-insensitive, view-only, with an "X of N" count).
- **MM-RV-6** Edit a cell in place: click to edit; Enter, Tab, or clicking
  away commits; Escape reverts; one undo step per commit.
- **MM-RV-7** Add a row (empty, included, at the end) and delete the focused
  row (confirm when it has content).
- **MM-RV-8** Mark columns bound on the canvas with a **field** badge in
  their header.
- **MM-RV-9** Show a warning line above the grid listing unresolved fields
  on the canvas by name.
- **MM-RV-10** Offer **Preview on canvas**, which closes the dialog and
  opens preview at the focused row.
- **MM-RV-11** Make every list edit undoable from the editor's normal undo /
  redo.
- **MM-RV-12 (Later)** Filter by column value, find duplicates, validate
  addresses.

### 7.4 Mail Merge Setup dialog

The tool must:

- **MM-ST-1** Present a steps rail **Select Data Source → Map Fields →
  Preview Records → Generate Sheets**, matching the `mail-merge-setup`
  figma frame, with steps reachable in any order once a source exists.
- **MM-ST-2** Step 1: drop zone and file picker; source card; first five
  rows; counts; the display-format info icon (MM-DS-8); the error messages
  in §4.1; Change source; Remove.
- **MM-ST-3** Step 2: the Map Fields table (MM-FD-8).
- **MM-ST-4** Step 3: the Review data grid with the "Matched: K of N"
  readout and **Preview on canvas**.
- **MM-ST-5** Step 4: shown but disabled, captioned "Merged output lands
  with print production".
- **MM-ST-6 (proposed)** Apply each action immediately and undoably;
  closing the dialog (Escape or close control) never discards or applies
  anything further (see E-I12).
- **MM-ST-7** Open from the **Data source** tile and from **Change source**.

### 7.5 Where the controls live

Per `docs/UI_LAYOUT_REDESIGN_PLAN.md` decisions 1 and 7 (no Mailings menu;
inspector tabs fixed at Page / Text / Layers / Preflight) and plan §8
decision 4, the tool must place mail merge on existing surfaces only:

- **MM-UI-1** Insert band: a **Mail merge** group with **Data source**,
  **Merge field ▾**, and **Review data** tiles; the latter two disabled with
  a tooltip until a source exists.
- **MM-UI-2** Text tab: a **Mail merge** section beneath the typography
  controls, shown when a text box is targeted and a source is loaded.
- **MM-UI-3** Status bar: the Preview toggle and record navigator.
- **MM-UI-4** Canvas: field chips and the preview banner.
- **MM-UI-5** Two dialogs: Mail Merge Setup and Review data.
- **MM-UI-6** Preflight tab: the merge rules, located like any other issue.
- **MM-UI-7** No new menu, no new inspector tab. A request for either
  re-opens the redesign plan's decisions and is a stop-and-ask.

### 7.6 Validation (Preflight)

The tool must:

- **MM-VL-1** Raise an **error** for each unresolved field (column missing
  from the source, or no source), titled to say the merge field has no
  column, naming the field and the source, located like other issues, with
  a locate action that selects the box.
- **MM-VL-2** Raise a **warning** when fields exist and every record is
  excluded (nothing would merge).
- **MM-VL-3** Follow the Preflight tab's existing hidden-layer and
  non-printing-layer exclusions.
- **MM-VL-4 (Later)** Warn when any record's value would overflow a bound
  text box.

### 7.7 Undo, history, and persistence

The tool must:

- **MM-HS-1** Record as undo steps: import / change / remove source, cell
  edits, include / exclude, sort, add / delete row, field insertion, bind,
  unbind.
- **MM-HS-2** Never record as undo steps: turning preview on or off,
  stepping records, the find-box filter, opening or closing dialogs.
- **MM-HS-3** Save with the document: source name and sheet, records with
  included state, sort, fields. Never save: preview state, the find filter.
- **MM-HS-4** Carry the same set through the editor's session recovery
  copy.

### 7.8 Interaction with existing features

The tool must:

- **MM-IX-1** Keep Find & Replace from touching fields (MM-FB-7).
- **MM-IX-2** Preserve any Publisher merge placeholders a `.pub` import
  brings across as unresolved fields, reported by Preflight rather than
  failing the import.
- **MM-IX-3** Round-trip lists and fields through save and open of
  `.staples` files. An older build that predates mail merge opens the
  document without the list and with every field as plain text reading
  «Column»; saving from that build makes both permanent (E-D1).
- **MM-IX-4** Leave the photo editor, templates, and picker untouched.
- **MM-IX-5** Keep the text box's overflow badge, master pages, layers,
  clipboard, and duplicate behaviours unchanged for boxes that contain
  fields.

### 7.9 Privacy and data handling

Per `docs/SECURITY_CONSIDERATIONS.md` §2.4, the tool must:

- **MM-PR-1** Process the list without sending it to any service; it lives
  only in the document and the session recovery copy.
- **MM-PR-2 (proposed)** Make the user aware, at import and at removal,
  that the list is part of the document they save and share. The plan
  requires that removal confirms; the confirmation's wording and the note
  at import are this document's additions.
- **MM-PR-3** Clear the list completely on **Remove data source**, from the
  document and from the recovery copy.
- **MM-PR-4** Keep no history of past lists beyond the editor's ordinary
  undo history for the session.
- **MM-PR-5** Should any list export be added later, escape spreadsheet
  formula prefixes so exported values cannot execute in a spreadsheet.

### 7.10 Accessibility and input (proposed)

The plan is silent on these; they restate the editor's existing conventions
for new controls. The tool must:

- **MM-AC-1** Make every merge control reachable by keyboard: the column
  lists, the navigator buttons, grid cells, checkboxes, and dialog steps.
- **MM-AC-2** Close dialogs with Escape, matching the editor's other
  dialogs.
- **MM-AC-3** Distinguish fields from text by more than color alone (the
  dotted underline and guillemets carry the meaning in plan view; the
  banner carries it in preview view).
- **MM-AC-4** Label navigator and tile controls for assistive technology in
  the same manner as the existing status-bar and ribbon controls.

### 7.11 Output (deferred, user-facing expectation only)

- **MM-OT-1 (Out of this plan)** Print, PDF, and "merge to new publication"
  for every included record, one copy per record in sort order, with
  non-printing layers excluded. Until the print-production slice exists,
  the Generate Sheets step is visible and disabled with the caption in
  MM-ST-5 and is recorded as intentionally inert.
- **MM-OT-2** Everything the user sets up in v1 (list, sort, inclusions,
  fields) is what output will consume; no re-setup will be needed when
  output lands.

### 7.12 Copy and guidance (simplified UI)

The tool must:

- **MM-CP-1** Keep every label, caption, button, and message short,
  friendly, and plain-language: a few words for controls, one sentence for
  messages. No print-industry or spreadsheet jargon.
- **MM-CP-2** Show no paragraph-length instructions anywhere in the
  feature: not in the setup dialog's steps, the source card, the Review
  data header, the preview banner, or the Preflight issue text.
- **MM-CP-3** Put anything that needs more than a sentence behind an
  **info icon** that opens a popover, so the surface itself stays clean.
  Candidates: the display-format limitation (MM-DS-8), the header-row
  assumption (MM-DS-5), what "Matched" counts, the size limits, why
  Generate Sheets is disabled, and what Remove data source removes.
- **MM-CP-4** Write each error message as what happened and the one next
  step ("This workbook is the old .xls format. Save it as .xlsx or .csv
  and try again."), never a list of possibilities.
- **MM-CP-5** Use the same info-icon and popover treatment the rest of the
  editor uses, so users learn it once.

---

## 8. User expectations

Users expect:

- **It works like Publisher's Mailings tab.** Pick a list, insert fields,
  preview results, exclude a recipient, and later print. The words and the
  order are familiar even though the buttons live in different places.
- **The design stays theirs.** Fields take the box's font, size, color, and
  alignment; nothing about the layout changes when a list is connected,
  changed, or removed.
- **Preview is safe.** Looking at records never edits anything; leaving
  preview puts the placeholders back.
- **Mistakes are visible, not silent.** A field without a column, an empty
  list, a refused file, a value that overflows: each is flagged where they
  are looking, with the next step spelled out.
- **The list is theirs to fix.** A typo in a customer name is corrected in
  the grid, not by re-exporting from Excel, and undo covers it.
- **Files are self-contained.** A saved job reopens with its list and
  fields intact, on any machine, with no "where is customers_q4.xlsx?"
  prompt.
- **Personal data does not leak.** The list goes only where the file goes,
  and Remove really removes it.
- **Honest about what is missing.** The output step says plainly that it is
  not built yet rather than pretending or hiding.
- **ZIP codes come through intact.** "02134" in the spreadsheet is "02134"
  on the postcard. Publisher lost the zero; this tool must not.
- **It does not lecture.** Short labels, one-line messages, and an info icon
  for anyone who wants the longer story.

---

## 9. Out of scope and deferred (for the record)

| Capability | Disposition | What the user sees in v1 |
|---|---|---|
| Print / PDF / merge-to-new-publication output | Out of this plan | Generate Sheets step, disabled with caption (MM-ST-5). |
| Outlook contacts, Access databases | Out | Not offered; recorded as intentionally unavailable. |
| Legacy binary `.xls` | Later | Refused with "save as .xlsx or .csv". |
| Type a new list in the editor | Later | Import a file first; the grid then edits it. |
| Address Block, Greeting Line | Later | Insert fields and punctuation by hand. |
| Field formatting switches (case, number, date) | Later | Format in the file or fix in the grid. |
| Filter by column value, find duplicates, validate addresses | Later | Use the find box and include/exclude by hand. |
| Picture fields, catalog / repeating merge, conditional content | Later | Not offered. |
| Overflow check across all records | Later | Overflow badge on the record being previewed. |
| Rename columns after import | Later | Rename in the file and re-import. |
| Blank-line suppression for empty cells | Later (with Address Block) | Empty cell shows as empty text. |
| Excel currency and percent display formats | Limitation, stated at import | "$1,200.00" imports as "1200"; fix in Excel or in the grid. Leading zeros are **not** part of this limitation (MM-DS-15). |
| Preview driving page thumbnails | Open (this document and the plan say no) | Thumbnails stay in plan view. |

---

## 10. Open questions (product-level)

These are the decisions in `docs/MAIL_MERGE_PLAN.md` §8–§9 that change what
the user sees, restated from the user's side, plus this document's own
additions.

1. **What does "Matched: K of N" count?** This document uses K = included
   records in which every column bound on the canvas has a value (plan §8
   decision 7) and N = all records in the list (proposed; the plan does not
   define N). The figma frame's "847 of 1,203" could also mean records that
   pass a filter, or records with a complete address. Needs the frame or a
   screenshot.
2. **What does Map Fields map?** This document assumes column ↔ text box
   (plan §9). Publisher's equivalent maps columns ↔ a fixed set of address
   parts. If the frame shows the latter, §3 J3 step 4 and MM-FD-8 change.
3. **First row is always the header.** No "first row has headers" toggle in
   v1 (plan §8 decision 8). Is a title line above the table common enough
   in store lists to need the toggle in v1 rather than later?
4. **Size limits.** Proposed 2,000 records / 60 columns / 500 KB of cell
   text (plan §8 decisions 2 and 9). What is a typical and a largest job for
   a store? The refusal message (E-I9) depends on the final numbers.
5. **Should thumbnails follow preview?** This document says no (MM-PV-9).
6. **Confirmation prompts.** Remove data source and delete a row with
   content confirm; change source does not (it is undoable). Is that the
   right balance for associates at the counter?
7. **Excel display formats other than leading zeros.** Leading zeros are
   now required (MM-DS-15, question 12). Is "fix in Excel or in the grid"
   acceptable for currency and percent columns, or must v1 reproduce
   Excel's displayed text for those too (plan §8 decision 3 alternative)?
8. **Sample lists.** Excel-authored lists from a store would let these
   requirements be checked against real headers, formats, and sizes.
9. **Proposed behaviours to confirm.** The items tagged **(proposed)** in
   this document: N in "Matched: K of N" (§2); the Map Fields dropdown
   staying visible for a mixed box (J3, MM-FD-8); preview opening on the
   first included record (J6); header click reversing sort direction (J7);
   old include state and cell edits not carrying over on change source
   (J8); the Remove confirmation's wording and a note at import that the
   list becomes part of the document (J11, E-D2, MM-PR-2); refusing a file
   that is neither a workbook nor delimited text (E-I2, MM-DS-3); the sheet
   dropdown defaulting to the first sheet (E-I10); a read list applying
   immediately with no separate apply step (E-I12, E-S4, MM-ST-6); the
   navigator and canvas when no record is included (E-P2, MM-NV-5); the
   empty-list header line (E-R2); the empty Map Fields hint (E-S2); the
   accessibility conventions in §7.10.
10. **Preview across a source change.** Plan §4.4 says a record "filtered
    out by a re-import" moves the navigator to the nearest included record
    (preview stays on); plan §4.8 says changing the source "clears the
    preview state" (preview turns off). This document follows §4.4 (J8,
    E-P3, MM-NV-4). The plan should reconcile the two.
11. **Exclude as a toggle.** Plan §4.4 calls the navigator's control an
    "Exclude toggle", but the navigator moves off an excluded record, so
    there is nothing to toggle back. This document treats it as a one-way
    Exclude with re-include in Review data (J6, MM-NV-2). If the navigator
    should also re-include, it must be able to show an excluded record.
12. **Leading zeros: requirement versus plan.** The product owner requires
    (MM-DS-15, E-I13): "When the data is a zip code, the leading zero in
    the excel doc must be retained." The plan's §4.3 says: "**Known
    limitation, stated in the dialog:** Excel *display* formats (currency
    symbols, leading zeros, percent) are not reproduced in v1 — format the
    column as text in Excel or fix it in the review grid." These cannot
    both hold. The requirement stands; the plan's §4.3 and §8 decision 3
    (the reader's supported subset, or its alternative) must be revised to
    honour zero-padding formats before M0 starts. How it is honoured is the
    plan's decision, not this document's.

---

## 11. Traceability

| Requirement group | Plan section | Publisher yardstick (§7.1) |
|---|---|---|
| MM-DS (data sources) | §4.3, §8 decisions 2, 3, 8, 9 | Excel workbooks; CSV files; Outlook / Access (Out) |
| MM-RC (records, columns) | §4.1, §4.8 | Recipient sorting; recipient filtering (Later) |
| MM-FD / MM-FB (fields) | §4.2, §4.7, §4.9, §4.11, §8 decision 5 | Merge fields; address blocks and greeting lines (Later); field formatting (Later) |
| MM-PV / MM-NV (preview, navigation) | §4.4 | Preview merged records; find recipient (via Review data) |
| MM-RV (review data) | §4.5 | Edit recipient list; recipient sorting |
| MM-ST (setup dialog) | §4.6 | Select recipients; the figma `mail-merge-setup` frame |
| MM-UI (placement) | §4.7, §8 decision 4 | Redesign plan decisions 1 and 7 |
| MM-VL (validation) | §4.10 | "Invalid or missing fields should be flagged" |
| MM-HS (undo, persistence) | §4.8, §4.11 | — |
| MM-IX (existing features) | §4.11 | Import of Publisher merge placeholders |
| MM-PR (privacy) | §4.3 Security | `SECURITY_CONSIDERATIONS.md` §2.4 |
| MM-OT (output) | §4.11, §8 decision 6 | Generate merged publications; print; PDF (Out of this plan) |
