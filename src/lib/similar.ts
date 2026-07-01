import type { FeedbackItem } from "@/schema";

/**
 * "Similar items while typing" — consolidation at the source, ported exactly from
 * the handoff prototype (tokens() / computeSimilar()). Keyword overlap is the
 * intended POC fidelity; production backs this with real similarity search.
 */

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "when", "over", "into", "from",
  "without", "doing", "does", "dont", "cant", "are", "was", "but", "out", "its",
  "has", "get", "got", "use", "let", "you", "your",
]);

export function tokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Up to `max` open items ranked by token overlap with the draft title, then by
 * votes. Delivered ('done') items are excluded — you can't back what already
 * shipped. Under 3 meaningful characters, or gibberish, matches nothing.
 */
export function similarItems(items: FeedbackItem[], title: string, max = 3): FeedbackItem[] {
  const q = title || "";
  if (q.trim().length < 3) return [];
  const qt = tokens(q);
  if (!qt.length) return [];

  return items
    .filter((i) => i.status !== "done")
    .map((i) => {
      const itk = tokens(i.title + " " + i.area);
      let overlap = 0;
      for (const t of qt) {
        if (itk.some((w) => w.includes(t) || t.includes(w))) overlap++;
      }
      return { item: i, overlap };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.item.votes - a.item.votes)
    .slice(0, max)
    .map((x) => x.item);
}
