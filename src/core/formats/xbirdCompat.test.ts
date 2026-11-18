import { describe, expect, it } from "vitest";
import { fixtureJson } from "../../../tests/support/fixtures";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { NewerFileError, parsePattern, upgradeFile } from "./json/parse";
import { serializePattern, XBIRD_VERSION, type PatternFile } from "./json/serialize";

// tests/fixtures/xbird-v1.xbird is a real file saved by version 1 of the app. Never regenerate or edit it: every
// later app must keep opening it (docs/RELEASING.md, "Compatibility rules").
const v1 = () => fixtureJson<PatternFile>("xbird-v1.xbird");

describe(".xbird files stay readable", () => {
  it("opens a version-1 file with its key, stitches, photo window and turned underlay", () => {
    const { pattern, refs, underlay } = parsePattern(v1(), ALL_SYMBOLS);
    expect({ w: pattern.w, h: pattern.h, entries: pattern.key.filter(Boolean).length }).toEqual({ w: 60, h: 60, entries: 8 });
    expect(pattern.layers.stitches.some(Boolean)).toBe(true);
    expect(refs).toHaveLength(1);
    expect(underlay).toMatchObject({ rotation: 1.4, imageW: 40, imageH: 20 });
    expect(underlay!.image).toMatch(/^data:image\//);
  });

  it("treats a file without a version as version 1 and refuses files from a newer app", () => {
    const { xbird: _, ...old } = v1();
    void _;
    expect(upgradeFile(old as PatternFile).xbird).toBe(XBIRD_VERSION);
    expect(() => parsePattern({ ...v1(), xbird: XBIRD_VERSION + 1 }, ALL_SYMBOLS)).toThrow(NewerFileError);
  });
});

// tests/fixtures/xbird-v1.3.0.xbird was written by the released 1.3.0 app (its own serializer, run from the v1.3.0
// tag), with every kind of content. 2.0 must open it and keep every part of it. Never regenerate or edit it.
describe("a chart bigger than the app makes is refused", () => {
  const big = (w: number, h: number) => ({ ...v1(), w, h });
  it("whatever else the file says, over 500 either way is refused with its own message", () => {
    expect(() => parsePattern(big(501, 60), ALL_SYMBOLS)).toThrow(/larger than 500/);
    expect(() => parsePattern(big(60, 501), ALL_SYMBOLS)).toThrow(/larger than 500/);
    expect(() => parsePattern(big(1e9, 1e9), ALL_SYMBOLS)).toThrow(/larger than 500/);
  });

  it("500 × 500 still opens, and a too-big version inside a file is skipped, not opened later", () => {
    expect(parsePattern({ ...big(500, 500), s: "0*250000" }, ALL_SYMBOLS).pattern.w).toBe(500);
    const withVersions = { ...v1(), versions: [{ time: 1, reason: "timer", doc: big(9000, 9000) }, { time: 2, reason: "timer", doc: v1() }] };
    expect(parsePattern(withVersions, ALL_SYMBOLS).versions.map((v) => v.time)).toEqual([2]);
  });
});

describe("a file saved by 1.3.0 opens in this version", () => {
  const file = () => fixtureJson<PatternFile>("xbird-v1.3.0.xbird");

  it("with its key, every kind of stitch, info, numbering, time spent, photo window and versions", () => {
    const { pattern: p, refs, versions } = parsePattern(file(), ALL_SYMBOLS);
    expect({ name: p.name, w: p.w, h: p.h, count: p.count }).toEqual({ name: "Bird 1.3.0", w: 12, h: 8, count: 14 });
    expect(p.key.filter(Boolean).map((e) => `${e!.t}:${e!.src}`)).toEqual(["thread:dmc:310", "thread:custom:a", "thread:blend:a", "combo:combo:a", "bead:bead:02011", "back:dmc:321", "knot:dmc:321"]);
    expect(p.meta).toMatchObject({ designer: "A. Designer", copyright: "2026", instructions: "Start in the centre" });
    expect(p.grid).toMatchObject({ x0: 1, y0: 1, label: 10 });
    expect(p.spent).toBe(4_321_000);
    expect(p.customs["custom:a"]).toMatchObject({ brand: "Anchor", code: "403" });
    expect(p.blends["blend:a"]!.parts).toHaveLength(2);
    expect(p.combos["combo:a"]).toEqual({ thread: "dmc:321", bead: "bead:00557" });
    expect([...p.layers.stitches.slice(0, 6)].filter(Boolean)).toHaveLength(6);
    expect(p.layers.beads[20]).toBeGreaterThan(0);
    expect(p.layers.partials.get(30)!.map((s) => `${s.kind}@${s.corner}`)).toEqual(["threeQuarter@0", "threeQuarter@2"]);
    expect(p.layers.partials.get(31)!.map((s) => `${s.kind}@${s.corner}`)).toEqual(["quarter@1", "petite@3"]);
    expect(p.layers.segments).toHaveLength(1);
    expect(p.layers.knots).toEqual([{ x: 1.5, y: 1, k: expect.any(Number) }]);
    expect([...p.layers.ambiguous]).toEqual([7]);
    expect(refs).toHaveLength(1);
    expect(versions.map((v) => v.reason)).toEqual(["timer"]);
  });

  it("and saves again as the same pattern: nothing is lost on the way through", () => {
    const f = file();
    const again = JSON.parse(JSON.stringify(serializePattern(parsePattern(f, ALL_SYMBOLS).pattern)));
    const { refs: _r, versions: _v, ...core } = f;
    void _r;
    void _v;
    expect(again).toEqual(core);
  });
});
