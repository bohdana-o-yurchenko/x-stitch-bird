import { applyMaterials, NEW_MATERIALS, type Materials } from "@/core/pattern/brands";
import { clampSize, createPattern } from "@/core/pattern/createPattern";
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
  // signed in: its own threads join the inventory, its copies catch up
  void ed.inventory.withPattern(p);
  ed.live.opened(p.id);
}

/**
 * The open pattern as changed in another window or device (SPEC §15.34): its content replaced, the view, tool and
 * windows kept; undo starts afresh (its steps were made on the old content). Nothing to save: the account has it.
 */
export function replaceDoc(ed: Editor, p: Pattern) {
  invalidateColors(p);
  ed.history.clear();
  ed.tools.cancel();
  const keep = ed.state.activeEntry && p.key[ed.state.activeEntry] ? ed.state.activeEntry : Math.max(0, p.key.findIndex((e, i) => i > 0 && e));
  ed.store.setState({ doc: p, selection: null, floating: null, activeEntry: keep, keyForm: null });
  ed.changed({ keys: true, structural: true });
  ed.autosave.markSaved();
}

export type NewPatternOptions = { name: string; w: number; h: number; count: number; keepKey: boolean; materials?: Materials };

export function newPattern(ed: Editor, o: NewPatternOptions) {
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
  if (o.materials) applyMaterials(p, o.materials);
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

export function setPatternSettings(ed: Editor, s: Partial<Pick<Pattern, "name" | "count" | "fabric" | "brands">> & { meta?: PatternMeta; grid?: GridNumbering; materials?: Materials }) {
  const p = ed.doc;
  if (s.name !== undefined) p.name = s.name.trim() || "Untitled pattern";
  if (s.count !== undefined) p.count = s.count;
  if (s.fabric !== undefined) p.fabric = s.fabric;
  if (s.meta) p.meta = cleanMeta(s.meta);
  if (s.grid) p.grid = s.grid;
  if (s.brands) p.brands = [...new Set(s.brands)];
  if (s.materials) applyMaterials(p, s.materials);
  ed.changed();
}

/** The demo heart shown on first start (SPEC §9.2). */
/** Nothing in it — no key, no stitches: what's shown while a new pattern is being started (SPEC §15.37). */
export function emptyPattern(): Pattern {
  const p = createPattern(60, 60, "Untitled pattern");
  applyMaterials(p, NEW_MATERIALS);
  return p;
}

/** The demo pattern lives in core: the landing page draws it too (SPEC §15.53). */
export { demoPattern } from "@/core/pattern/demo";
