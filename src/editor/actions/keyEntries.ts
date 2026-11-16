import type { ColorEntry } from "@/core/color/colorEntry";
import { computeUsage, entryCount, partialCount } from "@/core/calculator/usage";
import { entryKind } from "@/core/entryKinds/registry";
import { LAYERS } from "@/core/layers/registry";
import { addEntry, cleanEntry, entryLayer, findSameKey, nextSymbol } from "@/core/pattern/keyEntries";
import { makeBlendColor, makeComboColor, resolveColor, invalidateColors } from "@/core/pattern/resolve";
import { shortId } from "@/core/pattern/createPattern";
import { DEFAULT_LINE_INK } from "@/core/symbols/lineInks";
import { isLineStyle } from "@/core/symbols/lineStyles";
import type { BlendPart, CustomColor, EntryKindId, KeyEntry, KeyIndex, StitchTypeId } from "@/core/pattern/types";
import type { Editor } from "../createEditor";

/** What the key-entry dialog edits (SPEC §8). */
export interface KeyDraft {
  t: EntryKindId;
  mode: "single" | "blend";
  thread: string;
  slots: { id: string | null; n: number }[];
  bead: string;
  n: number;
  st: StitchTypeId;
  sym: string;
  wraps: number;
  /** Backstitch: the line's colour on the Symbols view and the PDF chart to print. */
  ink: string;
}

/** A symbol of the right family after the draft's kind changes: line styles for backstitch, characters otherwise. */
export function draftSymbol(ed: Editor, d: KeyDraft, t: EntryKindId, edit?: KeyIndex): string {
  return isLineStyle(d.sym) === (t === "back") ? d.sym : nextSymbol(ed.doc, ed.state.symbols, edit, t);
}

export function draftFor(ed: Editor, edit?: KeyIndex): KeyDraft {
  const p = ed.doc;
  const d: KeyDraft = {
    t: "thread", mode: "single", thread: "dmc:310", slots: [{ id: "dmc:310", n: 1 }, { id: "dmc:413", n: 1 }],
    bead: "bead:00557", n: p.strands || 2, st: "full", sym: nextSymbol(p, ed.state.symbols, edit), wraps: 2, ink: DEFAULT_LINE_INK,
  };
  const e = edit ? p.key[edit] : null;
  if (!e) return d;
  const c = resolveColor(p, e.src);
  Object.assign(d, { t: e.t, sym: e.sym, n: e.n ?? d.n, st: e.st ?? "full", wraps: e.wraps ?? 2, ink: e.ink ?? DEFAULT_LINE_INK });
  if (e.t === "bead") d.bead = e.src;
  else if (e.t === "combo" && c?.thread && c.bead) Object.assign(d, { thread: c.thread.id, bead: c.bead.id });
  else if (c?.isBlend && c.parts) Object.assign(d, { mode: "blend", slots: c.parts.map((q) => ({ id: q.entry.id, n: q.n })) });
  else d.thread = e.src;
  if (e.t === "back" && !e.n) d.n = 1;
  return d;
}

/** The draft is a blend of 2–3 threads (single-thread kinds only). */
export const usesBlend = (d: KeyDraft) => d.mode === "blend" && (d.t === "thread" || d.t === "back" || d.t === "knot");

/** Existing blend/combo id for the draft, a placeholder if it would be new, or null when incomplete. */
export function resolveDraftSource(ed: Editor, d: KeyDraft, create: boolean): string | null {
  const p = ed.doc;
  if (d.t === "bead") return d.bead;
  if (d.t === "combo") {
    if (!d.thread || !d.bead) return null;
    let id = Object.keys(p.combos).find((k) => p.combos[k]!.thread === d.thread && p.combos[k]!.bead === d.bead);
    if (!id && create) p.combos[(id = shortId("combo"))] = { thread: d.thread, bead: d.bead };
    return id ?? "combo:new";
  }
  if (usesBlend(d)) {
    const ids = d.slots.map((s) => s.id);
    if (!ids.every(Boolean) || new Set(ids).size !== ids.length) return null;
    const sig = (parts: { id: string | null; n: number }[]) => parts.map((q) => `${q.id}×${q.n}`).sort().join("|");
    let id = Object.keys(p.blends).find((k) => sig(p.blends[k]!.parts) === sig(d.slots));
    if (!id && create) p.blends[(id = shortId("blend"))] = { parts: d.slots.map((s) => ({ id: s.id!, n: s.n })) as BlendPart[] };
    return id ?? "blend:new";
  }
  return d.thread;
}

export function draftEntry(d: KeyDraft, src: string): Omit<KeyEntry, "sym"> {
  const fields = entryKind(d.t).fields;
  return {
    t: d.t,
    src,
    n: d.t === "bead" ? undefined : usesBlend(d) ? null : d.n,
    st: fields.includes("stitchType") ? d.st : undefined,
    wraps: d.t === "knot" ? d.wraps : undefined,
    ink: d.t === "back" ? d.ink : undefined,
  };
}

/** Colour for the dialog's preview, without adding anything to the pattern. */
export function draftColour(ed: Editor, d: KeyDraft): ColorEntry | undefined {
  const src = resolveDraftSource(ed, d, false);
  if (!src) return undefined;
  if (src === "combo:new") return makeComboColor(ed.doc, "combo:preview", { thread: d.thread, bead: d.bead });
  if (src === "blend:new") return makeBlendColor(ed.doc, "blend:preview", { parts: d.slots.map((s) => ({ id: s.id!, n: s.n })) });
  return resolveColor(ed.doc, src);
}

/** Index of an identical existing entry (for the "add anyway" warning), or 0. */
export function duplicateOf(ed: Editor, d: KeyDraft, edit?: KeyIndex): KeyIndex {
  const src = resolveDraftSource(ed, d, false);
  if (!src || src.endsWith(":new")) return 0;
  return findSameKey(ed.doc, draftEntry(d, src), edit);
}

export const usageCount = (ed: Editor, k: KeyIndex) => {
  const u = computeUsage(ed.doc).perEntry.get(k);
  return entryCount(u) + partialCount(u);
};

/** Add or update an entry (SPEC §8 commit rules). Returns the entry index, or null if refused. */
export function commitEntry(ed: Editor, d: KeyDraft, edit?: KeyIndex): KeyIndex | null {
  const p = ed.doc, before = edit ? p.key[edit] : null;
  const used = edit ? usageCount(ed, edit) : 0;
  const preview = resolveDraftSource(ed, d, false);
  if (!preview) return null;
  // an entry on the chart keeps its layer: no moving between cells and grid points
  if (before && used && (entryKind(d.t).group !== entryKind(before.t).group || entryLayer(cleanEntry(draftEntry(d, before.src), d.sym)) !== entryLayer(before))) {
    ed.toast("keyDialog.layerLocked");
    return null;
  }
  return ed.history.transaction("keyEntry", () => {
    const src = resolveDraftSource(ed, d, true)!;
    const entry = draftEntry(d, src);
    const other = p.key.findIndex((e, i) => e && i !== edit && e.sym === d.sym);
    if (before && edit) {
      if (other > 0) p.key[other] = { ...p.key[other]!, sym: isLineStyle(before.sym) === isLineStyle(d.sym) ? before.sym : nextSymbol(p, ed.state.symbols, other, p.key[other]!.t) };
      p.key[edit] = cleanEntry(entry, d.sym);
      if (entry.t === "combo") p.layers.stitches.forEach((k, i) => k === edit && (p.layers.beads[i] = 0));
      ed.changed({ keys: true });
      ed.setActiveEntry(edit);
      ed.toast("toasts.entryUpdated");
      return edit;
    }
    if (other > 0) p.key[other] = { ...p.key[other]!, sym: nextSymbol(p, ed.state.symbols, undefined, p.key[other]!.t) };
    if ((entry.t === "thread" || entry.t === "combo") && entry.n) p.strands = entry.n;
    const i = addEntry(p, { ...entry, sym: d.sym }, ed.state.symbols);
    ed.changed({ keys: true });
    ed.setActiveEntry(i);
    if (!["pencil", "line", "rect", "filledRect", "fill", "partial"].includes(ed.state.tool)) ed.setTool("pencil");
    ed.toast("toasts.entryAdded");
    return i;
  });
}

/** Delete an entry and everything drawn with it. Undoable (unlike the single-file app). */
export function deleteEntry(ed: Editor, i: KeyIndex) {
  const p = ed.doc;
  ed.history.transaction("deleteEntry", () => {
    for (const l of LAYERS) l.remapKeys(l.get(p.layers), (k) => (k === i ? 0 : k));
    p.key[i] = null;
  });
  if (ed.state.activeEntry === i) ed.setActiveEntry(0);
  ed.changed({ keys: true });
  ed.toast("toasts.entryDeleted");
}

export function addCustomColour(ed: Editor, c: Omit<CustomColor, "id">): string {
  const id = shortId("custom");
  ed.doc.customs[id] = { ...c, id };
  invalidateColors(ed.doc);
  ed.changed({ keys: true });
  return id;
}

export const layerOfDraft = (d: KeyDraft) => entryLayer({ t: d.t, src: "", sym: "" });
