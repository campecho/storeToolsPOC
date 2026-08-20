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

## 2. Editing keys

Canvas focus, no text field involved.

| Keys | Does | Tool | Clause | Status |
| :--- | :--- | :--- | :----- | :----- |
| `Esc` | Cancels the gesture in flight and restores the geometry it started from | any | `select.esc.cancels-drag` and each draw tool's `*.esc.cancels-draw` | Wired |
| `Esc` | Discards the pen draft between presses | Pen | `pen.esc.discards-path` | Wired |
| `Enter` | Finishes the open pen path | Pen | `pen.double-click.commits-open-path` | Wired |
| `Delete` / `Backspace` | Removes the selected objects; locked ones stay | Select | `select.delete.removes-selection` | Wired |
| Arrow keys | Nudges the selection by the options-bar increment (default 0.1 in) | Select | `select.arrow.nudges` | Wired |
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

## 3. Modifiers held during a gesture

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

## 4. Wheel and trackpad

| Input | Effect | Clause | Status |
| :---- | :----- | :----- | :----- |
| Wheel | Scrolls the viewport vertically | `pan.wheel.scrolls` | Wired |
| `Shift` + wheel | Scrolls horizontally | `pan.wheel.scrolls` | Wired |
| `Ctrl`/`Cmd` + wheel | Zooms about the pointer | `zoom.wheel.ctrl-zooms-at-cursor` | Wired |

Zoom is delta-proportional, so a trackpad's micro-events don't compound a full step each.

---

## 5. Fields and panels

`Enter` commits a number field's edit run and `Escape` reverts it — a run is one history
entry however many keystrokes it took (`src/shell/panels/NumberField.tsx`). The debug
bar's zoom field applies on `Enter`. While any field holds focus, tool letters and
Space-pan stay silent.

---

## 6. Parity with Publisher, Photoshop and Illustrator

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
| **New Document** | `Ctrl` + `N` | `Ctrl` + `N` | `Ctrl` + `N` | Out of scope — no file layer |
| **Open Document** | `Ctrl` + `O` | `Ctrl` + `O` | `Ctrl` + `O` | Out of scope — debug-bar Import only |
| **Save** | `Ctrl` + `S` | `Ctrl` + `S` | `Ctrl` + `S` | Out of scope — debug-bar Export only |
| **Save As...** | `F12` | `Ctrl` + `Shift` + `S` | `Ctrl` + `Shift` + `S` | Out of scope |
| **Print** | `Ctrl` + `P` | `Ctrl` + `P` | `Ctrl` + `P` | Out of scope — export is a SURFACE seam |
| **Close Document** | `Ctrl` + `W` or `Ctrl` + `F4` | `Ctrl` + `W` | `Ctrl` + `W` | Out of scope |

The prototype models the interaction surface, not the application shell. Document
JSON round-trips through the debug bar, which is model tooling rather than specified
surface — binding `Ctrl`+`S` to it would dress up a test harness as a product feature.
Of `N`, `O`, `P`, `S` and `W`, only `P` still activates a tool here, and the chords are
free either way: the tool handler ignores anything modified.

### Basic editing and clipboard

| Action | Microsoft Publisher | Adobe Photoshop | Adobe Illustrator | This prototype |
| :--- | :--- | :--- | :--- | :--- |
| **Undo** | `Ctrl` + `Z` | `Ctrl` + `Z` | `Ctrl` + `Z` | **Gap** — undo exists, no binding |
| **Redo** | `Ctrl` + `Y` | `Ctrl` + `Shift` + `Z` | `Ctrl` + `Shift` + `Z` | **Gap** — redo exists, no binding |
| **Cut** | `Ctrl` + `X` | `Ctrl` + `X` | `Ctrl` + `X` | Not modeled — no clipboard |
| **Copy** | `Ctrl` + `C` | `Ctrl` + `C` | `Ctrl` + `C` | Not modeled — no clipboard |
| **Paste** | `Ctrl` + `V` | `Ctrl` + `V` | `Ctrl` + `V` | Specified for images only (`picture-frame.paste.inserts-from-clipboard`) |
| **Select All** | `Ctrl` + `A` | `Ctrl` + `A` | `Ctrl` + `A` | **Gap** — no binding |
| **Deselect All** | `Esc` | `Ctrl` + `D` | `Ctrl` + `Shift` + `A` | **Divergence** — `Esc` cancels the gesture in flight; clicking empty canvas clears the selection (`select.click-empty.clears`) |

Undo and redo are the conspicuous gap: `documentSlice` keeps per-gesture history and the
debug bar drives it with buttons, so the behavior is built and only the binding is
absent. `Esc` differs from Publisher on purpose — it is the universal cancel here, and
overloading it to also mean deselect would make a mid-drag `Esc` ambiguous.

### Object manipulation and layout

| Action | Microsoft Publisher | Adobe Photoshop | Adobe Illustrator | This prototype |
| :--- | :--- | :--- | :--- | :--- |
| **Group Objects** | `Ctrl` + `Shift` + `G` | `Ctrl` + `G` (Groups Layers) | `Ctrl` + `G` | `Ctrl`/`Cmd` + `G` — Wired |
| **Ungroup Objects** | `Ctrl` + `Shift` + `G` | `Ctrl` + `Shift` + `G` | `Ctrl` + `Shift` + `G` | `Ctrl`/`Cmd` + `Shift` + `G` — Wired |
| **Duplicate** | `Ctrl` + `D` (or `Ctrl` + Drag) | `Ctrl` + `J` (Duplicates Layer) | `Alt` + Drag (or `Ctrl` + `C` then `Ctrl` + `F`) | `Alt` + drag — Wired; no `Ctrl` + `D` |
| **Bring to Front** | `Alt` + `F6` | `Ctrl` + `Shift` + `]` | `Ctrl` + `Shift` + `]` | Not bound — waits on the Layers panel |
| **Send to Back** | `Alt` + `Shift` + `F6` | `Ctrl` + `Shift` + `[` | `Ctrl` + `Shift` + `[` | Not bound — waits on the Layers panel |
| **Nudge Object** | Arrow Keys | Arrow Keys (`V` tool active) | Arrow Keys | Arrow keys — Wired |
| **Nudge (Larger Increment)** | `Shift` + Arrow Keys | `Shift` + Arrow Keys | `Shift` + Arrow Keys | **Gap** — Shift is ignored; the nudge is the same size |

Grouping is a deliberate divergence: Publisher toggles both operations onto
`Ctrl`+`Shift`+`G`, and the prototype splits them the Adobe way — `Ctrl`+`G` groups,
`Ctrl`+`Shift`+`G` ungroups. A toggle has to guess which the user meant when a selection
holds both a group and a loose object; two chords never guess. The clause ids
(`select.ctrl-g.groups-selection`, `select.ctrl-shift-g.ungroups-selection`) record the
choice, and reversing it means changing them.

Duplicate lands on `Alt`+drag, which both Publisher and Illustrator support; `Ctrl`+`D`
is free and worth adding when a keyboard-only duplicate is wanted (Publisher's meaning,
duplicate-in-place, not Illustrator's transform-again).

### View and navigation

| Action | Microsoft Publisher | Adobe Photoshop | Adobe Illustrator | This prototype |
| :--- | :--- | :--- | :--- | :--- |
| **Zoom In** | `F9` (Toggles 100%) or `Ctrl` + Scroll | `Ctrl` + `+` (Plus) | `Ctrl` + `+` (Plus) | `Ctrl`/`Cmd` + wheel, or `Z` then click — Wired; no `Ctrl` + `+` |
| **Zoom Out** | `F9` (Toggles 100%) or `Ctrl` + Scroll | `Ctrl` + `-` (Minus) | `Ctrl` + `-` (Minus) | `Ctrl`/`Cmd` + wheel, or `Z` then `Alt` + click — Wired; no `Ctrl` + `-` |
| **Fit to Screen** | `Ctrl` + `Shift` + `L` (Whole Page) | `Ctrl` + `0` (Zero) | `Ctrl` + `0` (Zero) | **Gap** — zoom presets live in the debug bar only |
| **Pan / Hand Tool** | Scroll Bars | Spacebar + Click & Drag | Spacebar + Click & Drag | `Space` + drag from any tool, or `H` — Wired |
| **Show/Hide Guides** | `Ctrl` + `Shift` + `O` (Boundaries) | `Ctrl` + `;` | `Ctrl` + `;` | Options-bar toggle on the Guide tool (`showGuides`); no key |
| **Show/Hide Rulers** | `Alt` + `V`, `R` (Ribbon shortcut) | `Ctrl` + `R` | `Ctrl` + `R` | Rulers are always on; no toggle to bind |

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

## 7. Recommended additions, ranked

Each of these has to land as a **registry clause first**: the dock, the generated
handoff documents and the tests all read the registry, so a binding that exists only in
a shell handler is invisible to every one of them.

1. **Undo and redo** — `Ctrl`/`Cmd`+`Z`, `Ctrl`/`Cmd`+`Shift`+`Z`, and `Ctrl`+`Y` for
   the Publisher habit. The behavior is already built and CI-tested; only the binding is
   missing. It needs a decision first: PLAN.md §5's contract vocabulary is per-tool, and
   undo belongs to no tool — so it wants either a document-level clause list or an
   explicit ruling that global chords sit outside the registry.
2. **`Shift` + arrow coarse nudge** — Publisher, Photoshop and Illustrator all agree,
   the Select tool already carries a `nudgeIncrement` option, and the multiplier (10× is
   the common choice) is exactly the kind of number this prototype exists to put in
   front of an SME.
3. **`Ctrl`/`Cmd` + `A` select all**, with `Ctrl`/`Cmd`+`Shift`+`A` to deselect —
   Illustrator's pairing, and it leaves `Esc` meaning cancel.
4. **Zoom-to-fit and stepped zoom keys** — `Ctrl`/`Cmd`+`0`, `Ctrl`/`Cmd`+`+`/`-`. The
   viewport math exists — `zoomInStep`, `zoomOutStep`, `fitZoom` — and the debug bar is
   its only caller.
5. **Arrange keys** — bring to front / send to back on the Adobe chords. Blocked on the
   Layers panel (§4.3), which owns stacking order; there is no clause to bind yet.

---

## 8. Status of this document

Not yet part of the PLAN.md §8 handoff bundle list. It reads well beside `SEAMS.md`
there — recommended, not assumed. The test that keeps it honest checks the tool tables
against the registry in both directions, verifies every clause id it cites exists, and
fails when the registry names a key this file never mentions.
