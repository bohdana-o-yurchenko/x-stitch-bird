import { stampsLayer } from "@/core/layers/stamps";
import type { KeyIndex, Point, Segment, Stamp, StampDef } from "@/core/pattern/types";
import { cleanStampDef, OWN_STAMP, placeStampAt, stampDef, stampLines, stampOrigin } from "@/core/stamps/stamps";
import { shortId } from "@/core/pattern/createPattern";
import { mirrorTransforms } from "@/core/transform/mirror";
import type { Editor } from "../createEditor";

/** The stamp entry `k` places, with its block's middle on `cell`, kept inside the chart; null when it doesn't fit. */
export function stampUnder(ed: Editor, cell: Point, k: KeyIndex): { stamp: Stamp; def: StampDef } | null {
  const p = ed.doc, def = stampDef(p, p.key[k]?.stamp);
  if (!def || def.w > p.w || def.h > p.h) return null;
  const o = stampOrigin(def, cell);
  const x = Math.min(Math.max(0, o.x), p.w - def.w), y = Math.min(Math.max(0, o.y), p.h - def.h);
  return { stamp: placeStampAt(def, x, y, k), def };
}

/** The stamp and its mirror images (mirror mode, SPEC §15.3), each once. */
function withMirrors(ed: Editor, s: Stamp): Stamp[] {
  const size = { w: ed.doc.w, h: ed.doc.h }, out = [s];
  for (const t of mirrorTransforms(ed.state.mirror)) {
    const m = stampsLayer.transform([s], t, size, { repoint: (k) => k })[0]!;
    if (!out.some((o) => o.x === m.x && o.y === m.y && o.w === m.w && o.h === m.h)) out.push(m);
  }
  return out;
}

/**
 * Places a stamp of entry `k` on `cell` (ARCHITECTURE-REVIEW §3), mirrored as mirror mode says. A block that already
 * holds a stamp keeps it unless overriding. Returns the stamp placed, or null.
 */
export function placeStamp(ed: Editor, cell: Point, k: KeyIndex): Stamp | null {
  const at = stampUnder(ed, cell, k);
  if (!at) return null;
  const v = ed.doc.layers.stamps;
  for (const s of withMirrors(ed, at.stamp)) {
    const there = v.findIndex((o) => o.x === s.x && o.y === s.y && o.w === s.w && o.h === s.h);
    if (there >= 0 && !ed.state.override) continue;
    if (there >= 0) v.splice(there, 1);
    v.push(s);
  }
  return at.stamp;
}

/** The lines a stamp would add under the pointer, mirror images included: the hover preview. */
export function stampPreview(ed: Editor, cell: Point, k: KeyIndex): Segment[] | null {
  const at = stampUnder(ed, cell, k);
  if (!at) return null;
  return withMirrors(ed, at.stamp).flatMap((s) => stampLines(s, at.def));
}

/**
 * Keeps a stamp drawn by the user in the pattern (it travels with the .xbird file) and returns its id: the same
 * drawing as one the pattern has gives that one, not a copy.
 */
export function addOwnStamp(ed: Editor, d: Omit<StampDef, "id">): string {
  const p = ed.doc, same = (o: StampDef) => o.w === d.w && o.h === d.h && JSON.stringify(o.lines) === JSON.stringify(d.lines);
  const found = Object.values(p.stamps ?? {}).find(same);
  if (found) {
    if (d.name && d.name !== found.name) p.stamps![found.id] = { ...found, name: d.name };
    ed.changed({ keys: true });
    return found.id;
  }
  const def = cleanStampDef({ ...d, id: `${OWN_STAMP}${shortId("s").slice(2)}` });
  if (!def) return "";
  (p.stamps ??= {})[def.id] = def;
  ed.changed({ keys: true });
  return def.id;
}
