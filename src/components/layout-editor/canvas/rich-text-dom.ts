import type { Paragraph, TextProps, TextRun } from "@/schema";
import { fontStack, ptToPx, type RunStyle } from "@/lib/layout/text";

/**
 * The contentEditable ⇄ schema-v2 bridge (plan P2): the edit overlay seeds
 * real paragraph <div>s and run <span>s (so editing an imported frame is
 * WYSIWYG — mixed sizes, faces, and colors stay visible), and parses the
 * browser-mutated DOM back into paragraphs on every input.
 *
 * Styles ride DATA ATTRIBUTES (JSON), not CSS readback: when the browser
 * splits a span (Enter mid-run) it clones attributes, so styling survives
 * native editing without us interpreting computed styles. Text nodes that
 * appear outside any styled span (paste, some IME paths) inherit the nearest
 * preceding run's style — never dropped.
 */

const RUN_ATTR = "data-rs";
const PARA_ATTR = "data-pp";

type ParaProps = Pick<Paragraph, "align" | "lineSpacing" | "indent" | "firstLineIndent">;

/** Inline CSS for one run at a zoom — shared with the static TextFrameNode. */
export function runCss(run: { font: TextRun["font"]; color: string }, zoom: number) {
  return {
    fontFamily: fontStack(run.font.family),
    fontSize: `${ptToPx(run.font.size, zoom)}px`,
    fontWeight: run.font.bold ? "700" : "400",
    fontStyle: run.font.italic ? "italic" : "normal",
    textDecoration: run.font.underline ? "underline" : "none",
    color: run.color,
  } as const;
}

/** Inline CSS for one paragraph at a zoom — shared with TextFrameNode. */
export function paraCss(p: ParaProps, zoom: number) {
  return {
    textAlign: p.align,
    lineHeight: String(p.lineSpacing),
    paddingLeft: p.indent ? `${p.indent * 96 * zoom}px` : "",
    textIndent: p.firstLineIndent ? `${p.firstLineIndent * 96 * zoom}px` : "",
  } as const;
}

function paraProps(p: Paragraph): ParaProps {
  return {
    align: p.align,
    lineSpacing: p.lineSpacing,
    ...(p.indent !== undefined ? { indent: p.indent } : {}),
    ...(p.firstLineIndent !== undefined ? { firstLineIndent: p.firstLineIndent } : {}),
  };
}

/** Build the overlay's children from the document text. */
export function seedEditableDom(el: HTMLElement, text: TextProps, zoom: number): void {
  el.replaceChildren();
  for (const p of text.paragraphs) {
    const div = document.createElement("div");
    div.setAttribute(PARA_ATTR, JSON.stringify(paraProps(p)));
    Object.assign(div.style, paraCss(p, zoom));
    let wrote = false;
    for (const r of p.runs) {
      if (r.text === "") continue;
      const span = document.createElement("span");
      span.setAttribute(RUN_ATTR, JSON.stringify({ font: r.font, color: r.color }));
      Object.assign(span.style, runCss(r, zoom));
      span.textContent = r.text;
      div.appendChild(span);
      wrote = true;
    }
    if (!wrote) {
      // Empty paragraph: a lone <br> keeps the line visible and clickable —
      // its style rides an empty styled span so typing continues in it. The
      // br is MARKED as a placeholder so the parser never reads it as a real
      // line break once typing puts text beside it.
      const span = document.createElement("span");
      const style = p.runs[0];
      span.setAttribute(RUN_ATTR, JSON.stringify({ font: style.font, color: style.color }));
      Object.assign(span.style, runCss(style, zoom));
      div.appendChild(span);
      const br = document.createElement("br");
      br.setAttribute("data-ph", "1");
      div.appendChild(br);
    }
    el.appendChild(div);
  }
}

function parseRunStyle(node: Node | null): RunStyle | undefined {
  for (let n = node; n && n.nodeType === Node.ELEMENT_NODE; n = n.parentNode) {
    const raw = (n as Element).getAttribute(RUN_ATTR);
    if (raw) {
      try {
        return JSON.parse(raw) as RunStyle;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Flat tokens of one paragraph container: styled text and explicit breaks. */
function inlineTokens(container: Node, lastStyle: { current: RunStyle }): { text: string; style: RunStyle }[] {
  const tokens: { text: string; style: RunStyle }[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const style = parseRunStyle(node.parentNode) ?? lastStyle.current;
      lastStyle.current = style;
      tokens.push({ text: (node as Text).data, style });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const elNode = node as Element;
    if (elNode.tagName === "BR") {
      // our seeded empty-line placeholder is layout, not content
      if (!elNode.hasAttribute("data-ph")) tokens.push({ text: "\n", style: lastStyle.current });
      return;
    }
    const own = parseRunStyle(elNode);
    if (own) lastStyle.current = own;
    elNode.childNodes.forEach(visit);
  };
  if (container.nodeType === Node.ELEMENT_NODE || container.nodeType === Node.TEXT_NODE) visit(container);
  return tokens;
}

function tokensToRuns(
  tokens: { text: string; style: RunStyle }[],
  fallback: RunStyle,
): Paragraph["runs"] {
  // A trailing <br> is the browser's line placeholder, not content — drop it
  // when anything else precedes it; a lone break IS the empty line.
  if (tokens.length > 1 && tokens[tokens.length - 1].text === "\n") tokens = tokens.slice(0, -1);
  if (tokens.length === 1 && tokens[0].text === "\n") tokens = [{ text: "", style: tokens[0].style }];
  const runs: { text: string; font: RunStyle["font"]; color: string }[] = [];
  for (const t of tokens) {
    const prev = runs[runs.length - 1];
    if (prev && JSON.stringify([prev.font, prev.color]) === JSON.stringify([t.style.font, t.style.color])) {
      prev.text += t.text;
    } else {
      runs.push({ text: t.text, font: t.style.font, color: t.style.color });
    }
  }
  if (!runs.length) runs.push({ text: "", font: fallback.font, color: fallback.color });
  return runs;
}

function parseParaProps(node: Node, last: ParaProps): ParaProps {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const raw = (node as Element).getAttribute(PARA_ATTR);
    if (raw) {
      try {
        return { ...last, ...(JSON.parse(raw) as ParaProps) };
      } catch {
        /* fall through to inherited */
      }
    }
  }
  return last;
}

const isBlock = (n: Node): boolean =>
  n.nodeType === Node.ELEMENT_NODE && ["DIV", "P"].includes((n as Element).tagName);

/**
 * The overlay's DOM → paragraphs. Root-level inline content (the first line
 * often has no wrapping div) forms the leading paragraph; each block element
 * is a paragraph; paragraph props inherit forward when the browser creates
 * bare divs (Enter usually clones attributes, but not always).
 */
export function parseEditableDom(el: HTMLElement, fallback: RunStyle, firstPara: ParaProps): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lastStyle = { current: fallback };
  let lastPara: ParaProps = firstPara;
  let looseTokens: { text: string; style: RunStyle }[] | null = null;

  const flushLoose = () => {
    if (!looseTokens) return;
    paragraphs.push({ ...lastPara, runs: tokensToRuns(looseTokens, lastStyle.current) });
    looseTokens = null;
  };

  el.childNodes.forEach((node) => {
    if (isBlock(node)) {
      flushLoose();
      lastPara = parseParaProps(node, lastPara);
      paragraphs.push({ ...lastPara, runs: tokensToRuns(inlineTokens(node, lastStyle), lastStyle.current) });
    } else {
      (looseTokens ??= []).push(...inlineTokens(node, lastStyle));
    }
  });
  flushLoose();

  if (!paragraphs.length) {
    paragraphs.push({ ...firstPara, runs: [{ text: "", font: fallback.font, color: fallback.color }] });
  }
  return paragraphs;
}

/* ── Caret round-trip: plain-text offset (matching textContent()) ── */

/** Linear positions: text node characters; +1 between block paragraphs; <br> = 1. */
function* walkPositions(el: HTMLElement): Generator<{ node: Node; offset: number; pos: number }> {
  let pos = 0;
  let firstBlock = true;
  const visitInline = function* (node: Node): Generator<{ node: Node; offset: number; pos: number }> {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node as Text).data.length;
      for (let i = 0; i <= len; i++) yield { node, offset: i, pos: pos + i };
      pos += len;
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as Element).tagName === "BR") {
        if (!(node as Element).hasAttribute("data-ph")) pos += 1;
        return;
      }
      for (const child of Array.from(node.childNodes)) yield* visitInline(child);
    }
  };
  for (const node of Array.from(el.childNodes)) {
    if (isBlock(node)) {
      if (!firstBlock) pos += 1; // the \n between paragraphs
      firstBlock = false;
      yield { node, offset: 0, pos };
      for (const child of Array.from(node.childNodes)) yield* visitInline(child);
    } else {
      firstBlock = false;
      yield* visitInline(node);
    }
  }
}

/** The caret's plain-text offset within the overlay, or null when outside. */
export function captureCaretOffset(el: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel?.focusNode || !el.contains(sel.focusNode)) return null;
  let last = 0;
  for (const p of walkPositions(el)) {
    if (p.node === sel.focusNode && p.offset === sel.focusOffset) return p.pos;
    last = p.pos;
  }
  // focus is on an element boundary the walk didn't enumerate — clamp to end
  return sel.focusNode.nodeType === Node.ELEMENT_NODE ? null : last;
}

/** Put the caret back at a plain-text offset (after a reseed). */
export function restoreCaretOffset(el: HTMLElement, target: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  let best: { node: Node; offset: number } | null = null;
  for (const p of walkPositions(el)) {
    if (p.node.nodeType !== Node.TEXT_NODE && p.pos <= target) continue;
    if (p.pos <= target && p.node.nodeType === Node.TEXT_NODE) best = { node: p.node, offset: p.offset };
    if (p.pos >= target && best) break;
  }
  const range = document.createRange();
  if (best) {
    range.setStart(best.node, best.offset);
  } else {
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
