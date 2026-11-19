import type { CheckItem, Marks } from "./types";

/*
 * The results of a check, in a few lines (SPEC §15.51): not "17 issues" but "issues only with your own beads and
 * bead sizes". Each item says what it tests (its tags); the issues are explained by as few tags as possible — first
 * those every marked item of fails, then the ones most of whose items fail.
 */

export interface SummaryLine {
  tag: string;
  /** Items with the tag marked "issues". */
  issues: number;
  /** Items with the tag marked at all. */
  of: number;
}

export interface Summary {
  total: number;
  ok: number;
  issues: number;
  /** Not marked yet. */
  left: number;
  /** What the issues have in common, most telling first; every item with issues is covered by one of them. */
  lines: SummaryLine[];
}

export function summarize(items: readonly CheckItem[], marks: Marks): Summary {
  const marked = items.filter((i) => marks[i.id]);
  const bad = marked.filter((i) => marks[i.id]!.v === "issue");
  const stats = new Map<string, SummaryLine>();
  for (const i of marked)
    for (const tag of i.tags) {
      const s = stats.get(tag) ?? stats.set(tag, { tag, issues: 0, of: 0 }).get(tag)!;
      s.of++;
      if (marks[i.id]!.v === "issue") s.issues++;
    }
  const lines: SummaryLine[] = [];
  let left = new Set(bad);
  while (left.size) {
    let best: { s: SummaryLine; covers: number } | null = null;
    for (const s of stats.values()) {
      if (lines.includes(s)) continue;
      const covers = [...left].filter((i) => i.tags.includes(s.tag)).length;
      if (!covers) continue;
      // the share of its items that fail first, then how many issues it explains
      const better = !best || s.issues / s.of > best.s.issues / best.s.of || (s.issues / s.of === best.s.issues / best.s.of && covers > best.covers);
      if (better) best = { s, covers };
    }
    // an item with issues and no tags: nothing to say about it in common
    if (!best) break;
    lines.push(best.s);
    left = new Set([...left].filter((i) => !i.tags.includes(best.s.tag)));
  }
  return { total: items.length, ok: marked.length - bad.length, issues: bad.length, left: items.length - marked.length, lines };
}
