import { clampSize, createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { cleanMeta } from "@/core/pattern/meta";
import { invalidateColors } from "@/core/pattern/resolve";
import type { GridNumbering, Pattern, PatternMeta, Point, Size } from "@/core/pattern/types";
import { reframe as reframeCore, resizePattern } from "@/core/transform/wholeChart";
import type { RefWindowData } from "@/persistence/ports";
import type { UnderlayData } from "@/core/underlay/underlay";
import type { Editor } from "../createEditor";
import { PICKING } from "../matching/matching";

/** Make `p` the edited pattern: fresh history, no selection, view fitted, its reference windows restored. */
export function loadPattern(ed: Editor, p: Pattern, refs: RefWindowData[] | null = null, underlay: UnderlayData | null = null) {
  ed.autosave.saveBeforeSwitch();
  invalidateColors(p);
  ed.history.clear();
  ed.tools.cancel();
  const keep = ed.state.activeEntry && p.key[ed.state.activeEntry] ? ed.state.activeEntry : Math.max(0, p.key.findIndex((e, i) => i > 0 && e));
  ed.keep.opening();
  ed.store.setState({ doc: p, selection: null, floating: null, activeEntry: keep, keyForm: null, match: ed.state.tool === "autofill" ? PICKING : null, overlay: { ...ed.state.overlay, chain: null, preview: null } });
  ed.changed({ keys: true, structural: true });
  ed.viewport.fit();
  void ed.references.switchTo(p.id, refs);
  void ed.underlay.switchTo(p.id, underlay);
  void ed.refreshPatterns();
}

export function newPattern(ed: Editor, o: { name: string; w: number; h: number; count: number; keepKey: boolean }) {
  const old = ed.doc;
  const p = createPattern(clampSize(o.w), clampSize(o.h), o.name.trim() || "Untitled pattern");
  p.count = o.count;
  p.strands = old.strands;
  if (o.keepKey) {
    p.key = old.key.map((e) => (e ? { ...e } : null));
    p.blends = { ...old.blends };
    p.combos = { ...old.combos };
    p.customs = { ...old.customs };
  }
  loadPattern(ed, p);
}

/** Size-changing operations: one undo step that also restores the size (SPEC §15 groundwork). */
export function reframe(ed: Editor, label: string, size: Size, offset: Point) {
  ed.history.transaction(label, () => reframeCore(ed.doc, size, offset));
  ed.store.setState({ selection: null });
  ed.changed({ structural: true });
  ed.viewport.fit();
}

export function resize(ed: Editor, w: number, h: number, anchor: "centre" | "topLeft") {
  ed.history.transaction("resize", () => resizePattern(ed.doc, clampSize(w), clampSize(h), anchor));
  ed.store.setState({ selection: null });
  ed.changed({ structural: true });
  ed.viewport.fit();
}

export function setPatternSettings(ed: Editor, s: Partial<Pick<Pattern, "name" | "count" | "fabric">> & { meta?: PatternMeta; grid?: GridNumbering }) {
  const p = ed.doc;
  if (s.name !== undefined) p.name = s.name.trim() || "Untitled pattern";
  if (s.count !== undefined) p.count = s.count;
  if (s.fabric !== undefined) p.fabric = s.fabric;
  if (s.meta) p.meta = cleanMeta(s.meta);
  if (s.grid) p.grid = s.grid;
  ed.changed();
}

/** The demo heart shown on first start (SPEC §9.2). */
export function demoPattern(symbols: readonly string[]): Pattern {
  const p = createPattern(60, 60, "Untitled pattern");
  const add = (e: Parameters<typeof addEntry>[1]) => addEntry(p, e, symbols);
  const red = add({ t: "thread", src: "dmc:321", n: 2, st: "full" });
  const dark = add({ t: "thread", src: "dmc:498", n: 3, st: "full" });
  p.blends["blend:demo"] = { parts: [{ id: "dmc:3713", n: 1 }, { id: "dmc:Ecru", n: 1 }] };
  const blend = add({ t: "thread", src: "blend:demo", n: null, st: "full" });
  p.combos["combo:demo"] = { thread: "dmc:3371", bead: "bead:00557" };
  const combo = add({ t: "combo", src: "combo:demo", n: 2, st: "half" });
  const half = add({ t: "thread", src: "dmc:310", n: 1, st: "half" });
  const gold = add({ t: "bead", src: "bead:02011" });
  const back = add({ t: "back", src: "dmc:3371", n: 1 });
  add({ t: "thread", src: "dmc:3865", n: 2, st: "full" });
  const heart = ["..XX...XX..", ".XXXX.XXXX.", "XXXXXXXXXXX", "XXXXXXXXXXX", "XXXXXXXXXXX", ".XXXXXXXXX.", "..XXXXXXX..", "...XXXXX...", "....XXX....", ".....X....."];
  const S = p.layers.stitches, W = p.w;
  heart.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== "X") return;
      const edge = heart[y - 1]?.[x] !== "X" || heart[y + 1]?.[x] !== "X" || row[x - 1] !== "X" || row[x + 1] !== "X";
      S[(22 + y) * W + 24 + x] = edge ? dark : red;
    }),
  );
  for (let x = 18; x < 42; x++) {
    S[18 * W + x] = blend;
    S[35 * W + x] = half;
  }
  for (const [x, y] of [[26, 24], [32, 24], [29, 27]] as const) S[y * W + x] = combo;
  for (const x of [20, 39]) {
    p.layers.beads[20 * W + x] = gold;
    p.layers.beads[33 * W + x] = gold;
  }
  p.layers.segments.push({ x1: 18, y1: 17, x2: 42, y2: 17, k: back }, { x1: 18, y1: 19, x2: 42, y2: 19, k: back }, { x1: 18, y1: 17, x2: 18, y2: 19, k: back }, { x1: 42, y1: 17, x2: 42, y2: 19, k: back });
  return p;
}
