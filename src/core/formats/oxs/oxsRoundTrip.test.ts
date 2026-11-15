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
});
