/**
 * Parser for `pub2raw` traces — the callback log librevenge's
 * RVNGRawDrawingGenerator prints while libmspub parses a `.pub`
 * (plan §10.2: the pipeline's Option-A front end).
 *
 * The format was ground-truthed against librevenge 0.0.5 (the exact
 * generator pub2raw wraps) by driving RVNGRawDrawingGenerator directly;
 * the golden output lives at fixtures/pub-traces/demo-flyer.trace.
 * Format facts the parser encodes:
 *   - one callback per line, indented two spaces per nesting level
 *     (indentation is decorative — structure comes from the event names);
 *   - some callbacks print a space before "(" (`drawRectangle (…)`),
 *     others don't (`setStyle(…)`) — both are accepted;
 *   - bare callbacks have no parens (`closeSpan`, `insertLineBreak`);
 *   - property lists are `key: value` pairs joined by ", ", keys are
 *     namespaced (`svg:x`, `draw:fill`, `librevenge:rotate`);
 *   - vector-valued properties nest parenthesized property lists:
 *     `svg:points: ((svg:x: 1.0000in, …), (…))`;
 *   - `insertText (…)` carries raw text (not a property list) which may
 *     itself contain commas or parentheses — everything between the first
 *     "(" and the line's last ")" is the payload;
 *   - lengths print with a unit suffix (`8.5000in`, `12.0000pt`,
 *     `119.0000%`), and `librevenge:rotate` prints a bogus `in` suffix on
 *     what is actually degrees — numeric parsing ignores the suffix.
 */

/** A property value: a scalar string, or a vector of nested property maps. */
export type PropValue = string | PropMap[];
export type PropMap = Record<string, PropValue>;

export type TraceEvent =
  | { name: "insertText"; text: string }
  | { name: string; props: PropMap };

const KEY_RE = /^[a-zA-Z][\w.-]*:[\w.-]+$/;

/** Is `s.slice(i)` positioned at a `key: ` boundary? (for scalar-end detection) */
function atKeyBoundary(s: string, i: number): boolean {
  const colon = s.indexOf(": ", i);
  if (colon === -1) return false;
  return KEY_RE.test(s.slice(i, colon));
}

/** Find the index of the matching ")" for the "(" at `open`. -1 if unbalanced. */
function matchParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** Parse `key: value, key: value, …` with nested `((…), (…))` vectors. */
export function parsePropList(s: string): PropMap {
  const props: PropMap = {};
  let i = 0;
  while (i < s.length) {
    // skip separators
    while (i < s.length && (s[i] === "," || s[i] === " ")) i++;
    if (i >= s.length) break;
    const colon = s.indexOf(": ", i);
    if (colon === -1) break; // trailing junk — tolerate
    const key = s.slice(i, colon);
    i = colon + 2;
    if (s[i] === "(") {
      // vector value: outer parens wrap a list of parenthesized groups
      const end = matchParen(s, i);
      if (end === -1) break;
      const inner = s.slice(i + 1, end);
      const groups: PropMap[] = [];
      let j = 0;
      while (j < inner.length) {
        while (j < inner.length && (inner[j] === "," || inner[j] === " ")) j++;
        if (inner[j] !== "(") break;
        const gEnd = matchParen(inner, j);
        if (gEnd === -1) break;
        groups.push(parsePropList(inner.slice(j + 1, gEnd)));
        j = gEnd + 1;
      }
      props[key] = groups;
      i = end + 1;
    } else {
      // scalar: runs to the next top-level ", " that starts a new key
      let j = i;
      while (j < s.length) {
        const comma = s.indexOf(", ", j);
        if (comma === -1) {
          j = s.length;
          break;
        }
        if (atKeyBoundary(s, comma + 2)) {
          j = comma;
          break;
        }
        j = comma + 2;
      }
      props[key] = s.slice(i, j);
      i = j;
    }
  }
  return props;
}

const LINE_RE = /^([A-Za-z]+)\s*(?:\((.*)\))?$/s;

/** Parse a full pub2raw trace into its event sequence. */
export function parseTrace(trace: string): TraceEvent[] {
  const events: TraceEvent[] = [];
  for (const raw of trace.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue; // unrecognized line — tolerate, never throw on foreign input
    const [, name, inner] = m;
    if (name === "insertText") {
      events.push({ name, text: inner ?? "" });
    } else {
      events.push({ name, props: inner ? parsePropList(inner) : {} });
    }
  }
  return events;
}

/**
 * Numeric property → inches. Unit suffixes per librevenge's printer:
 * `in`, `pt` (1/72"), `cm`, `mm`, `px` (CSS 96/in); unitless is inches.
 * Returns undefined for absent/non-numeric values.
 */
export function toInches(v: PropValue | undefined): number | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^(-?[\d.]+)\s*(in|pt|cm|mm|px|\*)?$/.exec(v);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return undefined;
  switch (m[2]) {
    case "pt":
      return n / 72;
    case "cm":
      return n / 2.54;
    case "mm":
      return n / 25.4;
    case "px":
      return n / 96;
    default:
      return n; // "in", "*", or unitless
  }
}

/**
 * Numeric property, unit suffix ignored — for values whose printed unit is
 * wrong or irrelevant (librevenge:rotate prints degrees with an `in` suffix;
 * ground-truthed against librevenge 0.0.5).
 */
export function toNumber(v: PropValue | undefined): number | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^(-?[\d.]+)/.exec(v);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return Number.isNaN(n) ? undefined : n;
}

/** Percent property (`119.0000%`) → multiplier (1.19). */
export function toMultiplier(v: PropValue | undefined): number | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^(-?[\d.]+)%$/.exec(v);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return Number.isNaN(n) ? undefined : n / 100;
}

/** Font size property → points (native unit for type). */
export function toPoints(v: PropValue | undefined): number | undefined {
  const inches = toInches(v);
  return inches === undefined ? undefined : inches * 72;
}
