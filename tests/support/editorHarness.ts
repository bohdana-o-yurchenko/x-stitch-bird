import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import type { KeyEntry, KeyIndex } from "@/core/pattern/types";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { loadPattern } from "@/editor/actions/pattern";
import { Editor } from "@/editor/createEditor";
import type { ToolPointer } from "@/editor/tools/types";
import type { Snapshot } from "@/persistence/ports";
import { memoryPersistence } from "./memoryPersistence";

/** A pointer event on cell (x, y); `grid` defaults to the cell's centre. */
export const at = (x: number, y: number, o: Partial<ToolPointer> = {}): ToolPointer => ({ sx: 0, sy: 0, grid: { x: x + 0.5, y: y + 0.5 }, cell: { x, y }, button: 0, shift: false, alt: false, ...o });

/** A pointer event on a grid point (for backstitch and knots). */
export const point = (x: number, y: number, o: Partial<ToolPointer> = {}): ToolPointer => at(Math.floor(x), Math.floor(y), { grid: { x, y }, ...o });

/** An editor with in-memory storage and an empty w×h pattern whose key has one red full cross (`red`, active). */
export function testEditor(w = 10, h = 10) {
  const snaps: Snapshot[] = [];
  const ed = new Editor(memoryPersistence(snaps), false);
  ed.store.setState({ symbols: [...ALL_SYMBOLS] });
  const p = createPattern(w, h);
  const red = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
  loadPattern(ed, p);
  // as after start-up: the pattern above is the real one, not the placeholder
  ed.store.setState({ ready: true });
  /** Adds a key entry and makes it the active one. */
  const entry = (e: Omit<KeyEntry, "sym">): KeyIndex => {
    const k = addEntry(ed.doc, e, ALL_SYMBOLS);
    ed.changed({ keys: true });
    ed.setActiveEntry(k);
    return k;
  };
  /** Press, drag through the given cells, release. */
  const drag = (...cells: [number, number][]) => {
    ed.tools.down(at(...cells[0]!));
    for (const c of cells.slice(1)) ed.tools.move(at(...c));
    ed.tools.up(at(...cells[cells.length - 1]!));
  };
  const stitch = (x: number, y: number) => ed.doc.layers.stitches[y * ed.doc.w + x];
  const lastToast = () => ed.state.toasts[ed.state.toasts.length - 1]?.key;
  return { ed, snaps, red, entry, drag, stitch, lastToast };
}
