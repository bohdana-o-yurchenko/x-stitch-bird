import { blockAt, blockImageRect, cellPatches, learn, libraryExamples, matchBlock, type Patch } from "@/core/matching/match";
import { createPattern } from "@/core/pattern/createPattern";
import type { KeyIndex, Pattern, Point, Rect } from "@/core/pattern/types";
import { greyRegion } from "@/platform/images";
import type { Editor } from "../createEditor";

/*
 * Symbol matching in the editor (SPEC §15.11). Shift+F turns the mode on; the 10 × 10 block under the pointer
 * is outlined; a click reads that block off the photo and shows the sure proposals faintly, with Accept and
 * Decline above the block. Either one (or Esc) ends the mode. Unsure cells stay empty.
 */

export type MatchState =
  | { phase: "pick"; hover: Rect | null }
  | { phase: "review"; block: Rect; proposals: { cell: number; k: KeyIndex }[]; unsure: number; ghosts: Pattern };

/** Matching needs the photo behind the chart, shown and loaded. */
export const canMatch = (ed: Editor) => !!ed.state.underlay?.visible && !!ed.state.underlayImage;

export function toggleMatching(ed: Editor) {
  if (ed.state.match) return endMatching(ed);
  if (!canMatch(ed)) return ed.toast("toasts.matchNeedsUnderlay");
  ed.tools.cancel();
  // the photo goes behind the chart so the pointer picks blocks instead of moving the image
  if (ed.underlay.editing) ed.underlay.setBehind(true);
  const cell = ed.state.hoverCell;
  ed.store.setState({ match: { phase: "pick", hover: cell && inChart(ed, cell) ? blockAt(ed.doc, cell.x, cell.y) : null } });
}

export const endMatching = (ed: Editor) => ed.store.setState({ match: null });

const inChart = (ed: Editor, c: Point) => c.x >= 0 && c.y >= 0 && c.x < ed.doc.w && c.y < ed.doc.h;

export function hoverMatching(ed: Editor, cell: Point) {
  const m = ed.state.match;
  if (m?.phase !== "pick") return;
  const hover = inChart(ed, cell) ? blockAt(ed.doc, cell.x, cell.y) : null;
  if (hover?.x === m.hover?.x && hover?.y === m.hover?.y && hover?.w === m.hover?.w) return;
  ed.store.setState({ match: { phase: "pick", hover } });
}

/** A click in pick mode: read the block under the pointer. */
export function pickBlock(ed: Editor, cell: Point) {
  const u = ed.state.underlay, img = ed.state.underlayImage;
  if (ed.state.match?.phase !== "pick" || !inChart(ed, cell) || !u || !img) return;
  const block = blockAt(ed.doc, cell.x, cell.y), area = blockImageRect(u, block);
  if (!area.w || !area.h) return ed.toast("toasts.matchOffPhoto");
  reviewBlock(ed, block, cellPatches(u, greyRegion(img, area), block, ed.doc.w));
}

/** What a cell holds for learning: its cross (or combo) or its bead, when that is all it holds. */
function heldEntry(p: Pattern, i: number): KeyIndex {
  if (p.layers.partials.has(i)) return 0;
  return p.layers.stitches[i] || p.layers.beads[i] || 0;
}

const isEmpty = (p: Pattern, i: number) => !p.layers.stitches[i] && !p.layers.beads[i] && !p.layers.partials.has(i);

/**
 * Matches a block from its cells as cut out of the photo: learns from the block's stitched cells (kept with the
 * pattern), then proposes symbols for its empty ones.
 */
export function reviewBlock(ed: Editor, block: Rect, patches: Map<number, Patch>) {
  const p = ed.doc, found: { k: KeyIndex; patch: Patch }[] = [], empty: number[] = [];
  for (const [i, patch] of patches) {
    const k = heldEntry(p, i);
    if (k && p.key[k]) found.push({ k, patch });
    else if (isEmpty(p, i)) empty.push(i);
  }
  if (found.length) {
    learn(p, found);
    ed.autosave.schedule();
  }
  const examples = libraryExamples(p);
  if (!examples.size) return ed.toast("toasts.matchNoExamples");
  if (!empty.length) return ed.toast("toasts.matchNothingEmpty");
  const r = matchBlock({ patches, empty, examples });
  const ghosts = createPattern(block.w, block.h);
  ghosts.key = p.key;
  ghosts.blends = p.blends;
  ghosts.combos = p.combos;
  ghosts.customs = p.customs;
  for (const { cell, k } of r.proposals) {
    const gi = (((cell / p.w) | 0) - block.y) * block.w + (cell % p.w) - block.x;
    if (p.key[k]?.t === "bead") ghosts.layers.beads[gi] = k;
    else ghosts.layers.stitches[gi] = k;
  }
  ed.store.setState({ match: { phase: "review", block, proposals: r.proposals, unsure: r.unsure.length, ghosts } });
}

/** Writes the proposals (one undo step) into cells still empty, and ends the mode. */
export function acceptMatching(ed: Editor) {
  const m = ed.state.match;
  if (m?.phase !== "review") return;
  const p = ed.doc;
  ed.history.transaction("match", () => {
    for (const { cell, k } of m.proposals) {
      if (!isEmpty(p, cell) || !p.key[k]) continue;
      if (p.key[k]!.t === "bead") p.layers.beads[cell] = k;
      else p.layers.stitches[cell] = k;
    }
  });
  endMatching(ed);
}
