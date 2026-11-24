import { describe, expect, it } from "vitest";
import { computeUsage, chartTotals, entryCount } from "../calculator/usage";
import { serializePattern } from "../formats/json/serialize";
import { parsePattern } from "../formats/json/parse";
import { exportOxs } from "../formats/oxs/exportOxs";
import { segmentsLayer } from "../layers/points";
import { chartLines } from "../layers/registry";
import { stampsLayer } from "../layers/stamps";
import { createPattern } from "../pattern/createPattern";
import { entryLayer, addEntry } from "../pattern/keyEntries";
import type { Segment, Stamp, StampDef } from "../pattern/types";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { TRANSFORMS } from "../transform/cellTransform";
import { entryPlacement } from "../entryKinds/registry";
import { BUILT_IN_STAMPS, cleanStampDef, placeStampAt, stampDef, stampLines, stampOrigin, turnedSize } from "./stamps";

/** Lines as a comparable set: each line's ends in order, then sorted. */
const lineSet = (list: Segment[]) =>
  list.map((l) => (l.x1 < l.x2 || (l.x1 === l.x2 && l.y1 <= l.y2) ? [l.x1, l.y1, l.x2, l.y2, l.k] : [l.x2, l.y2, l.x1, l.y1, l.k]).join()).sort();

/** An L-shaped stamp of one's own: not symmetric, so every turn and flip shows. */
const ell: StampDef = { id: "own:ell", name: "L", w: 2, h: 3, lines: [{ x1: 0, y1: 0, x2: 0, y2: 3 }, { x1: 0, y1: 3, x2: 2, y2: 3 }, { x1: 0, y1: 0, x2: 1, y2: 0.5 }] };

function setup() {
  const p = createPattern(9, 7);
  p.stamps = { [ell.id]: ell };
  const smyrna = addEntry(p, { t: "back", src: "dmc:310", n: 2, stamp: "smyrna2" }, ALL_SYMBOLS);
  const own = addEntry(p, { t: "back", src: "dmc:321", n: 1, stamp: ell.id }, ALL_SYMBOLS);
  return { p, smyrna, own };
}

describe("stamps: blocks of straight stitches placed as one", () => {
  it("built in: Smyrna crosses over one cell and over four, each a diagonal cross with an upright one", () => {
    expect(BUILT_IN_STAMPS.map((d) => [d.id, d.w, d.h, d.lines.length])).toEqual([["smyrna1", 1, 1, 4], ["smyrna2", 2, 2, 4]]);
    const lines = stampLines(placeStampAt(stampDef({}, "smyrna1")!, 3, 2, 5), stampDef({}, "smyrna1")!);
    expect(lineSet(lines)).toEqual(lineSet([
      { x1: 3, y1: 3, x2: 4, y2: 2, k: 5 }, { x1: 3, y1: 2, x2: 4, y2: 3, k: 5 }, { x1: 3.5, y1: 2, x2: 3.5, y2: 3, k: 5 }, { x1: 3, y1: 2.5, x2: 4, y2: 2.5, k: 5 },
    ]));
  });

  it("a backstitch entry with a stamp is placed as a block, on the stamps layer", () => {
    const { p, smyrna } = setup();
    expect(entryPlacement(p.key[smyrna]!)).toBe("block");
    expect(entryLayer(p.key[smyrna]!)).toBe("stamps");
    expect(entryPlacement({ t: "back" })).toBe("segment");
  });

  it("the block's middle goes under the pointer; a quarter turn swaps its sides", () => {
    expect(stampOrigin({ w: 2, h: 2 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
    expect(stampOrigin({ w: 3, h: 3 }, { x: 5, y: 5 })).toEqual({ x: 4, y: 4 });
    expect(turnedSize(ell, [0, -1, 1, 0])).toEqual({ w: 3, h: 2 });
  });

  it.each(["flipH", "flipV", "rot90cw", "rot180", "rot90ccw"] as const)("%s of the chart moves a stamp's lines exactly as it moves plain lines", (id) => {
    const { p, own, smyrna } = setup();
    const v: Stamp[] = [placeStampAt(ell, 1, 2, own), placeStampAt(stampDef(p, "smyrna2")!, 5, 1, smyrna)];
    const size = { w: p.w, h: p.h }, t = TRANSFORMS[id];
    const turned = stampsLayer.transform(v, t, size, { repoint: (k) => k });
    expect(lineSet(stampsLayer.lines!(turned, p))).toEqual(lineSet(segmentsLayer.transform(stampsLayer.lines!(v, p), t, size, { repoint: (k) => k })));
  });

  it("counted one per stamp; their thread is their lines' length; in the totals as stamps", () => {
    const { p, smyrna } = setup();
    p.layers.stamps.push(placeStampAt(stampDef(p, "smyrna2")!, 0, 0, smyrna), placeStampAt(stampDef(p, "smyrna2")!, 3, 3, smyrna));
    const usage = computeUsage(p), u = usage.perEntry.get(smyrna)!;
    expect(entryCount(u)).toBe(2);
    expect(u.segmentLength).toBeCloseTo(2 * (2 * Math.SQRT2 * 2 + 2 + 2));
    expect(chartTotals(p, usage).stamps).toBe(2);
  });

  it("drawn and exported as lines: in the chart's lines and the .oxs backstitch", () => {
    const { p, smyrna } = setup();
    p.layers.stamps.push(placeStampAt(stampDef(p, "smyrna2")!, 0, 0, smyrna));
    expect(chartLines(p)).toHaveLength(4);
    expect(exportOxs(p).match(/<backstitch /g)).toHaveLength(4);
  });

  it("travel in the pattern file with one's own stamps, and come back the same", () => {
    const { p, own, smyrna } = setup();
    p.layers.stamps.push(placeStampAt(ell, 1, 1, own), { ...placeStampAt(stampDef(p, "smyrna1")!, 6, 6, smyrna), m: [0, -1, 1, 0] });
    const back = parsePattern(JSON.parse(JSON.stringify(serializePattern(p))), ALL_SYMBOLS).pattern;
    expect(back.stamps).toEqual(p.stamps);
    expect(back.key[own]!.stamp).toBe(ell.id);
    expect(stampsLayer.equals(back.layers.stamps, p.layers.stamps)).toBe(true);
  });

  it("an older file (no stamps at all) opens as before", () => {
    const p = createPattern(5, 5);
    const file = serializePattern(p);
    expect(file.stamps).toBeUndefined();
    expect(file.stampDefs).toBeUndefined();
    expect(parsePattern(file, ALL_SYMBOLS).pattern.layers.stamps).toEqual([]);
  });

  it("one's own stamp from a file is made safe: half-grid lines inside its block, no repeats, nothing empty", () => {
    expect(cleanStampDef({ id: "own:x", name: " Star ", w: 2, h: 2, lines: [{ x1: 0, y1: 0, x2: 2, y2: 2 }, { x1: 2, y1: 2, x2: 0, y2: 0 }, { x1: 0, y1: 0, x2: 3, y2: 0 }, { x1: 0.3, y1: 0, x2: 1, y2: 1 }, { x1: 1, y1: 1, x2: 1, y2: 1 }] }))
      .toEqual({ id: "own:x", name: "Star", w: 2, h: 2, lines: [{ x1: 0, y1: 0, x2: 2, y2: 2 }] });
    expect(cleanStampDef({ id: "smyrna1", name: "", w: 1, h: 1, lines: [{ x1: 0, y1: 0, x2: 1, y2: 1 }] })).toBeNull();
    expect(cleanStampDef({ id: "own:big", name: "", w: 99, h: 1, lines: [{ x1: 0, y1: 0, x2: 1, y2: 1 }] })).toBeNull();
    expect(cleanStampDef({ id: "own:none", name: "", w: 1, h: 1, lines: [] })).toBeNull();
  });

  it("a stamp whose shape is unknown draws nothing and breaks nothing", () => {
    const { p, smyrna } = setup();
    p.layers.stamps.push({ x: 0, y: 0, w: 1, h: 1, def: "own:gone", k: smyrna });
    expect(chartLines(p)).toEqual([]);
    expect(entryCount(computeUsage(p).perEntry.get(smyrna))).toBe(1);
  });
});
