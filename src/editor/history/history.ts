import { changedCells } from "@/core/layers/cellDiff";
import { LAYERS, layerHandler } from "@/core/layers/registry";
import type { KeyEntry, LayerId, Layers, Pattern } from "@/core/pattern/types";

interface KeyState {
  key: (KeyEntry | null)[];
  blends: Pattern["blends"];
  combos: Pattern["combos"];
  customs: Pattern["customs"];
}
interface DocState extends KeyState {
  w: number;
  h: number;
  layers: Layers;
}

type Patch =
  | { kind: "cells"; layer: LayerId; idx: Uint32Array; before: Uint16Array; after: Uint16Array }
  | { kind: "items"; layer: LayerId; before: unknown; after: unknown }
  | { kind: "keys"; before: KeyState; after: KeyState }
  | { kind: "document"; before: DocState; after: DocState };

const MAX_STEPS = 60;

const captureKeys = (p: Pattern): KeyState => ({
  key: p.key.map((e) => (e ? { ...e } : null)),
  blends: { ...p.blends },
  combos: { ...p.combos },
  customs: { ...p.customs },
});

const capture = (p: Pattern): DocState => ({
  ...captureKeys(p),
  w: p.w,
  h: p.h,
  layers: Object.fromEntries(LAYERS.map((l) => [l.id, l.clone(l.get(p.layers))])) as unknown as Layers,
});

const restoreKeys = (p: Pattern, s: KeyState) => {
  p.key = s.key.map((e) => (e ? { ...e } : null));
  p.blends = { ...s.blends };
  p.combos = { ...s.combos };
  p.customs = { ...s.customs };
};

function diff(p: Pattern, before: DocState): Patch[] {
  if (p.w !== before.w || p.h !== before.h) return [{ kind: "document", before, after: capture(p) }];
  const patches: Patch[] = [];
  for (const l of LAYERS) {
    const a = l.get(before.layers), b = l.get(p.layers);
    if (a instanceof Uint16Array && b instanceof Uint16Array && a.length === b.length) {
      // one pass over the cells: what changed is the patch, nothing changed is no patch
      const ix = changedCells(b, a);
      if (ix.length) patches.push({ kind: "cells", layer: l.id, idx: ix, before: Uint16Array.from(ix, (i) => a[i] ?? 0), after: Uint16Array.from(ix, (i) => b[i] ?? 0) });
    } else if (!l.equals(a, b)) patches.push({ kind: "items", layer: l.id, before: a, after: l.clone(b) });
  }
  const keysNow = captureKeys(p);
  if (JSON.stringify(keysNow) !== JSON.stringify({ key: before.key, blends: before.blends, combos: before.combos, customs: before.customs }))
    patches.push({ kind: "keys", before, after: keysNow });
  return patches;
}

function apply(p: Pattern, patches: Patch[], side: "before" | "after") {
  const list = side === "before" ? [...patches].reverse() : patches;
  for (const patch of list) {
    if (patch.kind === "cells") {
      const arr = layerHandler(patch.layer).get(p.layers) as Uint16Array, vals = patch[side];
      patch.idx.forEach((i, j) => (arr[i] = vals[j] ?? 0));
    } else if (patch.kind === "items") {
      const h = layerHandler(patch.layer);
      h.set(p.layers, h.clone(patch[side]));
    } else if (patch.kind === "keys") restoreKeys(p, patch[side]);
    else {
      const s = patch[side];
      p.w = s.w;
      p.h = s.h;
      restoreKeys(p, s);
      for (const l of LAYERS) l.set(p.layers, l.clone(l.get(s.layers)));
    }
  }
}

/**
 * Undo/redo as patches (ARCHITECTURE §5.3). Edits happen between `begin` and `commit`; the history diffs
 * the document against its state at `begin`. Empty transactions are dropped.
 */
export class History {
  private undoStack: { label: string; patches: Patch[] }[] = [];
  private redoStack: { label: string; patches: Patch[] }[] = [];
  private open: { label: string; before: DocState } | null = null;

  constructor(private doc: () => Pattern, private onChange: (info: { structural: boolean; keys: boolean }) => void) {}

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  get inTransaction() {
    return !!this.open;
  }

  begin(label: string) {
    if (this.open) this.commit();
    this.open = { label, before: capture(this.doc()) };
  }

  /** Returns true when something changed. */
  commit(): boolean {
    if (!this.open) return false;
    const { label, before } = this.open;
    this.open = null;
    const patches = diff(this.doc(), before);
    if (!patches.length) return false;
    this.undoStack.push({ label, patches });
    if (this.undoStack.length > MAX_STEPS) this.undoStack.shift();
    this.redoStack = [];
    this.notify(patches);
    return true;
  }

  /** Throw away the open transaction and restore the document as it was at `begin`. */
  cancel() {
    if (!this.open) return;
    const patches = diff(this.doc(), this.open.before);
    this.open = null;
    apply(this.doc(), patches, "before");
    if (patches.length) this.notify(patches);
  }

  transaction<T>(label: string, fn: () => T): T {
    this.begin(label);
    try {
      return fn();
    } finally {
      this.commit();
    }
  }

  undo() {
    if (this.open) this.cancel();
    const step = this.undoStack.pop();
    if (!step) return;
    apply(this.doc(), step.patches, "before");
    this.redoStack.push(step);
    this.notify(step.patches);
  }

  redo() {
    const step = this.redoStack.pop();
    if (!step) return;
    apply(this.doc(), step.patches, "after");
    this.undoStack.push(step);
    this.notify(step.patches);
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.open = null;
  }

  private notify(patches: Patch[]) {
    this.onChange({
      structural: patches.some((p) => p.kind === "document"),
      keys: patches.some((p) => p.kind === "keys" || p.kind === "document"),
    });
  }
}
