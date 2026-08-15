import { z } from "zod";
import { PhotoOpSchema } from "./photoOps";
import {
  BlendModeSchema,
  ColorRefSchema,
  EdgesSchema,
  EffectsSchema,
  FillSchema,
  OpacitySchema,
  PathSegSchema,
  PointSchema,
  StrokeSchema,
} from "./primitives";
import { ParagraphSchema, TextBodySchema } from "./text";

/**
 * Schema v3 objects (PLAN.md §6.6). Z-order is array order within a page, as
 * in the v2 lineage; layers re-order whole bands of that array at once (§2.2).
 *
 * Objects are one discriminated union on `type` rather than the lineage's
 * frame-vs-line split, because v3 adds a table type whose geometry is a box
 * like a frame's but whose content is neither text nor picture. Lines stay
 * endpoint-defined — a box would not describe them.
 */

/** §3.4 text wrap. `boundary` carries the custom-wrap path when mode is custom. */
export const TextWrapSchema = z.object({
  mode: z.enum(["none", "square", "tight", "through", "topBottom", "custom"]),
  /** Standoff on each side, inches. */
  distance: EdgesSchema,
  /**
   * Custom mode only: the exclusion outline, normalised 0–1 within the
   * object's box like `PathSeg`. The line breaker consumes it as exclusion
   * geometry, which is why wrap belongs to the text tranche (§6.6).
   */
  boundary: z.array(PathSegSchema).optional(),
});
export type TextWrap = z.infer<typeof TextWrapSchema>;

/**
 * Fields every object carries. `layerId` is the §2.2 delta; object-level
 * `opacity`/`blend` coexist with the layer's own, which §2.2 requires and
 * whose precedence the renderer resolves (layer composites over its combined
 * contents, object composites within the layer).
 */
const ObjectCommonSchema = z.object({
  id: z.string(),
  locked: z.boolean().default(false),
  layerId: z.string(),
  opacity: OpacitySchema.default(1),
  blend: BlendModeSchema.default("normal"),
  effects: EffectsSchema.default({}),
});

/** Box geometry, inches, with rotation about the box centre. */
const BoxGeometrySchema = z.object({
  xIn: z.number(),
  yIn: z.number(),
  wIn: z.number().min(0),
  hIn: z.number().min(0),
  rotationDeg: z.number().default(0),
});

/** Everything a boxed object shares: geometry, paint, and wrap. */
const BoxObjectSchema = ObjectCommonSchema.merge(BoxGeometrySchema).extend({
  fill: FillSchema.default({ kind: "none" }),
  stroke: StrokeSchema.nullable().default(null),
  wrap: TextWrapSchema.default({
    mode: "none",
    distance: { lIn: 0, rIn: 0, tIn: 0, bIn: 0 },
  }),
});

/**
 * How a picture sits inside its frame — the §6.6 in-frame crop transform.
 * `fit` establishes the base placement; `offsetIn` and `scale` are the user's
 * drag and zoom on top of it, which is what makes the crop adjustable without
 * touching the source image or the recipe.
 */
export const PictureCropSchema = z.object({
  fit: z.enum(["cover", "contain", "stretch"]).default("cover"),
  offsetIn: PointSchema.default({ xIn: 0, yIn: 0 }),
  scale: z.number().positive().default(1),
});
export type PictureCrop = z.infer<typeof PictureCropSchema>;

/** §8.1 table cell. Borders are per-edge so shared edges can differ. */
export const TableCellSchema = z.object({
  paragraphs: z.array(ParagraphSchema).min(1),
  /** §8.1 merge: how many grid positions this cell covers. */
  rowSpan: z.number().int().min(1).default(1),
  colSpan: z.number().int().min(1).default(1),
  /**
   * True for a grid position absorbed by another cell's span. The position
   * stays in the array so row/column indexing needs no span arithmetic; its
   * content is ignored.
   */
  covered: z.boolean().default(false),
  borderTop: StrokeSchema.nullable().default(null),
  borderRight: StrokeSchema.nullable().default(null),
  borderBottom: StrokeSchema.nullable().default(null),
  borderLeft: StrokeSchema.nullable().default(null),
  /** §8.1 cell shading. */
  shading: ColorRefSchema.nullable().default(null),
  inset: EdgesSchema.default({ lIn: 0.04, rIn: 0.04, tIn: 0.04, bIn: 0.04 }),
  vAlign: z.enum(["top", "middle", "bottom"]).default("top"),
});
export type TableCell = z.infer<typeof TableCellSchema>;

/**
 * §8.1 table content. `cells` is row-major and fully populated — one entry per
 * grid position, covered or not — so a cell lookup is `cells[row][col]`.
 *
 * Flagged in §6.6 as the second-hardest build item after text: a cell is a
 * text frame, so the engine is reused, but the tranche is not "days".
 */
export const TableContentSchema = z
  .object({
    rowHeightsIn: z.array(z.number().min(0)).min(1),
    colWidthsIn: z.array(z.number().min(0)).min(1),
    cells: z.array(z.array(TableCellSchema).min(1)).min(1),
  })
  .superRefine((table, ctx) => {
    if (table.cells.length !== table.rowHeightsIn.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `table has ${table.rowHeightsIn.length} row heights but ${table.cells.length} rows of cells`,
        path: ["cells"],
      });
    }
    table.cells.forEach((row, i) => {
      if (row.length !== table.colWidthsIn.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `row ${i} has ${row.length} cells, expected ${table.colWidthsIn.length}`,
          path: ["cells", i],
        });
      }
    });
  });
export type TableContent = z.infer<typeof TableContentSchema>;

export const RectObjectSchema = BoxObjectSchema.extend({ type: z.literal("rect") });
export const EllipseObjectSchema = BoxObjectSchema.extend({ type: z.literal("ellipse") });

/** Vector path; `d` is normalised 0–1 within the box (see PathSegSchema). */
export const PathObjectSchema = BoxObjectSchema.extend({
  type: z.literal("path"),
  d: z.array(PathSegSchema),
});

/**
 * A text frame. Threading (§3.2) is the v2 lineage's fields finally consumed
 * by an editor: `storyId` groups the chain, and prev/next order it. The story
 * body lives on the frame that starts the chain (`prevFrameId === null`);
 * continuation frames carry `body: null` and render the overset from theirs.
 */
export const TextObjectSchema = BoxObjectSchema.extend({
  type: z.literal("text"),
  storyId: z.string(),
  prevFrameId: z.string().nullable().default(null),
  nextFrameId: z.string().nullable().default(null),
  body: TextBodySchema.nullable().default(null),
});

/**
 * A picture frame. `assetId` null renders the placeholder frame; `adjust` is
 * the §6.6 recipe, evaluated over the source before `crop` places it.
 */
export const PictureObjectSchema = BoxObjectSchema.extend({
  type: z.literal("picture"),
  assetId: z.string().nullable().default(null),
  crop: PictureCropSchema.default({}),
  adjust: z.array(PhotoOpSchema).default([]),
});

export const TableObjectSchema = BoxObjectSchema.extend({
  type: z.literal("table"),
  table: TableContentSchema,
});

/** Endpoint-defined line — the one object a box would not describe. */
export const LineObjectSchema = ObjectCommonSchema.extend({
  type: z.literal("line"),
  x1In: z.number(),
  y1In: z.number(),
  x2In: z.number(),
  y2In: z.number(),
  stroke: StrokeSchema,
});

export const LayoutObjectSchema = z.discriminatedUnion("type", [
  RectObjectSchema,
  EllipseObjectSchema,
  PathObjectSchema,
  TextObjectSchema,
  PictureObjectSchema,
  TableObjectSchema,
  LineObjectSchema,
]);
export type LayoutObject = z.infer<typeof LayoutObjectSchema>;

export type RectObject = z.infer<typeof RectObjectSchema>;
export type EllipseObject = z.infer<typeof EllipseObjectSchema>;
export type PathObject = z.infer<typeof PathObjectSchema>;
export type TextObject = z.infer<typeof TextObjectSchema>;
export type PictureObject = z.infer<typeof PictureObjectSchema>;
export type TableObject = z.infer<typeof TableObjectSchema>;
export type LineObject = z.infer<typeof LineObjectSchema>;
