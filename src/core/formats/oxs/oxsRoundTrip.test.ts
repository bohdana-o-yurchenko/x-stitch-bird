import { describe, expect, it } from "vitest";
import { createPattern } from "../../pattern/createPattern";
import { addEntry } from "../../pattern/keyEntries";
import { resolveColor } from "../../pattern/resolve";
import { ALL_SYMBOLS } from "../../symbols/symbols";
import { exportOxs } from "./exportOxs";
import { importOxs } from "./importOxs";

describe("OXS round trip", () => {
  it("keeps beads, floss + bead, blends, half crosses and backstitch", () => {
    const p = createPattern(6, 2, "Mix");
    p.blends["blend:a"] = { parts: [{ id: "dmc:310", n: 1 }, { id: "dmc:321", n: 1 }] };
    p.combos["combo:a"] = { thread: "dmc:321", bead: "bead:00557" };
    const full = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
    const half = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "half" }, ALL_SYMBOLS);
    const blend = addEntry(p, { t: "thread", src: "blend:a", n: null, st: "full" }, ALL_SYMBOLS);
    const combo = addEntry(p, { t: "combo", src: "combo:a", n: 2, st: "full" }, ALL_SYMBOLS);
    const bead = addEntry(p, { t: "bead", src: "bead:02011" }, ALL_SYMBOLS);
    const back = addEntry(p, { t: "back", src: "dmc:321", n: 1 }, ALL_SYMBOLS);
    addEntry(p, { t: "thread", src: "dmc:699", n: 2, st: "full" }, ALL_SYMBOLS); // unused: not exported
    p.layers.stitches.set([full, half, blend, combo]);
    p.layers.beads[5] = bead;
    p.layers.segments.push({ x1: 0, y1: 2, x2: 3, y2: 2, k: back });

    const xml = exportOxs(p);
    expect(xml).not.toContain("699");
    const { pattern: q, report } = importOxs(xml, ALL_SYMBOLS);
    expect(report.simplified).toBe(0);
    expect([q.w, q.h]).toEqual([6, 2]);
    const kind = (k: number) => {
      const e = q.key[k]!, c = resolveColor(q, e.src)!;
      return `${e.t}:${e.st ?? "-"}:${c.code}`;
    };
    expect([...q.layers.stitches.slice(0, 4)].map(kind)).toEqual(["thread:full:310", "thread:half:310", "thread:full:310+321", "combo:full:321+00557"]);
    expect(kind(q.layers.beads[5]!)).toBe("bead:-:02011");
    expect(q.layers.segments.map((s) => [s.x1, s.y1, s.x2, s.y2, kind(s.k)])).toEqual([[0, 2, 3, 2, "back:-:321"]]);
  });

  it("writes beads between cells as what they are, not as French knots", () => {
    const p = createPattern(6, 6, "Points");
    p.combos["combo:a"] = { thread: "dmc:321", bead: "bead:00557" };
    const tacked = addEntry(p, { t: "combo", src: "combo:a", n: 1, st: "point" }, ALL_SYMBOLS);
    const plain = addEntry(p, { t: "bead", src: "bead:02011", st: "point" }, ALL_SYMBOLS);
    const knot = addEntry(p, { t: "knot", src: "dmc:310", n: 2 }, ALL_SYMBOLS);
    p.layers.knots.push({ x: 2, y: 2, k: tacked }, { x: 0, y: 3, k: tacked }, { x: 4, y: 4, k: plain }, { x: 5, y: 1, k: knot });
    const xml = exportOxs(p);
    // floss + bead: its blend palette item, named so, and a short backstitch through the point (kept in the chart)
    expect(xml).toMatch(/<palette_item index="1" number="00557\+321" name="00557 \+ 321 \(bead between cells\)"[^>]*comments="blend"/);
    expect(xml).toContain('<backstitch x1="1.5" y1="2.5" x2="2.5" y2="1.5" palindex="1" objecttype="backstitch"');
    expect(xml).toContain('<backstitch x1="0" y1="3.5" x2="0.5" y2="2.5" palindex="1" objecttype="backstitch"');
    // a plain bead: a bead at its point; only the real knot is a knot
    expect(xml).toMatch(/<object x1="4" y1="4" palindex="\d+" objecttype="bead"\/>/);
    expect(xml.match(/objecttype="knot"/g)).toHaveLength(1);
  });
});

