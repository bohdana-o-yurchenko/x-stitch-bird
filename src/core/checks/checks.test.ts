import { describe, expect, it } from "vitest";
import { createPattern } from "../pattern/createPattern";
import { addEntry } from "../pattern/keyEntries";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { DEFAULT_CHECKS, findHoles, findLoneStitches, findNearSymmetry, runChecks } from "./checks";

/** A pattern from rows of letters: A, B, C… full crosses in different threads; `/` and `\\` half crosses of A; `.` empty. */
function drawn(rows: string[]) {
  const p = createPattern(rows[0]!.length, rows.length), keys = new Map<string, number>();
  const dmc: Record<string, string> = { A: "310", B: "321", C: "797", D: "699" };
  const key = (ch: string) => {
    if (!keys.has(ch)) {
      const st = ch === "/" ? "half" : ch === "\\" ? "halfb" : "full", thread = ch === "/" || ch === "\\" ? "310" : dmc[ch]!;
      keys.set(ch, addEntry(p, { t: "thread", src: `dmc:${thread}`, n: 2, st }, ALL_SYMBOLS));
    }
    return keys.get(ch)!;
  };
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && (p.layers.stitches[y * p.w + x] = key(ch))));
  const cell = (x: number, y: number) => y * p.w + x;
  return { p, cell };
}

describe("empty cells", () => {
  it("finds small holes inside the stitching, not the open fabric around it", () => {
    const { p, cell } = drawn([
      "........",
      ".AAAAAA.",
      ".A.AAAA.",
      ".AAA..A.",
      ".AAAAAA.",
      "........",
    ]);
    expect(findHoles(p, 3).map((f) => f.cells)).toEqual([[cell(2, 2)], [cell(4, 3), cell(5, 3)]]);
    expect(findHoles(p, 1).map((f) => f.cells)).toEqual([[cell(2, 2)]]);
  });

  it("joins empty cells that touch at a corner, so a bigger gap is not reported", () => {
    const { p } = drawn([
      "AAAAA",
      "A.AAA",
      "AA.AA",
      "AAA.A",
      "AAAAA",
    ]);
    expect(findHoles(p, 2)).toEqual([]);
    expect(findHoles(p, 3)).toHaveLength(1);
  });

  it("counts a bead or a partial stitch as stitched", () => {
    const { p, cell } = drawn(["AAA", "A.A", "AAA"]);
    p.layers.beads[cell(1, 1)] = 1;
    expect(findHoles(p, 3)).toEqual([]);
  });
});

describe("lone stitches", () => {
  it("finds a stitch of a colour with none of that colour around it, inside other stitches", () => {
    const { p, cell } = drawn([
      "AAAAA",
      "AABAA",
      "AAAAA",
      ".....",
      "....C",
    ]);
    // B is lone inside A; C stands alone on empty fabric (only reported when asked)
    expect(findLoneStitches(p, 1, false).map((f) => f.cells)).toEqual([[cell(2, 1)]]);
    expect(findLoneStitches(p, 1, true).map((f) => f.cells)).toEqual([[cell(2, 1)], [cell(4, 4)]]);
  });

  it("counts the same thread as the same colour, whatever the stitch, and takes groups up to the size asked", () => {
    const { p } = drawn([
      "AAAAA",
      "AB/AA",
      "ABAAA",
      "AAAAA",
    ]);
    // the half cross "/" is DMC 310 like A: not lone; B is a group of 2
    expect(findLoneStitches(p, 1, false)).toEqual([]);
    expect(findLoneStitches(p, 2, false)).toHaveLength(1);
  });
});

describe("near symmetry", () => {
  it("reports the pairs that break an almost symmetric design, on the best axis", () => {
    const { p, cell } = drawn([
      "AB....BA",
      "ACC..CCA",
      "AB....BA",
      "AC....CD", // one cell differs from its mirror image
      "AB....BA",
      "ACC..CCA",
      "AB....BA",
    ]);
    const found = findNearSymmetry(p);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ axis: "vertical", cells: [cell(0, 3), cell(7, 3)] });
  });

  it("matches a half cross with its mirror image and stays quiet for designs that are not symmetric", () => {
    const symmetric = drawn(["A/\\A", "B..B", "A/\\A", "B..B", "A/\\A", "B..B"]);
    expect(findNearSymmetry(symmetric.p).filter((f) => f.axis === "vertical")).toEqual([]);
    const random = drawn(["ABCD", "DCBA", "BADC", "CDAB", "ABCD", "BCDA"]);
    expect(findNearSymmetry(random.p)).toEqual([]);
  });

  it("checks backstitch lines against their mirror images too", () => {
    const rows = ["AB....BA", "ACC..CCA", "AB....BA", "AC....CA", "AB....BA", "ACC..CCA", "AB....BA"];
    const { p, cell } = drawn(rows);
    const back = addEntry(p, { t: "back", src: "dmc:310", n: 1 }, ALL_SYMBOLS);
    const other = addEntry(p, { t: "back", src: "dmc:321", n: 1 }, ALL_SYMBOLS);
    // a mirrored pair, a line on the axis (its own mirror image), and a line with no twin on the right
    p.layers.segments.push({ x1: 1, y1: 1, x2: 2, y2: 2, k: back }, { x1: 7, y1: 1, x2: 6, y2: 2, k: back });
    p.layers.segments.push({ x1: 3, y1: 4, x2: 5, y2: 4, k: back });
    p.layers.segments.push({ x1: 1, y1: 3, x2: 1, y2: 4, k: back });
    expect(findNearSymmetry(p).filter((f) => f.axis === "vertical")).toEqual([
      expect.objectContaining({ cells: [cell(1, 3), cell(6, 3)] }),
    ]);
    // a twin of another colour doesn't count as a mirror image
    p.layers.segments.push({ x1: 7, y1: 3, x2: 7, y2: 4, k: other });
    expect(findNearSymmetry(p).filter((f) => f.axis === "vertical").map((f) => f.cells)).toEqual([[cell(1, 3), cell(6, 3)]]);
    p.layers.segments[p.layers.segments.length - 1]!.k = back;
    expect(findNearSymmetry(p).filter((f) => f.axis === "vertical")).toEqual([]);
  });

  it("checks beads in cells, beads between cells and French knots against their mirror images too", () => {
    const rows = ["AB....BA", "ACC..CCA", "AB....BA", "AC....CA", "AB....BA", "ACC..CCA", "AB....BA"];
    const { p, cell } = drawn(rows);
    const gold = addEntry(p, { t: "bead", src: "bead:00557" }, ALL_SYMBOLS);
    const between = addEntry(p, { t: "bead", src: "bead:00557", st: "point" }, ALL_SYMBOLS);
    const knot = addEntry(p, { t: "knot", src: "dmc:310", n: 2 }, ALL_SYMBOLS);
    p.layers.beads[cell(3, 1)] = gold;
    p.layers.beads[cell(4, 1)] = gold;
    p.layers.knots.push({ x: 2, y: 3, k: between }, { x: 6, y: 3, k: between }, { x: 4, y: 6, k: knot });
    expect(findNearSymmetry(p).filter((f) => f.axis === "vertical")).toEqual([]);
    // a bead in a cell without its twin, and a knot without its twin
    p.layers.beads[cell(2, 4)] = gold;
    p.layers.knots.push({ x: 1.5, y: 5.5, k: knot });
    expect(findNearSymmetry(p).filter((f) => f.axis === "vertical").map((f) => f.cells)).toEqual([[cell(2, 4), cell(5, 4)], [cell(1, 5), cell(6, 5)]]);
  });

  it("runs only the checks that are switched on, in the panel's order", () => {
    const { p } = drawn(["AAAA", "A.AA", "AABA", "AAAA"]);
    expect(runChecks(p, DEFAULT_CHECKS)).toEqual([]);
    const all = runChecks(p, { holes: { on: true, max: 3 }, lone: { on: true, max: 1, alone: false }, symmetry: { on: true } });
    expect(all.map((f) => f.check).slice(0, 2)).toEqual(["holes", "lone"]);
    expect(new Set(all.map((f) => f.id)).size).toBe(all.length);
  });
});
