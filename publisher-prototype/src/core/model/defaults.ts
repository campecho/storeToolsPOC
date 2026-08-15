import type { ColorValue } from "./primitives";
import type { Document, Layer, PageSetup } from "./document";
import { CURRENT_VERSION } from "./document";
import type { ParagraphFormat, RunFormat } from "./text";

/**
 * The starting document (PLAN.md §6.6).
 *
 * `DocumentSchema` requires complete formatting defaults, because they are
 * what makes style resolution total (see text.ts). Authoring those by hand in
 * every fixture would be miserable and would drift, so the one canonical set
 * lives here and fixtures express only their deltas from it.
 */

/** US Letter, 1/8" bleed, 1/2" margin — the v2 lineage's starting page. */
export const DEFAULT_PAGE_SETUP: PageSetup = {
  trim: { wIn: 8.5, hIn: 11 },
  bleedIn: 0.125,
  slugIn: 0,
  marginIn: 0.5,
  columns: 1,
};

const BLACK: ColorValue = { space: "rgb", values: [0, 0, 0] };

/** The base layer every document starts with; objects must name some layer. */
export const DEFAULT_LAYER_ID = "layer-default";

export const DEFAULT_LAYER: Layer = {
  id: DEFAULT_LAYER_ID,
  name: "Default",
  color: { kind: "literal", value: { space: "rgb", values: [0.03, 0.43, 0.82] } },
  visible: true,
  locked: false,
  printing: true,
  opacity: 1,
  blend: "normal",
};

/**
 * Complete character formatting. Values follow Publisher's own starting point
 * where it has one, so a document opened here and a document opened there
 * begin from the same place.
 */
export const DEFAULT_RUN_FORMAT: RunFormat = {
  family: "Calibri",
  sizePt: 11,
  bold: false,
  italic: false,
  underline: { on: false },
  strikethrough: false,
  color: { kind: "literal", value: BLACK },
  highlight: null,
  baselinePosition: "normal",
  allCaps: false,
  smallCaps: false,
  hScale: 1,
  vScale: 1,
  tracking: 0,
  baselineShiftPt: 0,
  kerning: "metric",
  manualKerns: [],
  features: {},
  variations: {},
  language: "en-US",
};

/**
 * Complete paragraph formatting. The justification bands are Publisher's
 * defaults expressed in this schema's units: word spacing as a multiple of the
 * space advance, letter spacing in 1/1000 em.
 */
export const DEFAULT_PARAGRAPH_FORMAT: ParagraphFormat = {
  align: "left",
  // Publisher's "1sp" single spacing is ≈1.19× the font size, not 1.0.
  lineSpacing: { mode: "multiple", value: 1.19 },
  indentLeftIn: 0,
  indentRightIn: 0,
  firstLineIndentIn: 0,
  spaceBeforeIn: 0,
  spaceAfterIn: 0,
  tabs: [],
  bullet: null,
  numbering: null,
  dropCap: null,
  hyphenation: {
    on: false,
    minWordLength: 5,
    minCharsBefore: 2,
    minCharsAfter: 2,
    maxConsecutive: 3,
    zoneIn: 0.25,
    hyphenateCapitalized: true,
  },
  justification: {
    word: { min: 0.8, desired: 1, max: 1.33 },
    letter: { min: 0, desired: 0, max: 0 },
    lastLine: "left",
  },
  ruleAbove: null,
  ruleBelow: null,
  keep: {
    withNext: false,
    linesTogether: false,
    widowLines: 2,
    orphanLines: 2,
    breakBefore: "none",
  },
  shading: null,
  alignToBaselineGrid: false,
  direction: "ltr",
};

/**
 * A valid, empty, one-page document. The smallest thing that satisfies
 * `DocumentSchema` — the starting point for a new document, for fixtures, and
 * for the store's initial state.
 */
export function blankDocument(name = "Untitled"): Document {
  return {
    version: CURRENT_VERSION,
    name,
    product: null,
    setup: DEFAULT_PAGE_SETUP,
    baselineGrid: { on: false, incrementIn: 0.16, startIn: 0 },
    facingPages: false,
    pages: [
      {
        id: "page-1",
        masterId: null,
        objects: [],
        setup: null,
        quarterTurns: 0,
        guides: { v: [], h: [] },
        hiddenLayerIds: [],
      },
    ],
    masters: [],
    layers: [DEFAULT_LAYER],
    sections: [],
    swatches: [],
    paragraphStyles: [],
    characterStyles: [],
    defaults: {
      paragraph: DEFAULT_PARAGRAPH_FORMAT,
      run: DEFAULT_RUN_FORMAT,
    },
    fonts: [],
    anchors: [],
    assets: {},
    guides: { v: [], h: [] },
  };
}
