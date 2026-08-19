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
  their own.
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
