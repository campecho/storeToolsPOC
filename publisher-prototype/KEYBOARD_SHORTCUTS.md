# Keyboard shortcuts

The prototype's keyboard surface in three layers: the single letters that activate a
tool, the editing keys that act on a selection, and the modifiers held during a pointer
gesture. Every binding traces to a tool's `shortcut` field or to a registry gesture
clause (PLAN.md §4, §5) — the registry is the source and this file is a reading of it,
so `src/shell/keyboardShortcuts.test.ts` fails CI when the two disagree.

**Status**, used throughout:

- **Wired** — the key does the thing today. `src/shell/wiredTools.ts` names the wired
  set; PLAN.md §7 sequences the rest.
- **Specified** — the registry names the clause and the dev team implements it. The tool
  still selects, from the dock and from its letter where it has one; the canvas behavior
  behind it is not built. Nothing marked Specified is a promise the running app keeps.

---

## 1. Tool activation

One bare letter per keyed tool, scoped to the current mode. Eight layout tools carry no
letter and are reached from the dock only — the `—` rows below.

### Layout mode

| Key | Tool | Registry id | Status |
| :-- | :--- | :---------- | :----- |
| `V` | Select | `select` | Wired |
| `A` | Node select | `node-select` | Specified |
| `T` | Text frame | `text-frame` | Specified |
| — | Link text | `link-text` | Specified |
| `P` | Picture frame | `picture-frame` | Specified |
| `C` | Crop | `crop` | Specified |
| — | Table | `table` | Specified |
| `R` | Rectangle | `rect` | Wired |
| `U` | Rounded rectangle | `rounded-rect` | Wired |
| `E` | Ellipse | `ellipse` | Wired |
| `L` | Line | `line` | Wired |
| — | Arrow | `arrow` | Wired |
| — | Star / polygon | `star-polygon` | Wired |
| — | Callout | `callout` | Wired |
| — | Banner | `banner` | Wired |
| `G` | Pen / freeform | `pen` | Wired |
| `D` | Fill & gradient | `fill-gradient` | Specified |
| `I` | Eyedropper | `eyedropper` | Specified |
| `J` | Guide | `guide` | Specified |
| — | Merge field | `merge-field` | Specified |
| — | Building block | `building-block` | Specified |
| `Z` | Zoom | `zoom` | Wired |
| `H` | Pan | `pan` | Wired |

### Photo mode

| Key | Tool | Registry id | Status |
| :-- | :--- | :---------- | :----- |
| `Z` | Zoom | `zoom` | Wired |
| `H` | Pan | `pan` | Wired |
| `C` | Crop & straighten | `photo-crop` | Specified |
| `A` | Adjust | `photo-adjust` | Specified |
| `B` | Mask brush | `mask-brush` | Specified |
| `M` | Mask marquee | `mask-marquee` | Specified |
| `T` | Text overlay | `text-overlay` | Specified |
| `I` | Image overlay | `image-overlay` | Specified |
| `E` | Eyedropper | `photo-eyedropper` | Specified |

Five rules govern the letters (`src/shell/App.tsx`):

- **Not every tool has one.** Link text, Table, Arrow, Star / polygon, Callout, Banner,
  Merge field and Building block are dock-only: their contract carries `shortcut: null`,
  the dock renders no parenthetical after the label, and no keystroke reaches them. That
  leaves `B` `K` `M` `N` `O` `Q` `S` and `W` unassigned in layout mode — `B` and `M`
  still carry the mask tools in photo mode.
- **Bare letters only.** The handler returns early while Ctrl, Cmd or Alt is held, so
  `Ctrl`+`G` groups a selection without also arming the pen. Shift is *not* checked and
  the compare is case-insensitive, so `Shift`+`R` selects the rectangle exactly as `R`
  does — worth knowing before Shift is given a meaning of its own here.
- **Never while typing.** Events targeting an input, textarea or select are skipped
  (`src/shell/isTextEntryTarget.ts`) — the same guard Space-pan uses.
- **Scoped to the mode.** Five letters name one tool in layout and a different one in
  photo (`A` `C` `E` `I` `T`); only tools visible in the current mode match. `Z` and `H`
  mean the same thing in both.
- **No off switch.** Single-key activation with no way to disable, remap or scope it is
  a known WCAG 2.1.4 (Character Key Shortcuts) failure, deferred deliberately — SEAMS.md
  carries the entry, the reason, and what the conformant fix costs.

---

## 2. Document and view chords

Chords that belong to no tool: they work whatever is armed, and none of them needs a
selection to exist first (`src/core/registry/globalKeys.ts`,
`src/shell/useGlobalKeys.ts`).

| Keys | Effect | Clause | Status |
| :--- | :----- | :----- | :----- |
| `Ctrl`/`Cmd` + `Z` | Undoes one committed gesture or panel edit | `document.ctrl-z.undoes` | Wired |
| `Ctrl`/`Cmd` + `Shift` + `Z`, or `Ctrl`/`Cmd` + `Y` | Redoes it | `document.ctrl-shift-z.redoes` | Wired |
| `Ctrl`/`Cmd` + `A` | Selects every unlocked object on the page | `document.ctrl-a.selects-all` | Wired |
| `Ctrl`/`Cmd` + `Shift` + `A` | Clears the selection | `document.ctrl-shift-a.deselects` | Wired |
| `Ctrl`/`Cmd` + `C` | Copies the selection | `document.ctrl-c.copies-selection` | Wired |
| `Ctrl`/`Cmd` + `X` | Copies it, then deletes it | `document.ctrl-x.cuts-selection` | Wired |
| `Ctrl`/`Cmd` + `V` | Pastes the clipboard, offset and selected | `document.ctrl-v.pastes-clipboard` | Wired |
| `Ctrl`/`Cmd` + `D` | Duplicates the selection in place, offset | `document.ctrl-d.duplicates-selection` | Wired |
| `Ctrl`/`Cmd` + `S` | Saves to the document's `.staples` file, silently; falls through to Save As with no file yet | `document.ctrl-s.saves-file` | Wired |
| `Ctrl`/`Cmd` + `Shift` + `S` | Saves As — the picker starts in the default storage folder | `document.ctrl-shift-s.saves-file-as` | Wired |
| `Ctrl`/`Cmd` + `O` | Opens a `.staples` file, replacing the working document | `document.ctrl-o.opens-file` | Wired |
| `Ctrl`/`Cmd` + `0` | Fits the whole page, bleed included | `viewport.ctrl-zero.fits-page` | Wired |
| `Ctrl`/`Cmd` + `=` (or `+`) | Zooms in one preset step | `viewport.ctrl-plus.steps-in` | Wired |
| `Ctrl`/`Cmd` + `-` | Zooms out one preset step | `viewport.ctrl-minus.steps-out` | Wired |

What the table can't say:

- **The clipboard is the app's own, not the system's.** Copying here puts nothing on the
  operating system's clipboard and pasting reads nothing from it, so objects do not
  travel to or from another application. Image paste from outside is a separate,
  unbuilt clause on the picture frame (`picture-frame.paste.inserts-from-clipboard`).
- **A cut is a copy plus a delete**, and only the delete is a history entry: undoing a
  cut restores the objects and leaves the clipboard still holding them.
- **Pasting mints fresh ids every time**, so pasting twice gives two independent sets,
  and each paste of the same contents steps further down and right than the last —
  otherwise the second would hide under the first. A group copied whole pastes as a
  group; a group only partly selected does not (`copiedGroups`).
- **Select all, paste and duplicate hand the page to the Select tool**, exactly as
  finishing a drawing does. Selection chrome draws under Select only, so without the
  switch a selection made from the keyboard would look like nothing had happened.
- **Undo covers the document, never the view.** Zoom and pan never entered history
  (PLAN.md §6.3), so `Ctrl`+`Z` after a zoom steps back over whatever edit preceded it.
- **No chord fires mid-drag.** While a pointer button is down a gesture may be in
  flight, and its preview lives outside the store — a chord that edited the document
  under it would leave the gesture to commit against a page that had moved. Release
  first and the chord works normally.
- **Every chord here is preventDefault-ed** when it fires — these are the browser's
  chords too, and a duplicate that also opens a bookmark dialog is worse than no
  binding. Like the tool letters, none of them fires while a form field has focus.
- **The file chords finish asynchronously.** Save, Save As and Open run through the
  StorageProvider seam (PLAN.md §6.9) — a picker may appear, a permission may need
  re-affirming — and the `file/` action commits when the IO completes, never on the
  keypress. Cancelling a picker commits nothing. On the download/upload fallback tier
  there is no retained handle, so `Ctrl`+`S` behaves as Save As every time.

---

## 3. Editing keys

Canvas focus, no text field involved.

| Keys | Does | Tool | Clause | Status |
| :--- | :--- | :--- | :----- | :----- |
| `Esc` | Cancels the gesture in flight and restores the geometry it started from | any | `select.esc.cancels-drag` and each draw tool's `*.esc.cancels-draw` | Wired |
| `Esc` | Discards the pen draft between presses | Pen | `pen.esc.discards-path` | Wired |
| `Enter` | Finishes the open pen path | Pen | `pen.double-click.commits-open-path` | Wired |
| `Delete` / `Backspace` | Removes the selected objects; locked ones stay | Select | `select.delete.removes-selection` | Wired |
| Arrow keys | Nudges the selection by the options-bar increment (default 0.1 in) | Select | `select.arrow.nudges` | Wired |
| `Shift` + arrow keys | Nudges by ten times that increment | Select | `select.shift-arrow.nudges-coarse` | Wired |
| `Ctrl`/`Cmd` + `G` | Groups the selection; an existing group becomes a child, not a flattening | Select | `select.ctrl-g.groups-selection` | Wired |
| `Ctrl`/`Cmd` + `Shift` + `G` | Ungroups one nesting level | Select | `select.ctrl-shift-g.ungroups-selection` | Wired |
| `Esc` | Exits text editing | Text frame | `text-frame.esc.exits-text-edit` | Specified |
| `Esc` | Steps the selection outward: cell → table → object | Table | `table.esc.steps-selection-outward` | Specified |
| `Tab` | Adds a row below from the last cell | Table | `table.tab.adds-row` | Specified |
| `Enter` | Applies the crop and leaves crop mode | Crop, Crop & straighten | `crop.enter.exits-crop-mode`, `photo-crop.enter.applies-crop` | Specified |
| `Delete` | Removes the selected node | Node select | `node-select.delete.removes-node` | Specified |
| `Esc` | Leaves node editing for object selection | Node select | `node-select.esc.exits-to-object` | Specified |
| `Esc` | Drops whatever is pending — a link, an insert, a placement, a sample | Link text, Merge field, Building block, Eyedropper | `link-text.esc.cancels-pending-link`, `merge-field.esc.cancels-insert`, `building-block.esc.cancels-placement`, `eyedropper.esc.drops-sample` | Specified |
| `[` / `]` | Steps the brush size down / up | Mask brush | `mask-brush.bracket.resizes-brush` | Specified |

Two details the table can't carry:

- **Key repeat is one nudge per keydown**, each its own history entry — holding an arrow
  down walks the selection in undoable steps rather than accumulating one giant move.
- **`Delete` and `Backspace` are swallowed even with nothing selected.** Backspace still
  navigates back in some browsers, and an empty selection is no reason to leave the page.

---

## 4. Modifiers held during a gesture

| Held | During | Effect | Status |
| :--- | :----- | :----- | :----- |
| `Shift` | drawing a shape | Constrains to a square, circle or regular polygon | Wired for the shape tools, Specified for text and picture frames |
| `Alt` | drawing a shape | Draws from the center rather than a corner | Wired for the shape tools, Specified for text and picture frames |
| `Shift` | drawing a line or arrow | Snaps the segment to 45° | Wired |
| `Shift` | moving a selection | Constrains travel to the nearest 45°, chosen live — turning the drag changes the axis | Wired |
| `Alt` | moving a selection | Leaves the originals and drops a copy; the copy cursor appears while Alt is held, before the drag starts | Wired |
| `Shift` | dragging a resize handle | Preserves proportions | Wired |
| `Shift` | dragging the rotation handle | Snaps the resulting angle to 15° | Wired |
| `Shift` | dragging a line endpoint | Snaps that segment to 45° | Wired |
| `Shift` | clicking | Adds to the selection, or removes an object already in it | Wired |
| `Alt` | clicking | Selects the next object beneath, cycling through overlaps | Wired |
| `Alt` | clicking with Zoom | Steps out instead of in | Wired |
| `Space` | any tool | Temporary pan while held; losing window focus releases it | Wired |
| `Shift` | dragging a guide | Snaps to ruler ticks | Specified |
| `Alt` | painting a mask | Erases instead of painting | Specified |

Snap angles live in `src/core/gestures/constants.ts` — 45° for move and line, 15° for
rotate. The rotate value is an `ASSUMPTION` flagged for SME review, not a settled number.

---

## 5. Wheel and trackpad

| Input | Effect | Clause | Status |
| :---- | :----- | :----- | :----- |
| Wheel | Scrolls the viewport vertically | `pan.wheel.scrolls` | Wired |
| `Shift` + wheel | Scrolls horizontally | `pan.wheel.scrolls` | Wired |
| `Ctrl`/`Cmd` + wheel | Zooms about the pointer | `zoom.wheel.ctrl-zooms-at-cursor` | Wired |

Zoom is delta-proportional, so a trackpad's micro-events don't compound a full step each.

---

## 6. Fields and panels

`Enter` commits a number field's edit run and `Escape` reverts it — a run is one history
entry however many keystrokes it took (`src/shell/panels/NumberField.tsx`). The debug
bar's zoom field applies on `Enter`. While any field holds focus, tool letters and
Space-pan stay silent.

---

## 7. Parity with Publisher, Photoshop and Illustrator

The comparison supplied for review is reproduced below with a fourth column: what this
prototype does. It is worth reading the verdicts against one fact — the list describes
applications with a ribbon or menu bar, a file layer and a text engine, and this
prototype has none of the three by design (PLAN.md §2: three regions, no header, no
menus; §6.4 puts the text engine in a later phase). Most "missing" rows are out of
scope, not overlooked.

*Publisher is Windows-only, so its column uses Windows modifiers. In the prototype
column, `Ctrl`/`Cmd` means the binding accepts either.*

### General file management

| Action | Microsoft Publisher | Adobe Photoshop | Adobe Illustrator | This prototype |
| :--- | :--- | :--- | :--- | :--- |
| **New Document** | `Ctrl` + `N` | `Ctrl` + `N` | `Ctrl` + `N` | Out of scope — the Minimal fixture stands in |
| **Open Document** | `Ctrl` + `O` | `Ctrl` + `O` | `Ctrl` + `O` | `Ctrl`/`Cmd` + `O` — Wired (`document.ctrl-o.opens-file`) |
| **Save** | `Ctrl` + `S` | `Ctrl` + `S` | `Ctrl` + `S` | `Ctrl`/`Cmd` + `S` — Wired (`document.ctrl-s.saves-file`) |
| **Save As...** | `F12` | `Ctrl` + `Shift` + `S` | `Ctrl` + `Shift` + `S` | `Ctrl`/`Cmd` + `Shift` + `S` — Wired (`document.ctrl-shift-s.saves-file-as`) |
| **Print** | `Ctrl` + `P` | `Ctrl` + `P` | `Ctrl` + `P` | Out of scope — export is a SURFACE seam |
| **Close Document** | `Ctrl` + `W` or `Ctrl` + `F4` | `Ctrl` + `W` | `Ctrl` + `W` | Out of scope |

Since PLAN.md §6.9 brought local device storage into the model, Open, Save and Save As
are real product surface: `.staples` files on the device through the StorageProvider
seam, with the debug bar's JSON round-trip surviving separately as the fixture
mechanism it always was. Of `N`, `O`, `P`, `S` and `W`, only `P` still activates a
tool here, and the chords are free either way: the tool handler ignores anything
modified.

### Basic editing and clipboard

| Action | Microsoft Publisher | Adobe Photoshop | Adobe Illustrator | This prototype |
| :--- | :--- | :--- | :--- | :--- |
| **Undo** | `Ctrl` + `Z` | `Ctrl` + `Z` | `Ctrl` + `Z` | `Ctrl`/`Cmd` + `Z` — Wired |
| **Redo** | `Ctrl` + `Y` | `Ctrl` + `Shift` + `Z` | `Ctrl` + `Shift` + `Z` | Both chords — Wired |
| **Cut** | `Ctrl` + `X` | `Ctrl` + `X` | `Ctrl` + `X` | `Ctrl`/`Cmd` + `X` — Wired, in-app clipboard |
| **Copy** | `Ctrl` + `C` | `Ctrl` + `C` | `Ctrl` + `C` | `Ctrl`/`Cmd` + `C` — Wired, in-app clipboard |
| **Paste** | `Ctrl` + `V` | `Ctrl` + `V` | `Ctrl` + `V` | `Ctrl`/`Cmd` + `V` — Wired for objects; image paste from outside stays Specified (`picture-frame.paste.inserts-from-clipboard`) |
| **Select All** | `Ctrl` + `A` | `Ctrl` + `A` | `Ctrl` + `A` | `Ctrl`/`Cmd` + `A` — Wired |
| **Deselect All** | `Esc` | `Ctrl` + `D` | `Ctrl` + `Shift` + `A` | `Ctrl`/`Cmd` + `Shift` + `A` — Wired. **Divergence:** `Esc` cancels the gesture in flight instead |

Redo answers to both conventions — Adobe's `Ctrl`+`Shift`+`Z` and Publisher's
`Ctrl`+`Y` — because there is no cost to accepting both and no way to guess which a
reviewer's hands already know.

The clipboard is the app's own (§2): objects copied here do not reach another
application, and nothing arrives from one. That is a real limit rather than a stub —
crossing to the system clipboard means serializing objects to a public format and
deciding what a foreign paste means, which is dev-team work, not a binding.

`Esc` differs from Publisher on purpose — it is the universal cancel here, and
overloading it to also mean deselect would make a mid-drag `Esc` ambiguous. Deselect
takes Illustrator's `Ctrl`+`Shift`+`A` instead, which nothing else wanted.

### Object manipulation and layout

| Action | Microsoft Publisher | Adobe Photoshop | Adobe Illustrator | This prototype |
| :--- | :--- | :--- | :--- | :--- |
| **Group Objects** | `Ctrl` + `Shift` + `G` | `Ctrl` + `G` (Groups Layers) | `Ctrl` + `G` | `Ctrl`/`Cmd` + `G` — Wired |
| **Ungroup Objects** | `Ctrl` + `Shift` + `G` | `Ctrl` + `Shift` + `G` | `Ctrl` + `Shift` + `G` | `Ctrl`/`Cmd` + `Shift` + `G` — Wired |
| **Duplicate** | `Ctrl` + `D` (or `Ctrl` + Drag) | `Ctrl` + `J` (Duplicates Layer) | `Alt` + Drag (or `Ctrl` + `C` then `Ctrl` + `F`) | `Ctrl`/`Cmd` + `D` and `Alt` + drag — both Wired |
| **Bring to Front** | `Alt` + `F6` | `Ctrl` + `Shift` + `]` | `Ctrl` + `Shift` + `]` | Not bound — waits on the Layers panel |
| **Send to Back** | `Alt` + `Shift` + `F6` | `Ctrl` + `Shift` + `[` | `Ctrl` + `Shift` + `[` | Not bound — waits on the Layers panel |
| **Nudge Object** | Arrow Keys | Arrow Keys (`V` tool active) | Arrow Keys | Arrow keys — Wired |
| **Nudge (Larger Increment)** | `Shift` + Arrow Keys | `Shift` + Arrow Keys | `Shift` + Arrow Keys | `Shift` + arrows — Wired, ten times the increment |

Grouping is a deliberate divergence: Publisher toggles both operations onto
`Ctrl`+`Shift`+`G`, and the prototype splits them the Adobe way — `Ctrl`+`G` groups,
`Ctrl`+`Shift`+`G` ungroups. A toggle has to guess which the user meant when a selection
holds both a group and a loose object; two chords never guess. The clause ids
(`select.ctrl-g.groups-selection`, `select.ctrl-shift-g.ungroups-selection`) record the
choice, and reversing it means changing them.

Duplicate reads Publisher's `Ctrl`+`D` as duplicate-in-place, not Illustrator's
transform-again: the copy lands a quarter-inch down and right of its source and takes
the selection. It shares the copying with `Alt`+drag and with paste, and leaves the
clipboard untouched — duplicating something does not discard what you had copied.

The coarse nudge multiplies the options-bar increment by ten. None of the three
applications publishes its multiple, so 10× is an `ASSUMPTION` for SME review, sitting
beside the 0.1 in default nudge it multiplies.

### View and navigation

| Action | Microsoft Publisher | Adobe Photoshop | Adobe Illustrator | This prototype |
| :--- | :--- | :--- | :--- | :--- |
| **Zoom In** | `F9` (Toggles 100%) or `Ctrl` + Scroll | `Ctrl` + `+` (Plus) | `Ctrl` + `+` (Plus) | `Ctrl`/`Cmd` + `=`, `Ctrl`/`Cmd` + wheel, or `Z` then click — Wired |
| **Zoom Out** | `F9` (Toggles 100%) or `Ctrl` + Scroll | `Ctrl` + `-` (Minus) | `Ctrl` + `-` (Minus) | `Ctrl`/`Cmd` + `-`, `Ctrl`/`Cmd` + wheel, or `Z` then `Alt` + click — Wired |
| **Fit to Screen** | `Ctrl` + `Shift` + `L` (Whole Page) | `Ctrl` + `0` (Zero) | `Ctrl` + `0` (Zero) | `Ctrl`/`Cmd` + `0` — Wired |
| **Pan / Hand Tool** | Scroll Bars | Spacebar + Click & Drag | Spacebar + Click & Drag | `Space` + drag from any tool, or `H` — Wired |
| **Show/Hide Guides** | `Ctrl` + `Shift` + `O` (Boundaries) | `Ctrl` + `;` | `Ctrl` + `;` | Options-bar toggle on the Guide tool (`showGuides`); no key |
| **Show/Hide Rulers** | `Alt` + `V`, `R` (Ribbon shortcut) | `Ctrl` + `R` | `Ctrl` + `R` | Rulers are always on; no toggle to bind |

The zoom keys take Adobe's chords rather than Publisher's `F9` toggle: `F9` flips
between two zoom levels, which is a different feature from stepping a ladder, and the
prototype's ladder is what the Zoom tool already climbs. `Ctrl`+`+` is accepted
alongside `Ctrl`+`=` because they are one key apart on the keyboard and nobody
remembers which the application wanted.

Publisher's `Alt`+`V`,`R` is a ribbon accelerator — a menu walk, not a binding — and has
no counterpart in a frame with no menus.

### Text formatting

| Action | Microsoft Publisher | Adobe Photoshop | Adobe Illustrator | This prototype |
| :--- | :--- | :--- | :--- | :--- |
| **Bold** | `Ctrl` + `B` | `Ctrl` + `Shift` + `B` | `Ctrl` + `Shift` + `B` | Deferred — no text editing yet |
| **Italic** | `Ctrl` + `I` | `Ctrl` + `Shift` + `I` | `Ctrl` + `Shift` + `I` | Deferred |
| **Underline** | `Ctrl` + `U` | `Ctrl` + `Shift` + `U` | `Ctrl` + `Shift` + `U` | Deferred |
| **Align Left** | `Ctrl` + `L` | `Ctrl` + `Shift` + `L` | `Ctrl` + `Shift` + `L` | Deferred |
| **Align Center** | `Ctrl` + `E` | `Ctrl` + `Shift` + `C` | `Ctrl` + `Shift` + `C` | Deferred |
| **Align Right** | `Ctrl` + `R` | `Ctrl` + `Shift` + `R` | `Ctrl` + `Shift` + `R` | Deferred |

Deferred rather than out of scope: the Text frame tool is in the registry and the
shaping engine is PLAN.md §6.4 work. These bindings belong to the Character and
Paragraph panels' phase, and Publisher's unmodified `Ctrl` chords are the right model
for a Publisher-parity product. They cost nothing today because no text has focus.

### What the comparison doesn't cover

The supplied list has no tool-letter layer, because Publisher has none — tool selection
there is a ribbon click. This prototype's letters follow the Adobe habit instead, and
six of them agree with Illustrator outright: `V` select, `A` direct/node select, `T`
text, `Z` zoom, `H` hand/pan, `I` eyedropper. The rest are ours, and two collide with
Illustrator meanings a designer may carry in from another app — `P` is the picture frame
here rather than the pen, and the pen is `G`, which is Illustrator's gradient. Worth an
SME opinion before the letters harden.

---

## 8. What is still unbound

Every recommendation this file carried in its first revision is now built, except one.

1. **Arrange keys** — bring to front / send to back on the Adobe chords
   (`Ctrl`+`Shift`+`]` / `[`). Blocked, not deferred by preference: stacking order
   belongs to the Layers panel (§4.3 of the requirements), which is unwired, and there
   is no action to dispatch and no clause to bind. It should arrive with that panel's
   Phase B group rather than in front of it.
2. **Text formatting** — the `Ctrl`+`B`/`I`/`U` and alignment chords wait on the text
   engine (PLAN.md §6.4), as the parity table says.
3. **The system clipboard** — see §7. Crossing that boundary is a document-format
   decision, not a keyboard one.

Anything added later has to land as a **registry clause first** — a tool's `gestures`
if a tool owns it, `globalKeyClauses` if none does. The dock, the generated handoff
documents and the tests all read the registry, so a binding that exists only in a shell
handler is invisible to every one of them.

---

## 9. Status of this document

Not yet part of the PLAN.md §8 handoff bundle list. It reads well beside `SEAMS.md`
there — recommended, not assumed. The test that keeps it honest checks the tool tables
against the registry in both directions, verifies every clause id it cites exists,
fails when a declared global chord goes undocumented, and fails when the registry names
a key this file never mentions.

One thing here outruns the plan: PLAN.md §5 describes the contract vocabulary as
per-tool, and `globalKeyClauses` adds a second list for the chords no tool owns. The
shape is unchanged — same `GestureClause`, same ids, same cross-validation against the
store — but §5 should say the list exists.
