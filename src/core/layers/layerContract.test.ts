import { describe, expect, it } from "vitest";
import { createPattern } from "../pattern/createPattern";
import { addEntry } from "../pattern/keyEntries";
import type { Pattern } from "../pattern/types";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { TRANSFORMS } from "../transform/cellTransform";
import { LAYERS } from "./registry";
import type { TransformContext } from "./types";

// ARCHITECTURE §12: one suite every layer must pass. A new layer is covered by adding it to the registry.

function sample(): Pattern {
  const p = createPattern(7, 5);
  const k = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
  const b = addEntry(p, { t: "bead", src: "bead:00557" }, ALL_SYMBOLS);
  const { layers } = p;
  layers.stitches.set([k, k, 0, k], 3);
  layers.beads[12] = b;
  layers.partials.set(20, [{ kind: "quarter", corner: 1, k }, { kind: "threeQuarter", corner: 3, k }]);
  layers.segments.push({ x1: 1, y1: 1, x2: 3.5, y2: 2, k });
  layers.knots.push({ x: 2.5, y: 3, k });
  layers.ambiguous.add(6).add(33);
  // a Smyrna cross as drawn, and one's own stamp turned a quarter (its block 2 wide, 3 tall)
  const back = addEntry(p, { t: "back", src: "dmc:321", n: 1, stamp: "smyrna2" }, ALL_SYMBOLS);
  layers.stamps.push({ x: 0, y: 0, w: 2, h: 2, def: "smyrna2", k: back }, { x: 4, y: 1, w: 2, h: 3, def: "own:a", k: back, m: [0, -1, 1, 0] });
  return p;
}

const identity: TransformContext = { repoint: (k) => k };
const all = (p: Pattern) => ({ x: 0, y: 0, w: p.w, h: p.h });

describe.each(LAYERS.map((l) => [l.id, l] as const))("layer %s", (_id, layer) => {
  const p = sample();
  const size = { w: p.w, h: p.h };
  const v = layer.get(p.layers);

  it("has content in the sample", () => expect(layer.isEmpty(v)).toBe(false));

  it.each(["flipH", "flipV", "rot180"] as const)("%s twice is the identity", (id) => {
    const t = TRANSFORMS[id];
    expect(layer.equals(layer.transform(layer.transform(v, t, size, identity), t, size, identity), v)).toBe(true);
  });

  it("four quarter turns are the identity", () => {
    let x = v, s = size;
    for (let i = 0; i < 4; i++) {
      x = layer.transform(x, TRANSFORMS.rot90cw, s, identity);
      s = TRANSFORMS.rot90cw.newSize(s);
    }
    expect(layer.equals(x, v)).toBe(true);
  });

  it("resize out and back is the identity", () => {
    const big = { w: size.w + 4, h: size.h + 2 };
    const back = layer.resize(layer.resize(v, size, big, { x: 2, y: 1 }), big, size, { x: -2, y: -1 });
    expect(layer.equals(back, v)).toBe(true);
  });

  it("extract + clear + insert restores the layer", () => {
    const copy = layer.clone(v);
    const mask = new Uint8Array(size.w * size.h).fill(1);
    const piece = layer.extract(copy, mask, size, all(p));
    layer.clearMask(copy, mask, size);
    expect(layer.isEmpty(copy)).toBe(true);
    layer.insert(copy, piece, size, { x: 0, y: 0 }, size, { pattern: p, override: true });
    expect(layer.equals(copy, v)).toBe(true);
  });

  it("serialize + parse is the identity", () => {
    expect(layer.equals(layer.parse(JSON.parse(JSON.stringify(layer.serialize(v, (k) => k))), size), v)).toBe(true);
  });

  it("remapping keys to 0 removes all keyed content", () => {
    const copy = layer.clone(v);
    layer.remapKeys(copy, () => 0);
    expect(layer.isEmpty(copy)).toBe(layer.id !== "ambiguous");
  });
});
