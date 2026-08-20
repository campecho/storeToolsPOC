# SEAMS — dev-team interfaces

Every SURFACE capability declares its seam here: what it's called with, what it
returns, and what the dev team owns (PLAN.md §3, §8).

**Status:** no seams registered yet. Seam entries arrive with the SURFACE
capabilities themselves (export/print settings, model services, full-res render,
HEIC, ICC/CMYK — PLAN.md §6.5, §6.7).

## Handoff decisions of record (PLAN.md §0.1)

- **POC access (recorded 2026-08-15):** the dev team has access to the entire
  `storeToolsPOC` repository. Seam entries and generated docs may cite POC
  implementations as full working references; the prototype always carries its own
  concise, self-contained description alongside any citation — a citation is never
  the only explanation.
- **Extraction mode (recorded 2026-08-15):** **copy** — the §0.1 default stands. A
  pristine new repo; rationale travels in the generated docs and review record, not
  commit history.
- **Target repo (recorded 2026-08-15):** none, deliberately. The prototype stays in
  `storeToolsPOC` so the POC remains reviewable alongside it as reference, especially
  for the dev team's later `.pub` import work. This supersedes §0.1's "the stopgap
  stays short" preference; the binding commit discipline (no mixed commits,
  standalone messages) remains in force for as long as the prototype lives here.
- **Schema v3 grouping model (recorded 2026-08-17, user-ratified):** PLAN.md §6.6's
  delta table is silent on grouping; Phase B's group/ungroup (§5.1) needs storage.
  Decision: minimal nested model — `doc.groups: [{ id, parentGroupId? }]`, objects
  carry an optional `groupId`. Geometry stays on member objects; groups have none of
  their own. **The last clause was superseded 2026-08-19 — a group now stores the one
  angle its frame is drawn at; see "A group carries its frame angle" below.**
- **Standalone photo documents (recorded 2026-08-17, user-ratified):** a photo edited
  on its own is a regular schema-v3 document with `kind: "image"` — one format, not
  two, so any future storage/sync layer handles a single document shape. Convention
  (one page, one picture frame) is maintained by photo mode, not schema-enforced.
- **Rotation pivot (recorded 2026-08-17, user decision):** an object's `rotation`
  is about its frame **center**, not a corner. One semantic across storage,
  rendering, and hit-testing; `core/hittest`'s `framePivot` is the single
  authority the renderer mirrors. Supersedes the initial top-left ASSUMPTION.
- **Schema v3 object vocabulary (recorded 2026-08-17):** object `type` names follow
  the registry's `ObjectType` vocabulary (`textFrame`/`pictureFrame`/`shape`/…),
  superseding the POC v2 names — the registry is the prototype's contract, and v3
  owns the lineage it copied. Deferred as additive (no version bump when added):
  gradient/pattern `Paint` kinds (arrive with the fill/gradient tool) and parametric
  rounded-corner storage — the latter has since landed, see **Parametric shape
  storage** below.
- **Line decorations (recorded 2026-08-18, user-ratified):** the arrow tool's
  contract (`creates: "line"` with head options) needs storage the v2 lineage's
  line lacked. Additive v3 delta on `LineObject`, no version bump per the additive
  rule: optional `headStart`/`headEnd` (`none|arrow|circle|diamond`), `headSize`
  (`s|m|l`), and `dash` (`solid|dashed|dotted` — activating the line tool's
  until-now storage-less dash option). Absent = the default (`none`/`m`/`solid`);
  tools omit defaults so lineage documents stay valid and lean. Decoration
  geometry (dash patterns, head shapes) is pure math in `core/render/lineDecor.ts`
  so the dev team's output path shares it with the canvas.
- **Pen draft state (recorded 2026-08-18):** the pen contract makes each anchor
  placement its own committed gesture with one-anchor-at-a-time undo, so the
  in-progress path cannot live in transient gesture state. It lives in a `pen`
  store slice as APP state (the selection precedent): anchor clauses dispatch into
  it, `pen/drawCommitted` commits the finished shape into the document (one
  history entry) and clears it, and the shell's undo path retracts anchors
  (`pen/anchorRetracted`) while a draft is active instead of popping document
  history — redo is unavailable mid-draft. `gesture/cancelled` (the
  pen.esc.discards-path binding) now clears this draft; its no-reducer rule
  narrows to "no DOCUMENT reducer". The committed shape normalizes into the
  control hull's bounding box; independent handle editing and curved closing
  segments are the node-select tranche's scope.
- **Panel commits (recorded 2026-08-18):** control-panel edits mutate the document
  through the same store vocabulary as canvas gestures — one dispatched action per
  committed edit, one history entry — but the registry's `PanelSpec` carries no
  gesture clauses, so panel-originated action types have no clause backing by design.
  Their declaration of record is `PANEL_COMMIT_ACTION_TYPES` in `core/store/history.ts`
  (cross-validated in `gestureActions.test.ts`); a type is either a tool gesture
  clause or a panel commit, never both. Where a panel edits geometry it reuses the
  gesture actions themselves (`object/resizeCommitted`, `object/rotateCommitted`).
  Outline edits split into `object/strokePaintCommitted` (color; keeps each object's
  width; null removes the stroke, ignored for schema-required line strokes) and
  `object/strokeWidthCommitted` (width; only where a stroke exists) so multi-object
  color application never homogenizes widths.
- **Edit runs (recorded 2026-08-18, user decision):** panel numeric entry applies to
  the document as it is typed — a value the canvas does not show is a value the user
  cannot judge, and the fields previously held every edit until Enter or blur.
  "One edit, one history entry" survives that as an EDIT RUN rather than as a
  deferred commit: `NumberField` opens a run on its first commit of a visit, stamps
  every commit in that visit with the run id (`inEditRun`, `core/store/history.ts`),
  and history folds actions matching the newest entry's run into it instead of
  stacking another. The run ends when the field is left or Enter is pressed — the
  boundary is the interaction, never a timer — and undo/redo close it, so a
  continuation can never reopen an entry the stack has stepped past. Run ids are
  minted per run, not per field instance (a remounted field must not reuse one).
  Consequence of record: Escape reverts to the run's starting value inside that same
  run, so an abandoned edit leaves one entry whose snapshot and present agree —
  undoing it is a visible no-op. Discrete controls (±90°, reset, lock, colour) pass
  no run and stay one entry each, exactly as before.
- **Selection frame (recorded 2026-08-18, user decision):** the selection chrome
  HUGS its object — a lone object's frame drawn at that object's own rotation, in
  solid stroke, with the 8 resize handles and the rotation stem riding that frame
  rather than the axis-aligned box around it. The frame is one function,
  `core/hittest`'s `selectionFrame`: a lone object contributes its own box and
  rotation, every other selection (several objects, or a line, which carries no
  rotation) falls back to the union AABB drawn unrotated. Resize scales in that
  frame's own space and pins the grabbed anchor in document coordinates, so a
  rotated object stretches along its own edges and does not shear — closing the
  rotated-chrome and rotated-resize SME items together. Still open: a
  multi-selection has no single rotation, so it scales on the document axes while
  each rotated member keeps its angle, which does shear.
- **Parametric shape storage (recorded 2026-08-18, user decision):** the rounded
  rect stores its corner radius instead of baking it into a path — the additive v3
  delta this file deferred, taken now because a radius nothing stores is a radius
  no panel field and no adjust handle can drive. `shape` gains a `roundedRect`
  kind carrying `cornerRadius` in INCHES and no `d`; the superRefine extends to
  "each shape kind carries exactly its own geometry field". Konva rounds the
  corners itself and hit-testing derives the outline from box + radius, so the
  corners stay circular arcs through any resize rather than shearing into
  ellipses the way a normalized path did. The stored radius is NOT clamped: a
  resize can shrink a frame under a radius the user set, so the geometric bound
  (half the shorter side, per the roundedRect contract's note) is applied
  wherever the shape is drawn, and growing the frame back restores the radius
  rather than losing it. One action serves both surfaces —
  `roundedRect/cornerRadiusCommitted`, a gesture clause the Transform panel
  reuses, per the panel-commit rule above. The other path shapes followed
  immediately — see the generalization entry below; the banner is the one that
  did not.
- **Parametric storage generalized (recorded 2026-08-18, user decision):** what the
  rounded rect proved, the star, callout and flowchart adopt — each stores what
  shapes it (`points` + `innerRadiusRatio`, `tailAnchor`, `symbol`) instead of
  baking it into a path at draw time. Three consequences worth carrying to the dev
  team. First, the per-kind schema rule became a TABLE: `SHAPE_GEOMETRY_FIELDS`
  names the geometry fields each kind owns, and one superRefine checks every object
  against its own kind's row, so adding a parametric kind is adding a row rather
  than extending a condition. Second, one resolver — `shapeOutline()` — now derives
  the outline from parameters plus frame box for every kind, and the renderer, the
  hit test and every preview read it, so those three cannot disagree about what a
  shape is. Third, the parameters outlive the draw: they survive a resize as
  themselves and stay editable afterwards, from the canvas adjust handle where the
  kind has one and from the Transform panel's Shape group either way.
  **The banner stays baked**, and not for want of effort: its contracted fold-depth
  handle has no tool option or requirement behind it to name a parameter, so there
  is nothing yet to store. `drawShapeMachine`'s `DrawnShapeGeometry` union is where
  it joins once SME review names one.
- **A drawn object is selected and hands the tool back (recorded 2026-08-18, user
  decision):** committing a draw does two things beyond adding the object. It
  becomes the selection (`selectionSlice` matches `isDrawCommit`), and the tool
  that drew it steps aside for the select tool (`App`'s `onObjectDrawn`, fired at
  `useToolGestures`' single commit door). Together they mean the thing just made is
  the thing under the cursor: it can be moved, resized, or driven from a panel
  without a trip to the dock, and the panels — which bind to the selection — show
  its own parameters the moment it exists. Anchor placements are committed gestures
  but deliberately NOT draws (`isDrawCommit` excludes them), so a pen path still
  builds click by click and hands back only when the path itself commits.
  ASSUMPTION, flagged for SME review: neither §4.1 nor §4.4 says whether a draw
  tool is sticky. Switch-after-draw is the Publisher convention; a reviewer who
  wants to place five stars in a row will feel this immediately, which is exactly
  the kind of judgement the prototype exists to collect.
  Consequence worth knowing: a behavioural default like this invalidates test
  PREMISES rather than assertions. Selection-on-draw silently broke
  `select.drag.moves-selection`, whose premise was dragging an unselected object,
  and the tool switch broke twelve specs that drew twice with one activation. Both
  times the fix was to restate the premise and keep the assertion.
- **Handle cursors (recorded 2026-08-18, user decision):** each handle shows the
  direction it stretches, turning with the frame — `core/gestures`'
  `resizeHandleAxis` snaps the handle's heading plus the frame's rotation to the
  nearest eighth turn, and the shell (`shell/canvas/cursors.ts`) names the CSS
  keyword. Rotation has no cursor keyword, so the knob carries a drawn glyph
  inlined as an SVG data URI — a NEW PATTERN here, taken because the built-in
  candidates are already spoken for (`grab` is this app's pan cursor) or mean
  something else (`alias` = make a shortcut). The glyph turns and snaps the same
  way. A running resize/rotate joins the workspace's cursor override chain,
  because the preview replaces the chrome mid-gesture (§6.3) and takes the
  hovered handle's cursor with it.
- **Rotation is rigid (recorded 2026-08-19, user decision):** a selection turns as
  ONE BODY about the selection frame's centre. An object's `rotation` pivots at its
  own frame centre (the rotation-pivot decision above), so applying one shared
  delta to every member's angle — what the machine did until now — spun each
  member in place and left a multi-selection scattered across its old positions.
  Members must therefore ORBIT the pivot as well as turn: `object/rotateCommitted`
  gains `boxes`, the same `Record<id, FrameBox | LineEndpoints>` a resize commits,
  carrying the absolute geometry the orbit lands each member on. One gesture still
  commits one action and one history entry. `boxes` is optional — the Transform
  panel's angle field turns one object about its own centre and orbits nothing —
  and the reducer applies the two halves independently, which is what lets a LINE
  take its whole turn through its endpoints despite storing no angle at all. A
  lone frame object degenerates exactly: its pivot is its own centre, so the
  emitted box is the initial one bit-for-bit and "rotate one object" still means
  "turn it in place".
  Consequence for Shift: it snaps the SELECTION FRAME's resulting angle to 15°,
  not each member's own. Snapping per member hands differently-rotated members
  different deltas, which is precisely the thing that breaks rigidity. For a lone
  object the frame rotation IS that object's, so the familiar "snap this object to
  15°" is unchanged; for a multi-selection the frame is unrotated, so Shift snaps
  the turn itself.
  Consequence for lines: they now carry a rotation handle. `selectionFrame` gives a
  lone line its union AABB, so it turns about its own midpoint. This supersedes the
  earlier "an all-line selection shows no rotate handle" note, which existed only
  because rotation was an angle field lines lack.
- **Groups select as a unit (recorded 2026-08-19, user decision):** the §5.1
  grouping model has been storage-only since 2026-08-17; selection now reads it.
  `core/model/groups.ts` is the one resolver — pure id bookkeeping over
  `doc.groups` plus each object's `groupId`, no geometry, since groups own none —
  and every selection clause routes through it: click, Shift-click, Alt-click and
  marquee each resolve a hit object to the OUTERMOST group it belongs to. A
  transform therefore never holds part of a group, which is what makes "a group
  rotates together" true rather than coincidental. Locked members stay out of the
  expansion, matching the select contract's `lockedObjects: "skips"` — a locked
  object never joins a selection by being clicked and must not join one by being
  grouped either.
  Group CONTEXT is app state alongside the ids: `selection.enteredGroupId`.
  Double-click descends exactly one nesting level
  (`select.double-click-group.enters-group`), and inside a context resolution stops
  one level down, so repeated double-clicks walk group → subgroup → member. Leaving
  is implicit and has no clause of its own: a click that lands outside the entered
  group leaves it, and an empty-canvas click clears both. The shell resolves the
  context each click ends in and sends it WITH the ids, so the two halves of the
  state can never disagree.
  ASSUMPTION for SME review: a marquee resolves units in the current context but
  neither enters nor leaves one — a single sweep can cross several levels and there
  is no defensible level to pick for the user.
  Still open, deliberately: nothing CREATES a group yet. §5.1's group/ungroup
  commands need their own document action and id minting, and none of that is
  needed to answer "do grouped items transform together" — a document that already
  carries groups (any import, `fixtures/kitchen-sink.json`) answers it today.
- **Group and ungroup (recorded 2026-08-19, user decision):** §5.1's commands land
  on Ctrl/Cmd+G and Ctrl/Cmd+Shift+G — keyboard only, since the Layers panel that
  would otherwise host them is not wired. They are gesture clauses on the select
  tool like `select.arrow.nudges`, so one keypress is one action and one history
  entry, and they need no schema change: `doc.groups` and `groupId` have been the
  model of record since 2026-08-17. The group id mints at the shell edge beside
  `createObjectId`, keeping the reducer free of id generation (§6.3).
  Grouping NESTS. A group already inside the selection becomes a CHILD of the new
  one rather than being flattened into it, so `object/groupCommitted` carries two
  halves — `ids` joining directly and `groupIds` becoming children — and its
  members keep the `groupId` they had. Ungrouping is the exact inverse of one
  level: objects and subgroups re-join the removed group's parent, or the page
  when it had none. Two units are required to group; one group re-grouped alone
  would only wrap itself, so nothing commits.
  Grouping also RESTACKS, which is the part that is not bookkeeping: members move
  to sit contiguously at the topmost member's z position. Without it an object
  drawn between two members renders inside the group forever — the group would
  transform as a unit but never read as one. Ungroup deliberately does NOT undo
  the restack: undo is what puts stacking back, and quietly re-scattering members
  on ungroup would surprise anyone who arranged them afterwards.
  `object/ungroupCommitted` is the one commit here with no `pageIndex`. Groups are
  document-root state, so removal sweeps every page AND every master — a
  master-page object left holding a removed id would point at nothing. Grouping
  stays page-scoped, because a selection is one page's.
  Consequence of record: §5.1's "selection behavior must clearly indicate grouped
  status" became answerable only once groups could be made, and it needed
  answering — a group's frame is the same union AABB any multi-selection draws, so
  the two were indistinguishable. The chrome now outlines each member inside that
  frame (dashed, faded) when the selection IS exactly one group's membership,
  which `selectedGroupId` decides. A group with a locked member still counts as
  fully selected: no selection can ever contain that member.
- **Delete (recorded 2026-08-19, user decision):** Delete/Backspace removes the
  selection — `object/deleteCommitted`, a gesture clause on the select tool, one
  keypress and one history entry like the nudge and group commands beside it.
  Locked objects are KEPT: a lock exists to refuse exactly this, and the reducer
  skipping them matches every other commit. The selection slice prunes the deleted
  ids (the pruning its own note said would "arrive with it"), so no chrome outlives
  the object it framed, and an emptied selection also leaves whatever group it was
  inside. Groups nothing sits in any more are dropped with the objects: an empty
  group can be neither selected nor entered, so keeping it only gives the
  round-trip something to carry. Backspace preventDefaults whether or not anything
  was selected — some browsers still navigate back on it, and "nothing selected" is
  no reason to leave the page.
- **Shape presentation settled (recorded 2026-08-19, prototype review):** PLAN.md
  §4.1 held both dock renderings — individual slots and a single slot with a flyout
  — behind a debug-bar toggle, with the note that "the prototype review picks the
  winner". It picked **individual slots**. The flyout rendering, its toggle and its
  spec are gone rather than left unreachable, and §4.1 now records the closed
  decision instead of describing a choice. Precedent worth keeping: a "decision
  closed as both" is a decision deferred, and the prototype is where it comes due.
- **A lone line is two points (recorded 2026-08-19, user decision):** the selection
  chrome for a single line is its two ENDPOINT handles and no frame — dragging one
  moves that end and leaves the other anchored (`select.drag-endpoint.moves-endpoint`,
  `core/gestures/lineEndpoint.ts`). Boxing a line in eight stretch handles was
  treating it as an object it is not; the POC's `SelectionOverlay` has always drawn
  exactly these two handles for a line, and this brings the prototype to it.
  The endpoint drag needs no vocabulary of its own: it commits
  `object/resizeCommitted` carrying this line's endpoints, which the store already
  speaks, and previews through the resize arm that already draws endpoints as a
  line. Shift snaps the segment to 45° about the anchor — the same constraint the
  line tool draws under, because placing an endpoint is the same act whether the
  line is new or not. The drag applies TRAVEL, not pointer position, so pressing a
  few thousandths off the handle's centre never jumps the endpoint.
  The rotation handle stayed on a lone line at first (user decision, narrowing the
  rigid-rotation entry rather than reversing it) — **superseded the same day; see
  "A lone line turns from its endpoints" below.**
  Inside a multi-selection a line rejoins the union frame and scales and turns with
  the rest — that is what makes grouped rotation correct, and it is untouched.
- **The Transform panel speaks each object's own vocabulary (recorded
  2026-08-19, user decision):** a frame shows X/Y/W/H, a LINE shows X1/Y1/X2/Y2 —
  completing "a lone line is two points" above, which had reached only as far as
  the canvas chrome. The panel had been mapping a line through its bounding box
  and scaling the endpoints back out of it, which cost more than tidiness: a
  vertical line has zero width, a zero extent cannot be scaled, so its W field
  rendered disabled and neither end could be moved sideways from the panel at
  all. Endpoint fields have no such degenerate case. One commit still serves both
  vocabularies — `object/resizeCommitted` already takes a frame box or a line's
  endpoints and applies whichever matches the object — so this is a rendering
  change, not a new action.
- **Chrome colour (recorded 2026-08-19, user decision):** `#cc0000`, replacing the
  blue. It is ONE constant (`CHROME_COLOR`) covering the selection frame, its
  handles, and every gesture preview, and it has to stay one: a preview REPLACES
  the committed chrome mid-drag (§6.3), so a second colour would flip the frame on
  pointer-down and back on release. The amber adjust handle keeps its own colour —
  it says "this adjusts, it does not resize", which is the one thing in the
  overlay that is deliberately NOT chrome. Known and left alone: the debug
  alignment probe's `#d0396b` now reads close to the chrome red; the probe is off
  by default and dashed, and recolouring it was not part of this change.
- **A lone line turns from its endpoints (recorded 2026-08-19, user decision;
  supersedes the rotation-handle half of "A lone line is two points"):** a lone
  line and a lone arrow show their two endpoint handles and NOTHING else — no
  frame, no stretch handles, and no rotation knob. Dragging an end already turns
  the segment, so the knob was a second control for something one of the endpoints
  does, sitting on chrome whose whole point is that a line is not a box. An arrow
  is a `LineObject` carrying head decorations, so it takes this by the same branch
  — there is no separate arrow object to handle.
  Scope of record: this is the LONE case only. A multi-selection keeps the
  rotation handle even when every member is a line, because no endpoint turns a
  PAIR — that is rigid-body rotation, and a line inside one still follows it
  through its endpoints (the rigid-rotation entry above stands untouched).
  Worth keeping as a pattern: the first answer here added a control, the second
  removed one, and the second is smaller in every sense — fewer handles on screen,
  one way to do the thing, and one less contract clause to explain.
- **A group carries its frame angle (recorded 2026-08-19, user decision;
  supersedes "groups have none of their own [geometry]" from 2026-08-17):**
  `GroupSchema` gains an optional `rotation`. Additive, so no version bump, and
  absent means square per the usual rule.
  It has to be STORED, which is why the earlier decision could not stand. A group's
  frame was the axis-aligned union of its members, so every turn recomputed it from
  the rotated result: the box stopped hugging the group, grew, and the rotation knob
  sprang back to the top-centre of a fresh square box. Rotating turns each member
  AND orbits it, so the members alone can only ever yield an axis-aligned union —
  the angle is not recoverable from them at any cost.
  The BOX stays derived (`orientedSelectionBox`): the smallest box at the stored
  angle that contains every member. Storing the box too would go stale the moment a
  member moved inside the group, and deriving it costs one un-rotate.
  `object/rotateCommitted` gained `groupRotations` to advance the stored angle in
  the same commit as the members' — one gesture, one action, still.
  Consequence worth having: `beginResize` now hands the resize machine that rotated
  frame, so a rotated group scales along its OWN axes. That closes the shear left
  open in the "Selection frame" entry above, for groups. An ad-hoc multi-selection
  has no stored angle and still shears — it has nowhere to keep one.
  Deliberately NOT done: a new group does not adopt a shared member angle, so
  grouping two objects that both sit at 45° starts square. Predictable beats clever,
  and the frame is one turn away from wherever the user wants it.
- **Shift constrains a move (recorded 2026-08-19, user decision):** Shift snaps the
  move delta to 45° — horizontal, vertical and both diagonals from one rule — chosen
  live from the drag's current direction, so turning the drag re-picks the axis and
  releasing Shift frees it mid-gesture. Shared with the line tool's angle snap
  through `snappedDelta` in `core/gestures/drag.ts`.
  The binding had to share a press with `select.shift-click.toggles-membership`.
  It splits on travel, the same slop threshold everything else uses: on an object
  ALREADY selected, Shift-press starts the constrained move and its null end is the
  toggle; on an object outside the selection there is nothing to move yet, so it
  stays a toggle. Both clauses survive on one binding.
- **Alt-drag duplicates (recorded 2026-08-19, user decision):** Alt-dragging leaves
  the originals and drops copies where the drag ends — `object/duplicateCommitted`,
  carrying finished objects with fresh ids, exactly like a draw commit. The copies
  become the selection, for the same reason a drawn object does.
  It shares its binding with `select.alt-click.selects-beneath` and splits the same
  way Shift does: the machine commits only after real travel, and its null end is
  the click that cycles.
  Group membership is COPIED, not shared: each group whose every member is in the
  selection gets a fresh id and the copies join that. Sharing the originals' ids
  would silently enlarge the source group with objects the user meant to separate,
  and a group only partly selected is left behind entirely — half a group is not a
  group.
  The `copy` cursor appears the moment Alt goes down over a selection, not when the
  drag starts: the whole point is answering "will this move or copy?" before the
  user commits to the drag. That needs an Alt-held listener in the workspace beside
  the existing Space one.
- **The callout tail is a free point (recorded 2026-08-19, user decision):** the
  yellow adjust handle sets the tail's LENGTH and ANGLE together, PowerPoint's
  behaviour, instead of snapping the tail to one of four corners. The handle sits
  ON the tip, so the thing dragged is the thing set.
  Storage changes to match: `ShapeObject.tailAnchor` (an enum) becomes `tailTip`, a
  point NORMALIZED to the frame box like every other path coordinate here, so the
  tail scales with a resize the way PowerPoint's normalized adjustments do. This
  is a REPLACEMENT, not an additive delta — it is affordable only because nothing
  stores the old field: no fixture carries `tailAnchor`, and `parseDocument`
  deliberately has no v1/v2 migration ("v3's documents are its own fixtures"), so
  there is no lineage to keep reading. A later replacement, once real documents
  exist, would not be free.
  The enum SURVIVES as a draw-time preset in the options bar (`tailTipFor` maps
  each corner to a starting tip), which is exactly what the callout contract's own
  note always described: "preset anchor positions in the options bar; free
  repositioning happens through the tail adjust handle." The placed object stores
  the free point; the preset only seeds it.
  Consequence of record: the tail reaches OUTSIDE the frame box — that is what
  gives it length — so the body fills the frame, the LONE selection frame hugs the
  body, and the tail extends past it, as PowerPoint's does. That frame is also
  what resize scales, and it has to stay the body: the tip is normalized to it, so
  a frame that grew to swallow the tail would feed back on itself.
  **Correction (same day):** this entry first said the marquee missed the tail. It
  never did — `objectIntersectsRect` tests the drawn outline for every parametric
  kind, so sweeping a tail has always selected its callout. The gap was in
  `objectAabb`, which align/distribute and the multi-selection frame read, and it
  is now closed; see "Bounds take in what is drawn" below.
  The tip is bounded to one box-length outside each edge (`CALLOUT_TIP_MIN/MAX`)
  so its handle cannot be dragged off the page and lost.
  The Transform panel's corner select becomes two numeric fields, since the
  parameter is continuous now — the same treatment corner radius and inner radius
  already get there.
- **Bounds take in what is drawn (recorded 2026-08-19, user decision):**
  `objectAabb` measured a shape's frame corners, so a callout's tail — the one
  outline that leaves its box — fell outside the bounds align/distribute and the
  multi-selection frame work from. Aligning a callout left parked its BODY on the
  margin and hung the tail off the page. Bounds now take the tail in.
  Kept O(1) rather than flattening: the callout is the only kind whose outline
  leaves the unit box, and the only vertex that does is the tip — its base points
  clamp to the body edge. So the fix adds one point, not a flattened path, which
  matters because bounds are taken per object on every align and every selection
  frame. `outlineOvershoot` in `core/geometry/shapePaths.ts` is where a kind
  declares what it reaches past its box, next to the builder that draws it, so a
  future overshooting kind cannot quietly go unmeasured — every other kind returns
  nothing, which that file's tests assert builder by builder.
  Unchanged on purpose: a LONE callout's selection frame is still its own box, not
  this AABB. That frame is what resize scales, and the tip is normalized to it.
- **The banner is a parametric ribbon (recorded 2026-08-19, user decision):** the
  banner baked one fixed outline — a rectangle with a V cut into each end — which
  is a pennant, not the PowerPoint ribbon the review compared it against. It is
  now that ribbon, and the two numbers that shape it are STORED: how far the
  raised panel's sides sit in (`panelInset`), and where its bottom edge falls
  (`panelHeight`). Both are optional and default to absence, so the schema
  version does not move.
  Two adjust handles, not one. The banner is the first kind with more than a
  single yellow handle, so `adjustHandlesFor` returns a LIST keyed by handle id
  and the adjust gesture takes that id rather than assuming the shape has one.
  Each handle is its own machine, its own commit and its own history entry,
  exactly as the star's two parameters are. Both read an absolute position in the
  shape's unit box rather than travel, because each sits ON the value it sets.
  FIVE subpaths, not one — the one builder here that is not a single closed ring.
  It cannot be: the folds and the panel's bottom edge read as internal STROKES in
  the reference, and one silhouette has no way to draw a line inside itself. The
  rings only ever touch along edges, none enclosing another, so both fill rules
  union them and hit testing's even-odd walk agrees.
  The proportions are MEASURED off the two reference captures, not invented, and
  three of them are worth stating because they are counter-intuitive. The tails'
  band mirrors the panel — same height, one anchored to the top and one to the
  bottom — so a deeper panel RAISES the tails to meet it rather than pushing them
  down, and the two always overlap across the middle, which is what makes the
  panel read as standing in front of the band. The V bites a fixed share of the
  FRAME rather than of the tail, which is what turns the tails from arrowheads
  into flags as the panel narrows — the difference between the two captures. And
  the panel's top corners are one radius normalized per axis, the treatment
  `roundedRectPathFor` already uses, so a wide ribbon's corners stay circular
  instead of flattening into a dome; that is why `bannerPath` takes the frame
  size, the only builder besides the rounded rect that needs it.
  `BANNER_HEIGHT_MIN` exists to hold the mirror together: below half, panel and
  band would part and leave the ribbon in two pieces.
  **Amended (same day, review of a zoomed reference):** the FOLD was wrong in
  shape, not just in size — it hung as a vertical tab ending in a half-ellipse
  across its bottom. It is a horizontal bar: it runs IN from the panel's side
  edge by a fixed share of the frame (0.125, the same bite the notch takes, as
  the captures happen to show and not by shared constant), it reaches the
  frame's BOTTOM rather than stopping short of it, and only its INNER bottom
  corner is round — the curl that reads as ribbon turning away under the panel.
  Its other three corners are square on purpose: the outer two continue the
  tail's own edges, so fold and tail share one unbroken bottom line, which is
  what makes the ribbon read as one strip passing behind the panel.
  Not drawn: the reference SHADES the roll's underside a darker tone, and that
  shading is a second ring nested inside the fold. Ours cannot have it — every
  ring here is filled with the object's one fill, and a nested ring would punch
  a hole under even-odd, which is the rule hit testing walks. The silhouette is
  what the prototype can honestly draw.
- **The flowchart kind is cut (recorded 2026-08-19, user decision):** the digest's
  §4.4 lists flowchart shapes and the prototype drew all five, but the review
  found the tool unwanted. It is gone whole — tool contract, `"flowchart"` shape
  kind, the `symbol` parameter, `flowchartPath`, both actions, the Transform
  panel's Symbol select, and their tests — rather than hidden behind an unwired
  flag, because a kind left in the schema is a kind the dev team has to keep
  implementing.
  This SUPERSEDES the flowchart half of "Parametric storage generalized"
  (2026-08-18); the star and callout halves stand unchanged.
  The schema stays at **version 3**, deliberately, and this is the exception
  worth naming: removing a member from the shape enum is NOT additive — a stored
  document with `shape: "flowchart"` no longer parses, and the version literal
  exists precisely so a wrong version fails loudly. It stays at 3 because no such
  document exists: the three fixtures carry no flowchart object, and the
  prototype has no persisted documents outside this repo. Once it does, a removal
  like this bumps the version and brings a migration with it.
  §4.4 of the requirements digest is UNCHANGED. It records what Publisher does,
  not what we build; PLAN.md §4.1 is the record of what we build, and it now says
  in as many words that the two differ here on purpose.
- **Single-key shortcuts keep no escape hatch, deliberately (recorded 2026-08-19,
  user decision):** most tools activate on a bare letter (`V`, `R`, `E`…; eight
  layout tools are dock-only and carry no shortcut at all), which
  WCAG 2.1.4 (Character Key Shortcuts, Level A) allows only alongside one of
  three mechanisms — turn the shortcuts off, remap them behind a modifier, or
  scope them to a focused component. The prototype offers none. The handler
  ignores keystrokes inside form fields and modified chords
  (`shell/isTextEntryTarget.ts`), which stops shortcuts swallowing typing but is
  NOT one of the three: it leaves every key live whenever focus sits on the
  canvas, which is most of the time.
  Deferred because the mechanism the prototype would reach for is a user
  SETTING, and this build has no settings surface — a debug-bar toggle would not
  count, since the mechanism has to be available to the person who needs it. The
  dev team should assume this is unbuilt, not solved: the cheapest conformant fix
  is an off switch in a real preferences surface. Remapping is the fuller answer
  and carries a design consequence — `shortcut` is registry data today, one
  string (or null) per tool, and remapping makes it user state that overrides the
  registry.
- **The banner is three tiling rings plus shading (recorded 2026-08-19, user
  decision, SUPERSEDING the fold half of "The banner is a parametric ribbon"):**
  the review supplied a written construction and a captured rendering, and two
  things the earlier build had structurally wrong came out of measuring that
  capture pixel by pixel rather than eyeballing it.
  First, the TAILS do not cross the middle. Each reaches inward past the plate's
  side edge by exactly one fold's width and stops, so below the plate the middle
  of the frame is EMPTY. A full-width band with a plate laid on top reads as a
  rectangle stuck to a strip; this reads as a ribbon passing behind.
  Second, the rings TILE instead of overlapping. Each tail is L-shaped, turning
  at both corners the plate owns, so plate and tails meet along shared edges and
  none covers another. That is not tidiness: hit testing walks the outline
  even-odd, so a plate laid over full-width tails would have punched its own
  overlap out as a hole — most of the plate's lower half would have stopped
  responding to clicks.
  THE FOLDS ARE NOW DRAWN, which reverses the note recorded with the earlier
  build ("Ours cannot have it — every ring is filled with the object's one
  fill"). The way out was not a nested ring but a second RESOLVER:
  `shapeShading()` returns the parts that render darker, and the renderer paints
  them over the outline in the fill scaled 0.8 toward black (measured off the
  reference, whose fold is exactly fill × 0.80 on all three channels) wearing the
  object's own stroke. `shapeOutline()` keeps its signature and every existing
  caller — hit testing, bounds, previews, the e2e helpers — is untouched, because
  the folds lie INSIDE the silhouette and change neither what the shape covers
  nor what it reaches.
  Consequence for the dev team: a shape's outline and its fill are no longer
  one-to-one. A kind that needs a second tone declares it in `shapeShading`, next
  to the builder that draws it, rather than the renderer guessing from the kind.
  The banner is the only one today, and this file's tests assert every other kind
  returns nothing.
  **Amended (same day, review of the wrap):** the plate's bottom edge must NOT
  run flat to its side edge and stop. It stops one cap short, turns DOWN through
  a quarter ellipse, and meets the side edge half a fold lower — and the fold's
  cap is the other half of that same ellipse, its upper arc literally the
  plate's bottom corner traced the other way. Square that corner off instead and
  a hard line cuts straight across the top of the fold, which is what the review
  saw and the reference does not have. The plate, the fold and the tail share
  one continuous turn, off one pair of radii used in three places.
  The turn also closes the fold's inner end: the underside descends to exactly
  the height the tail's own bottom corner rises to, so the sliver of tail below
  the fold narrows to nothing there and the two curves meet in a cusp rather
  than as corners either side of a straight edge. That the two land together is
  arithmetic, not tuning — the vertical radius is a quarter of the drop below
  the plate, so four of them is the drop exactly.
