# Pasteboard ghosting — implementation plan

**Document type:** Feature implementation plan (publisher prototype only)
**Status:** Ratified and implemented 2026-09-08 — all five §1 defaults confirmed by the
user; the decision of record is the "Pasteboard ghosting" entry in [`SEAMS.md`](../SEAMS.md).
The implementation follows §2–§4 as written, with one bundling difference: the two clip
builders sketched in §2.2 are one `placementClips(region)` function returning both, so
they memoize as a unit.
**Last updated:** 2026-09-08
**Maps to:** [`PLAN.md`](../PLAN.md) §6.2 (render layers — the content layer's display
rule), §6.8 (the pasteboard is spread-scoped), §6.3 (gesture previews live in the SVG
overlay); requirements
[§2.5](microsoft_publisher_feature_requirements.md#25-pasteboard-and-scratch-area)
("the boundary between page and pasteboard must be visually unambiguous, since it
determines what prints"; "indicate clearly when an object is partially on the page")
and §10.1 (objects straddling the page/pasteboard boundary — a later consumer).

---

## 0. The ask, restated

Objects on the pasteboard — outside the white page — render **partially transparent**.
An object that crosses the page edge renders **its on-page part at full strength and
its off-page part partially transparent**. Nothing else changes: page furniture, the
selection chrome, hit-testing, the document model, the store, and the file format are
untouched. This is a **display rule of the content layer**, and it must hold for every
object kind the renderer draws now (shapes, lines, placeholder frames) and every kind it
draws later (shaped text, placed images, masters), without each of those having to know
about it.

What the codebase gives us (verified 2026-09-08):

- The pasteboard is not a drawn thing. It is the `.canvas-area` container's CSS
  background (`shell/app.css`, `#d4d4d4`); the page is one white Konva `Rect` at the
  document origin, sized from `effectivePageSetup` (`shell/canvas/CanvasStage.tsx`).
  Only one page renders today; PLAN.md §6.8's spread display is not built yet.
- Every object passes through one function, `renderObject` in `CanvasStage.tsx`, and
  z-order is array order in one Konva `Layer` with `listening={false}`.
- The selection chrome and every gesture preview are SVG in a sibling element
  (`SvgOverlay.tsx`), so nothing done to Konva nodes can dim the chrome, and a move
  preview is an outline — the Konva object stays put until the gesture commits.
- The schema's per-object `opacity` (`core/model/objects.ts`) is not read by the
  renderer today. Nothing in the renderer clips, masks, or sets opacity.
- `core/hittest` already owns rotation-aware bounds (`objectAabb`, which takes in a
  callout's tail) and the exact outline-vs-rect predicate the marquee uses.
- Konva 10.3.1 (installed, `node_modules/konva/lib`): a container's `clipFunc` draws in
  the container's local space with the absolute transform applied — document inches
  here — and its return value is spread into `context.clip(...)`, so returning
  `["evenodd"]` clips to the **inverse** of a region (`Container.js:216-234`,
  `Container.d.ts:7`). A group's `opacity` multiplies into each child's own
  `globalAlpha` rather than compositing the group as a whole (`Node.js:822-828`).

---

## 1. Decisions to ratify before code

Each carries a default; work proceeds on the default unless redirected.

### D1 — Mechanism: per-object clipping (recommended) vs. a pasteboard veil

Two designs satisfy the words of the ask. They differ in what else they touch.

| | **Per-object clipping** (default) | **Pasteboard veil** (rejected, recorded) |
|---|---|---|
| What it is | Each object is classified `on` / `off` / `straddling` the page. `on` renders exactly as today. `off` renders once at ghost opacity. `straddling` renders twice: clipped to the page at full opacity, and clipped to the pasteboard at ghost opacity. | One translucent pasteboard-coloured shape with the page(s) punched out, drawn above the content layer. Mathematically identical to fading the *whole content composite* toward the pasteboard colour. |
| Touches | `renderObject`'s call site plus one new pure module in `core/render`. | One node. |
| Furniture | Untouched. | Also fades the bleed and slug boxes and the page shadow, which lie outside the page — a visible change to furniture nobody asked for, and the furniture layer is a separately cadenced cache (§6.2) that the veil would have to sit above. |
| Overlaps on the pasteboard | Two ghosted objects show through each other — the literal reading of "objects appear partially transparent", and the same per-node semantics Konva gives the Layers/Effects panels' opacity later. | The composite fades as one; nothing shows through. |
| Reuse | Builds the one authority for "is this object on the page" that §2.5's *exclude from print and export* and §10.1's *straddle* checker rule will both need. | Builds nothing reusable. |
| Cost | O(1) classification per object per render; a second draw only for straddling objects. | Negligible. |

**Recommendation: per-object clipping.** It does exactly what was asked and changes
nothing that was not, and the classifier it introduces is foundation code with two named
future consumers. The veil is the smaller change, but it is an inference about how the
furniture should look, and this repository's rule is not to infer.

*A third variant, held as the fallback:* draw the content in **two Konva layers** — one
clipped to the page, one clipped to the pasteboard with CSS `opacity` on its `<canvas>`
element. That composites each region as a whole (none of §2.4's per-node artifacts) and
leaves furniture alone, but it draws every object twice on every pan and zoom rather than
only straddlers, and it reaches into Konva's canvas element imperatively outside React.
It is where to go if SME review rejects the per-node artifacts; it is not the default.

### D2 — Ghost opacity value: `0.5`, tagged ASSUMPTION

`PASTEBOARD_GHOST_OPACITY = 0.5` is one exported constant in core. Per PLAN.md §0.1 a
placeholder number must never read as a decision, so it carries an `ASSUMPTION:` tag for
SME validation. No UI exposes it in this slice.

### D3 — Stored object `opacity` stays unread (scope)

The renderer ignores the schema's per-object `opacity` today. This feature does not
start honouring it — that belongs to the Effects panel tranche (§6.6's delta table).
Nothing needs pre-building for the two to compose: ghosting is a `Group` opacity around
the object's node, and Konva multiplies a parent's opacity into a child's, so when the
Effects work sets the node's own opacity the product is automatic.

### D4 — Ghosting applies on commit, not mid-drag (consequence, accept)

PLAN.md §6.3's hard rule keeps in-flight gesture state out of the store and draws the
preview into the SVG overlay as an outline. The Konva object therefore stays at its
committed position during a move; it ghosts (or un-ghosts) the moment the gesture
commits. Making the preview itself ghost would mean rendering content in the overlay,
which the §6.2 layer split exists to avoid. Recorded as a consequence, not a bug.

### D5 — The region is a list, today of one rect

The "page" the rule clips to is `pageRegion(size: PageSize): readonly Rect[]`. Today it
returns the one page at the origin, and its parameter is exactly what it reads. PLAN.md
§6.8 makes the spread the display unit and scopes the pasteboard to it, so the RETURN
type is a list now: the classifier and both clips are written over a list of rects and
will not change when facing pages land. The PARAMETER will — a spread's rects need the
document and page index (or a `Spread`), which neither `PageSize` nor
`EffectivePageSetup` can express — so that day changes `pageRegion`'s signature and its
one call site in `CanvasStage`, and nothing downstream of it. The classifier stays exact
for one page and merely conservative for several (an object crossing the spine counts as
straddling and clips correctly to the union — see §2.1). No spread work is done here.

---

## 2. Design

### 2.1 Placement is a core fact — `src/core/render/pagePlacement.ts`

Framework-free, next to `pageSetup.ts` and `lineDecor.ts`. Imports only from within
`core/` (`check:boundaries` enforces it).

```ts
import { objectAabb, type Rect } from "../hittest";
import type { LayoutObject, PageSize } from "../model";
import { headLengthIn, PT_PER_IN } from "./lineDecor";
import { DPI, ZOOM_MIN } from "../geometry/viewport";

/** ASSUMPTION: 50% is a working guess for SME review (§0.1). */
export const PASTEBOARD_GHOST_OPACITY = 0.5;

export type PagePlacement = "on" | "off" | "straddling";

/** The page region in document inches: one page at the origin. A spread's
    pages (PLAN.md §6.8) will need the document and page index instead —
    see D5. */
export function pageRegion(size: PageSize): readonly Rect[];

/** How far ink can reach past an object's geometric outline, in inches. */
export function inkPadIn(o: LayoutObject): number;

/** `objectAabb` inflated by `inkPadIn`: every pixel the renderer can touch
    lies inside this rect. */
export function inkBounds(o: LayoutObject): Rect;

/** Pure rect math: `on` when `bounds` lies inside some page rect (closed
    interval — touching the edge is on); `off` when it is disjoint from every
    page rect; `straddling` otherwise. */
export function classifyPlacement(bounds: Rect, region: readonly Rect[]): PagePlacement;

/** `classifyPlacement(inkBounds(o), region)`. */
export function objectPlacement(o: LayoutObject, region: readonly Rect[]): PagePlacement;
```

**Why the classifier is allowed to be conservative.** Clipping does the exact work; the
`on` and `off` answers are shortcuts that skip it. A wrong shortcut would change pixels
only if ink lay outside the bounds it was judged on, so `inkBounds` must contain every
pixel — and then the only possible error is `on`/`off` being called `straddling`, which
costs one extra draw and changes nothing on screen. That is why `inkPadIn` is generous
rather than exact:

| Object | Pad (inches) | Reason |
|---|---|---|
| Shape with a stroke | `stroke.width / PT_PER_IN × MITER_PAD` with `MITER_PAD = 10` | Konva leaves the canvas defaults, `lineJoin: miter` with `miterLimit` 10. The limit bounds the miter's full length, so a sharp vertex's tip (a star's points) reaches at most five stroke widths past the geometric point; ten is that bound doubled, on purpose. |
| Shape without a stroke | `0` | Fills never leave the outline. |
| Line | stroke pad as above `+ headLengthIn(o.headSize, o.stroke.width)` | Endpoint bounds omit the stroke's half-width and the heads' sideways reach; one head length covers both. |
| textFrame / pictureFrame / table / mergeField | `1 / (DPI × ZOOM_MIN)` | The placeholder's 1px `strokeScaleEnabled={false}` hairline is widest in document inches at minimum zoom (0.104 in); classification must not depend on zoom. |

`objectAabb` already handles rotation and the callout's tail, so `inkBounds` adds only
the pad. Pads read `headLengthIn`, `DPI` and `ZOOM_MIN` from the modules that own them,
and `PT_PER_IN` from `lineDecor` — which today is one of three declarations of `72`
(`lineDecor.ts`, `hittest/geometry.ts`, and a local copy in `CanvasStage.tsx`). S2 folds
the renderer's copy into the `lineDecor` import so the pad and the drawn stroke share one
constant; the `hittest` copy is out of scope and noted.

One obligation to record with the decision: `inkPadIn` covers what the renderer draws
*today*. The schema's `effects` (shadow, glow, soft edge, bevel, reflection) are unread by
the renderer; the day they draw, they reach past the outline and `inkPadIn` must grow a
term for them, or the `on` shortcut will leave an unghosted shadow hanging off the page.

**Multi-rect regions (D5).** `on` requires containment in a *single* rect. For one page
that is exact. For a spread, an object crossing the spine is inside the union but no
single rect, so it classifies `straddling` and the renderer clips it to the union of both
pages — the correct picture, at the cost of one extra draw. No rect-subtraction helper
is built for this.

### 2.2 The renderer — `shell/canvas/CanvasStage.tsx`

The existing `renderObject` keeps its body and every branch unchanged; the change is at
its call site. `CanvasStage.tsx` already imports react-konva's `Rect` component, so the
geometry type comes in aliased — `import { type Rect as PageRect } from "../../core/hittest"`
— or the file fails `tsc` on a duplicate identifier. One new function chooses how many
times to draw and under what clip:

```tsx
type PlacementClips = {
  pages: (ctx: Konva.Context) => void;
  pasteboard: (ctx: Konva.Context) => ["evenodd"];
};

function renderPlaced(
  o: LayoutObject,
  swatches: readonly Swatch[],
  placement: PagePlacement,
  clips: PlacementClips,
): ReactNode {
  switch (placement) {
    case "on":
      return renderObject(o, swatches); // byte-for-byte today's output
    case "off":
      return (
        <Group key={o.id} opacity={PASTEBOARD_GHOST_OPACITY}>
          {renderObject(o, swatches)}
        </Group>
      );
    case "straddling":
      return (
        <Group key={o.id}>
          <Group clipFunc={clips.pages}>{renderObject(o, swatches)}</Group>
          <Group clipFunc={clips.pasteboard} opacity={PASTEBOARD_GHOST_OPACITY}>
            {renderObject(o, swatches)}
          </Group>
        </Group>
      );
  }
}
```

The two clips are the only Konva-specific code, shell-side because they take a Konva
context:

```ts
const clipToPages = (region: readonly PageRect[]) => (ctx: Konva.Context) => {
  for (const r of region) ctx.rect(r.x, r.y, r.w, r.h);
};
// Everything except the pages: a rect far larger than any pasteboard, with
// each page cut out under the even-odd rule (Container.js:231 spreads the
// return value into context.clip).
const clipToPasteboard = (region: readonly PageRect[]) => (ctx: Konva.Context): ["evenodd"] => {
  ctx.rect(-CLIP_EXTENT, -CLIP_EXTENT, 2 * CLIP_EXTENT, 2 * CLIP_EXTENT);
  for (const r of region) ctx.rect(r.x, r.y, r.w, r.h);
  return ["evenodd"];
};
```

Facts the implementation relies on, all verified against the installed Konva:

- The clip is drawn after the group's absolute transform is applied, so the rects above
  are in document inches like everything else on the stage; a rotated object inside is
  clipped by the axis-aligned page edge, which is what we want.
- The two clips are exact complements. At the page edge the canvas antialiases both, and
  their coverages sum to one, so the seam is a sub-pixel blend of full and ghost — not a
  gap and not a double-dark line. Reproduced in Chromium during plan review with the
  exact construction at a 96× transform: on-page `a = 255`, off-page `a = 128`, untouched
  `a = 0`, a one-pixel 255→128 seam. Still verify at 400% on the real stage (§5).
- The outer clip extent is a constant (`CLIP_EXTENT = 1e4` inches), not the visible rect,
  so the clip does not depend on the viewport and does not change on pan.
- `react-konva` passes `clipFunc` and `opacity` straight through (`Group` is typed as
  `Konva.GroupConfig`), and `import type Konva from "konva"` gives the `Konva.Context`
  type that satisfies the config-level `clipFunc` parameter under `verbatimModuleSyntax`
  and `consistent-type-imports` — the sketch above was compiled against the project's
  `tsconfig` during review. Nesting one `Group` around two clipped `Group`s keeps one
  keyed child per object in the layer, so z-order stays array order.
- Both layers have `listening={false}`; the doubled nodes cost no hit-graph drawing.

**Where the region and placements are computed.** In `CanvasStage`, above the existing
early return (`react-hooks/rules-of-hooks` is an error in this config; the file has no
hooks yet, so `useMemo` joins the existing import as
`import { useMemo, type ReactNode } from "react"`), with the `size` destructuring moved
up to feed them:

```ts
const { w: pageW, h: pageH } = setup.size;
const region = useMemo(() => pageRegion({ w: pageW, h: pageH }), [pageW, pageH]);
const clips = useMemo(
  () => ({ pages: clipToPages(region), pasteboard: clipToPasteboard(region) }),
  [region],
);
const placements = useMemo(
  () => objects.map((o) => objectPlacement(o, region)),
  [objects, region],
);
```

The dependencies are primitives on purpose. `CanvasWorkspace` rebuilds `setup` with
`effectivePageSetup` on every render, and an in-flight pan re-renders it per
`pointermove`, so a memo keyed on `setup` — or on a `region` derived from it — would
recompute, and hand react-konva fresh `clipFunc` closures, every frame. Keyed on the
page's width and height, the region, the clips and the placements survive a pan
untouched and change only on document mutation (`objects` is structurally shared by
Immer) or a page-size edit. The content layer then maps `objects` with
`renderPlaced(o, swatches, placements[i] ?? "straddling", clips)` — under
`noUncheckedIndexedAccess` the index is possibly undefined, and `straddling` is the
answer that is exact whatever the truth, so the fallback can never draw a wrong pixel.

### 2.3 Deliberately unchanged

- **Furniture** (page fill, shadow, slug, bleed, margins, column guides) — not dimmed.
- **Selection chrome, handles, gesture previews, group-member outlines** — SVG, full
  strength. An off-page object's chrome stays red and solid: it is an interaction
  affordance, not content.
- **Hit-testing** — `core/hittest` reads geometry, not opacity; a ghosted object is
  selected, moved and marquee'd exactly as before.
- **Document model, store, `.staples` format** — nothing is stored; `on/off/straddling`
  is derived at render time.
- **Stored object `opacity`** — still unread (D3).

### 2.4 Known limitations, to record with the decision

- **A multi-part object ghosts per part.** Konva multiplies group opacity into each
  child, so where an object's Konva parts overlap, the lower part shows through the
  upper one in the ghost. Today only the banner is built that way — its shaded folds are
  a second `Path` painted over the outline — so a ghosted banner's folds read slightly
  lighter than fill × 0.8. An arrow or diamond head does not overlap its line — the
  stroke stops at the head's base — but a CIRCLE head is centred on the tip and sits over
  the stroke it caps, so a ghosted circle-headed line shows the stroke through the head.
  Placeholder frames' stroke and label do not overlap. The dev team's
  renderer should composite an object as one unit; Konva can (`cache()`), at the cost of
  an offscreen bitmap per ghosted object at the current zoom, which is not worth it
  for one shape kind in a prototype.
- **A ghosted stroke overlaps its fill.** Every shape sets `perfectDrawEnabled={false}`
  for speed, which is Konva's switch for exactly this case: with fill, stroke and an
  opacity below one, the stroke's inner half is painted over the fill as a second
  translucent pass, so a ghosted shape shows a slightly darker band half a stroke wide
  inside its edge. At the default 0.75pt it is under a pixel at 100%; it is visible on
  thick strokes. Turning perfect draw on for ghost copies would fix it by drawing each
  such shape through a stage-sized buffer canvas — one full composite per ghosted shape
  per frame — which the stress fixture would feel. Recorded; not fixed in this slice.
- **DOM overlays are not ghosted.** The T1 `contentEditable` text-editing overlay
  (§6.4) will sit above the canvas at full strength while a straddling frame is being
  edited. Editing is momentary; recorded, not fixed.
- **The ghost changes on commit** (D4).

---

## 3. Work breakdown

Four slices, in order; each is one commit touching only `publisher-prototype/`, with a
message that reads standalone (PLAN.md §0.1). Slices 1 and 3 are mechanical against
this spec and are delegated; slice 2 needs judgement and stays with the main thread;
slice 4 is the record. A review pass follows all four.

### S1 — Core classifier (delegate: Sonnet)

- **Add** `src/core/render/pagePlacement.ts` per §2.1, with the file-top invariant
  comment the codebase's modules carry.
- **Add** `src/core/render/pagePlacement.test.ts` — the §4 matrix, in the colocated
  `describe("<export>")` / `it("<behaviour sentence>")` style of `pageSetup.test.ts`.
- Done when `npm run check:boundaries && npm run lint && npm run typecheck && npm test`
  pass inside `publisher-prototype/` and every row of §4 has an assertion.

### S2 — Renderer (main thread)

- **Edit** `src/shell/canvas/CanvasStage.tsx` per §2.2: `renderPlaced`, the two clip
  builders, `CLIP_EXTENT`, the memoized region/clips/placements above the early return,
  the content layer mapping `renderPlaced` instead of `renderObject`, the `PageRect`
  alias, and the local `PT_PER_IN` replaced by the `lineDecor` import. Update the
  file-top comment to state the rule and cite §2.5.
- No change to `CanvasWorkspace.tsx`: the stage already receives `setup`.
- Manual check before committing: load the stress fixture from the debug bar (300
  objects across a one-inch apron, ~30% rotated) and confirm drag/marquee stay smooth
  (§6.2 gate a), then inspect a straddling rotated ellipse at 400% for the seam.
- Done when `npm run ci` passes and the manual check is recorded in the commit body.

### S3 — End-to-end pixel probe (delegate: Sonnet)

**New pattern, flagged:** the suite asserts on store state because Konva has no DOM,
and no test reads pixels today. This feature is purely visual, so it needs the "small
pixel-sampling helper for render-level smoke checks" PLAN.md §5 already anticipates.

- **Add** to `e2e/helpers.ts`: `contentPixelAt(page, pt: DocPoint)` returning
  `{ r, g, b, a }` from the content layer's canvas — the *middle* of the three
  `<canvas>` elements under `[data-testid="canvas-area"]` (Konva appends one per layer in
  order and the stage draws ground, content, guides since the guides moved above content;
  the SVG overlay is not a canvas, and with `listening={false}` no hit canvas reaches the
  DOM). Take
  `screenPoint(pt)`, which is page-absolute, **subtract the canvas element's own
  bounding box**, then scale by `canvas.width / canvas.clientWidth` for the pixel ratio
  and read one pixel with `getImageData`. Document the last-canvas rule at the helper.
- **Add** `e2e/pasteboard.spec.ts` with the §4 e2e rows. Its `beforeEach` follows the
  suite's pattern (`page.goto("/")`, canvas area visible) and then **zooms to 50%**: fill
  the debug bar's `Zoom percent` field with `50`, press Enter, and wait for the store's
  zoom to read `0.5`. This is not optional. At the 100% boot zoom the canvas area —
  866×603 px under `devices["Desktop Chrome"]`, after the dock, rail and panel — shows
  only 0.26 in of pasteboard beside the page and nothing above `y ≈ 2.4 in`, which is
  why every existing spec stays inside `x ≥ 0.2, y ≥ 2.5`. At 50% the visible document
  runs from about `x = −4.7` to `13.2` and `y = −0.8` to `11.8`, which reaches every
  coordinate in §4.
- Assert on **alpha**, not colour: the layer canvas is transparent where nothing is
  drawn, so a ghost pixel reads `a ≈ 128` and a full pixel `a === 255`, independent of
  the pasteboard colour and the rectangle tool's default fill (`#4472c4`, so drawn
  rects are filled; their default 0.75pt stroke pads the classification but never
  reaches a rectangle's centre).
- Done when `npm run e2e` passes locally, including the existing suite. In a container
  whose pre-installed Chromium predates the pinned `@playwright/test`, point
  `PLAYWRIGHT_CHROMIUM_PATH` at the installed binary — `playwright.config.ts` already
  honours it — rather than running `playwright install`.

### S4 — The record (main thread)

- **`SEAMS.md`** — one entry under "Handoff decisions of record": *Pasteboard ghosting
  (recorded <date>, user decision)* — the rule; per-object clipping chosen and the veil
  rejected with the furniture reason; `core/render/pagePlacement.ts` as the one
  authority for on/off/straddling, with §2.5's export exclusion and §10.1's straddle
  rule named as its next consumers; the `0.5` ASSUMPTION; the per-part ghost
  limitation; the commit-time consequence; the obligation that `inkPadIn` grows a term
  for `effects` the day they render; and the note that any new renderer path (text,
  images, masters) inherits the rule only by going through `renderObject`.
- **`PLAN.md` §6.2** — one sentence after the coordinate paragraph: ink outside the
  page ghosts at `PASTEBOARD_GHOST_OPACITY`; the content layer clips straddling objects
  both ways; placement is a core fact.
- Commit message in the repo's "Record …" convention.

### Review pass (main thread, before reporting done)

- Re-read the S2 diff adversarially: every `renderObject` branch reached through
  `renderPlaced`; keys unique per sibling set; hooks above the early return; no
  viewport dependence in the clips; no new `any`; no TODOs.
- Confirm `on` objects produce an identical Konva tree to before (no wrapper group).
- Confirm the file-top comments say what the code does now.
- Run the full gate: `cd publisher-prototype && npm run ci && npm run e2e`.

---

## 4. Test matrix

### Unit — `pagePlacement.test.ts`

| Export | Case | Expect |
|---|---|---|
| `pageRegion` | empty document | `[{ x: 0, y: 0, w: 8.5, h: 11 }]` |
| `pageRegion` | page with `sizeOverride` 11×17 | one rect of that size at the origin |
| `classifyPlacement` | bounds strictly inside the page | `on` |
| `classifyPlacement` | bounds touching an edge from inside (`x = 0`) | `on` (closed interval) |
| `classifyPlacement` | bounds crossing each of the four edges (four cases) | `straddling` |
| `classifyPlacement` | bounds larger than the page, containing it | `straddling` |
| `classifyPlacement` | bounds disjoint on each side (four cases) | `off` |
| `classifyPlacement` | bounds touching an edge from outside (`x + w = 0`) | `straddling` (closed interval; ink at the edge is on the page) |
| `classifyPlacement` | two-rect region, bounds inside the second rect | `on` |
| `classifyPlacement` | two-rect region, bounds spanning both | `straddling` (documented conservatism) |
| `inkPadIn` | unstroked rect | `0` |
| `inkPadIn` | shape with a 1pt stroke | `10 / 72` |
| `inkPadIn` | line, 2pt stroke, medium head | `20 / 72 + headLengthIn("m", 2)` |
| `inkPadIn` | line, 2pt stroke, no heads | `20 / 72 + headLengthIn(undefined, 2)` (heads absent still pad — cheap and safe) |
| `inkPadIn` | textFrame placeholder | `1 / (96 × 0.1)` |
| `inkBounds` | 1×1 rect at the origin rotated 45° | bounds ≈ 1.414 wide, centred on (0.5, 0.5) — proves it reads `objectAabb` |
| `inkBounds` | callout with `tailTip: { x: -0.3, y: 0.5 }` (a schema-valid callout must carry `tailTip`; the four presets leave the box in *y* only, so an *x*-outside tip is set explicitly) | extends left of the frame by 0.3 × w — proves the overshoot rides along |
| `objectPlacement` | unstroked rect flush with the left edge (`x = 0`) | `on` |
| `objectPlacement` | the same rect with a 1pt stroke | `straddling` (ink crosses) |
| `objectPlacement` | rect at `x = -2, w = 1` | `off` |
| `objectPlacement` | rect at `x = -0.5, w = 1` | `straddling` |
| `objectPlacement` | unrotated square well inside; same square rotated 45° at the corner of the page so a corner pokes out | `on` then `straddling` |
| `objectPlacement` | line from (−1, 1) to (1, 1) | `straddling` |
| `objectPlacement` | line from (−3, 1) to (−2, 1) | `off` |

### End-to-end — `pasteboard.spec.ts`

Every row runs at the 50% zoom S3's `beforeEach` sets; at the boot zoom none of these
coordinates is on screen (S3).

| Title | Steps | Assert |
|---|---|---|
| on-page ink is full strength | draw a rectangle (1,1)→(3,3) | `a === 255` at (2, 2) |
| pasteboard ink ghosts | draw a rectangle (−2, 1)→(−0.5, 3) | `a` within 3 of 128 at (−1.25, 2) |
| a straddling object ghosts only its off-page part | draw a rectangle (−1, 1)→(1, 3) | `a === 255` at (0.5, 2); `a` within 3 of 128 at (−0.5, 2) |
| moving an object onto the pasteboard ghosts it on commit | draw on-page, select, drag its centre to (−1.5, 2) | after the drag: `a` ≈ 128 at the new centre, `a === 0` at the old one |
| the chrome is not ghosted | select the pasteboard rectangle | the selection frame `[data-handle]`s are present (existing pattern) — a store/DOM assertion, since the chrome is SVG |

---

## 5. Verification and definition of done

Inside `publisher-prototype/`:

```sh
npm run ci        # boundaries, lint, typecheck, unit tests, build — the CI gate
npm run e2e       # Playwright, including the new pasteboard.spec.ts
```

Manual, recorded in S2's commit body:

- Stress fixture at 100%: drag and marquee feel unchanged.
- A rotated ellipse straddling the page corner at 400%: no gap and no dark seam at the
  edge; the off-page arc reads at half strength.
- A banner half off the page: folds ghost with the rest (the per-part lightening is
  visible only side by side with an on-page banner, and is recorded).

Done means all of PLAN.md's and `CLAUDE.md`'s gates: typecheck and lint clean; tests for
the new logic written and passing; no new `any`, no TODOs, no commented-out code; the
one new pattern (pixel probe) flagged here and in the SEAMS entry; no file touched
outside §3's list.

On "tests for the new logic": the classifier is covered by unit tests. The renderer
change cannot be — Vitest runs in the `node` environment over `src/**/*.test.ts` only,
and the codebase has no component tests by design (PLAN.md §5: Konva has no DOM to
assert against). S3's pixel probe **is** the renderer's test, which is why it is a
required slice and not a nice-to-have.

---

## 6. Risks and open questions

- **Performance on straddler-heavy documents.** Each straddling object is drawn twice
  with two clip states. The stress fixture's one-inch apron makes this the common case
  there, which is exactly why S2 checks it. If gate (a) regresses, the fallback is not
  the veil but caching the placement on the object array (already planned) and, only if
  still needed, drawing the ghost copy for straddlers at a coarser clip. Not expected.
- **Clip antialiasing across browsers.** Chromium antialiases `clip()`; the store profile
  is Chromium (§6.9). If another engine hard-edges the clip, the seam is a one-pixel
  step, not a visual defect.
- **The number.** `0.5` will be judged by the SME on the real pasteboard grey; it is one
  constant, and a debug-bar slider is a five-line follow-up if review wants to tune it
  live. Not built now.
- **Spreads.** When §6.8's spread display lands, `pageRegion` grows to the spread's
  pages and this feature needs no other change; whether the classifier should then be
  made exact for the union (a rect-subtraction helper) is that work's call, driven by
  whether the extra draws show up on the gate.
- **Should ghosted objects still print?** Out of scope here — §2.5's export exclusion is
  a later consumer of `objectPlacement`, and it is named in the record so it is not
  rebuilt.
