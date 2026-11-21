import { describe, expect, it } from "vitest";
import { ORGANIZER, applyMaterials } from "../../pattern/brands";
import { createPattern } from "../../pattern/createPattern";
import { addEntry } from "../../pattern/keyEntries";
import { resolveColor } from "../../pattern/resolve";
import { ALL_SYMBOLS } from "../../symbols/symbols";
import { exportOxs } from "./exportOxs";
import { importOxs } from "./importOxs";

describe("OXS round trip", () => {
  it("numbered organizer: bare numbers in the file, organizer mode read back unchanged", () => {
    const p = createPattern(2, 1, "Org");
    p.customs["custom:o1"] = { id: "custom:o1", kind: "thread", brand: ORGANIZER, code: "1", name: "", hex: "#336699" };
    p.customs["custom:o2"] = { id: "custom:o2", kind: "thread", brand: ORGANIZER, code: "2", name: "", hex: "#993366" };
    applyMaterials(p, { brands: [ORGANIZER], beadBrands: ["Mill Hill"], onlyBrand: true, onlyBeadBrand: false, noBeads: true });
    const a = addEntry(p, { t: "thread", src: "custom:o1", n: 2, st: "full" }, ALL_SYMBOLS);
    const b = addEntry(p, { t: "thread", src: "custom:o2", n: 2, st: "full" }, ALL_SYMBOLS);
    p.layers.stitches.set([a, b]);
    const xml = exportOxs(p);
    expect(xml).toContain('number="1"');
    expect(xml).toContain('number="2"');
    expect(xml).not.toContain("Numbered organizer 1");
    const { pattern: q } = importOxs(xml, ALL_SYMBOLS);
    expect(q.brands).toEqual([ORGANIZER]);
    expect(Object.values(q.customs).map((c) => [c.brand, c.code]).sort()).toEqual([[ORGANIZER, "1"], [ORGANIZER, "2"]]);
  });

  it("numbered organizer: floss is bare, bead is \"Bead N\"", () => {
    const p = createPattern(2, 2, "Org");
    const own = (id: string, kind: "thread" | "bead", code: string) => (p.customs[id] = { id, kind, brand: ORGANIZER, code, name: "", hex: "#336699" });
    own("custom:f1", "thread", "1");
    own("custom:f2", "thread", "2");
    own("custom:b3", "bead", "3");
    p.blends["blend:ff"] = { parts: [{ id: "custom:f1", n: 1 }, { id: "custom:f2", n: 1 }] };
    p.combos["combo:fb"] = { thread: "custom:f1", bead: "custom:b3" };
    applyMaterials(p, { brands: [ORGANIZER], beadBrands: [ORGANIZER], onlyBrand: true, onlyBeadBrand: true, noBeads: false });
    const a = addEntry(p, { t: "thread", src: "blend:ff", n: null, st: "full" }, ALL_SYMBOLS);
    const b = addEntry(p, { t: "combo", src: "combo:fb", n: 2, st: "full" }, ALL_SYMBOLS);
    const point = addEntry(p, { t: "combo", src: "combo:fb", n: 1, st: "point" }, ALL_SYMBOLS);
    p.layers.stitches.set([a, b]);
    p.layers.knots.push({ x: 1, y: 1, k: point });
    const xml = exportOxs(p);
    expect(xml).toContain('number="1+Bead 3"');
    expect(xml).toContain('number="1+2"');
    expect(xml).toMatch(/<palette_item index="3" number="1\+Bead 3" name="1 \+ Bead 3"[^>]*comments="bead"/);
    expect(xml).toContain('<object x1="1" y1="1" palindex="3" objecttype="bead" stitchwork_x="1" stitchwork_y="1"/>');
    const { pattern: q } = importOxs(xml, ALL_SYMBOLS);
    expect(q.key).toEqual(p.key);
    expect(q.layers.knots).toEqual(p.layers.knots);
  });

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
    // floss + bead between cells: a bead palette item with both codes visible to other apps
    expect(xml).toMatch(/<palette_item index="1" number="00557\+321" name="00557 \+ 321"[^>]*comments="bead Glass Seed"/);
    expect(xml).toContain('<object x1="2" y1="2" palindex="1" objecttype="bead" stitchwork_x="2" stitchwork_y="2"/>');
    expect(xml).toContain('<object x1="0" y1="3" palindex="1" objecttype="bead" stitchwork_x="0" stitchwork_y="3"/>');
    expect(xml).not.toContain('palindex="1" objecttype="backstitch"');
    // a plain bead: a bead at its point; only the real knot is a knot
    expect(xml).toMatch(/<object x1="4" y1="4" palindex="\d+" objecttype="bead"[^>]*\/>/);
    expect(xml.match(/objecttype="knot"/g)).toHaveLength(1);
    const { pattern: q } = importOxs(xml, ALL_SYMBOLS);
    expect(q.key).toEqual(p.key);
    expect(q.layers.knots).toEqual(p.layers.knots);
  });
});


describe("OXS: this app's own file comes back as it was (SPEC §15.42)", () => {
  const kreinik = { id: "custom:kr", kind: "thread" as const, brand: "Kreinik", code: "032", name: "Pearl", hex: "#EEE8D5" };
  const ownBead = { id: "custom:bd", kind: "bead" as const, brand: "Toho", code: "11-21", name: "Silver lined", hex: "#C0C0C0" };

  /** Every brand and kind of thing at once: threads of three brands, beads of three, blends, floss + bead, … */
  function everything() {
    const p = createPattern(8, 6, "Every kind");
    p.count = 16;
    p.fabric = "#EFE6D2";
    p.meta = { ...p.meta, designer: "A. Designer", copyright: "2026", instructions: "Start in the middle" };
    p.customs[kreinik.id] = kreinik;
    p.customs[ownBead.id] = ownBead;
    p.blends["blend:k"] = { parts: [{ id: "dmc:310", n: 1 }, { id: kreinik.id, n: 1 }] };
    p.combos["combo:p"] = { thread: "anchor:403", bead: "preciosa:00050" };
    const k = (e: Parameters<typeof addEntry>[1]) => addEntry(p, e, ALL_SYMBOLS);
    const dmc = k({ t: "thread", src: "dmc:310", n: 2, st: "full", sym: "sym:star" });
    const anchor = k({ t: "thread", src: "anchor:403", n: 2, st: "half" });
    const own = k({ t: "thread", src: kreinik.id, n: 1, st: "full" });
    const blend = k({ t: "thread", src: "blend:k", n: null, st: "full" });
    const combo = k({ t: "combo", src: "combo:p", n: 2, st: "full" });
    const mh = k({ t: "bead", src: "bead:00557" });
    const prec = k({ t: "bead", src: "preciosa:00050" });
    const toho = k({ t: "bead", src: ownBead.id });
    const point = k({ t: "bead", src: "bead:02011", st: "point" });
    const tacked = k({ t: "combo", src: "combo:p", n: 1, st: "point" });
    const back = k({ t: "back", src: kreinik.id, n: 1 });
    const knot = k({ t: "knot", src: "dmc:310", n: 2 });
    p.layers.stitches.set([dmc, anchor, own, blend, combo]);
    p.layers.beads[8] = mh;
    p.layers.beads[9] = prec;
    p.layers.beads[10] = toho;
    p.layers.knots.push({ x: 3, y: 3, k: point }, { x: 5, y: 2, k: tacked }, { x: 6.5, y: 4, k: knot });
    p.layers.segments.push({ x1: 0, y1: 5, x2: 4, y2: 5, k: back });
    p.layers.partials.set(20, [{ kind: "threeQuarter", corner: 0, k: dmc }, { kind: "petite", corner: 3, k: own }]);
    p.brands = ["DMC", "Anchor", "Kreinik"];
    p.beadBrands = ["Mill Hill", "Preciosa", "Toho"];
    return p;
  }

  it("the same pattern: size, fabric, info, brands, key with its symbols, own colours, every stitch, bead and knot — a new pattern", () => {
    const p = everything();
    const { pattern: q, report } = importOxs(exportOxs(p), ALL_SYMBOLS);
    expect(report.simplified).toBe(0);
    expect(q.id).not.toBe(p.id);
    expect({ w: q.w, h: q.h, name: q.name, count: q.count, fabric: q.fabric, meta: q.meta, brands: q.brands, beadBrands: q.beadBrands }).toEqual({ w: p.w, h: p.h, name: p.name, count: p.count, fabric: p.fabric, meta: p.meta, brands: p.brands, beadBrands: p.beadBrands });
    expect(q.key).toEqual(p.key);
    expect([q.customs, q.blends, q.combos]).toEqual([p.customs, p.blends, p.combos]);
    expect([...q.layers.stitches]).toEqual([...p.layers.stitches]);
    expect([...q.layers.beads]).toEqual([...p.layers.beads]);
    expect([...q.layers.partials]).toEqual([...p.layers.partials]);
    expect(q.layers.segments).toEqual(p.layers.segments);
    expect([...q.layers.knots].sort((a, b) => a.x - b.x)).toEqual([...p.layers.knots].sort((a, b) => a.x - b.x));
  });

  it("names colours by brand when the pattern has several, or one other apps don't assume; by code alone otherwise", () => {
    const xml = exportOxs(everything());
    expect(xml).toContain('number="DMC 310"');
    expect(xml).toContain('number="ANC 403"');
    expect(xml).toContain('number="Kreinik 032"');
    expect(xml).toContain('number="DMC 310+Kreinik 032"');
    expect(xml).toContain('number="MH 00557"');
    expect(xml).toContain('number="PREC 00050"');
    expect(xml).toContain('number="Toho 11-21"');
    expect(xml).toMatch(/<palette_item[^>]*number="PREC 00050\+ANC 403" name="PREC 00050 \+ ANC 403"[^>]*comments="bead/);
    // one brand: DMC threads go by code alone; Anchor alone still says so
    const dmcOnly = createPattern(2, 1, "DMC");
    dmcOnly.layers.stitches[0] = addEntry(dmcOnly, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
    expect(exportOxs(dmcOnly)).toContain('number="310"');
    const anchorOnly = createPattern(2, 1, "Anchor");
    anchorOnly.layers.stitches[0] = addEntry(anchorOnly, { t: "thread", src: "anchor:403", n: 2, st: "full" }, ALL_SYMBOLS);
    expect(exportOxs(anchorOnly)).toContain('number="ANC 403"');
  });

  it("another app's file (no details of this app's): brands read off the numbers; an unknown brand becomes one's own", () => {
    const theirs = exportOxs(everything()).replace(/ stitchwork(_\w+)?="[^"]*"/g, "");
    const { pattern: q } = importOxs(theirs, ALL_SYMBOLS);
    const srcs = q.key.filter(Boolean).map((e) => e!.src);
    expect(srcs).toEqual(expect.arrayContaining(["dmc:310", "anchor:403", "bead:00557", "preciosa:00050"]));
    // "Kreinik 032" is never DMC 32: it's one's own Kreinik thread
    expect(srcs).not.toContain("dmc:32");
    expect(Object.values(q.customs).map((c) => `${c.kind}:${c.brand} ${c.code}`)).toEqual(expect.arrayContaining(["thread:Kreinik 032", "bead:Toho 11-21"]));
  });
});
