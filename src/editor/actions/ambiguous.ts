import type { Editor } from "../createEditor";

/** `A` on the hovered cell (SPEC §15.5). Marks never change painting, counts or exports. */
export function toggleAmbiguous(ed: Editor) {
  const c = ed.state.hoverCell, p = ed.doc;
  if (!c || c.x < 0 || c.y < 0 || c.x >= p.w || c.y >= p.h) return;
  const i = c.y * p.w + c.x;
  ed.history.transaction("ambiguous", () => {
    if (p.layers.ambiguous.has(i)) p.layers.ambiguous.delete(i);
    else p.layers.ambiguous.add(i);
  });
  ed.changed();
}

let lastVisited = -1;

export function nextAmbiguous(ed: Editor) {
  const marks = [...ed.doc.layers.ambiguous].sort((a, b) => a - b);
  if (!marks.length) return;
  const next = marks.find((i) => i > lastVisited) ?? marks[0]!;
  lastVisited = next;
  ed.viewport.centreOn(next);
}

export function clearAmbiguous(ed: Editor) {
  ed.history.transaction("ambiguous", () => ed.doc.layers.ambiguous.clear());
  ed.changed();
}
