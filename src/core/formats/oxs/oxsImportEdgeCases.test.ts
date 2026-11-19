import { describe, expect, it } from "vitest";
import { ORGANIZER } from "../../pattern/brands";
import { resolveColor } from "../../pattern/resolve";
import { ALL_SYMBOLS } from "../../symbols/symbols";
import { importOxs, OxsFormatError } from "./importOxs";
import { parseXml } from "./xml";

/*
 * OXS files come from other programs and from the web: odd, partial or hostile. Whatever is in them, opening one
 * gives a pattern or a clear refusal, never a half-made chart.
 */
describe("the XML reader", () => {
  it("reads elements, attributes (either quote), nesting and self-closing tags", () => {
    const els = parseXml(`<a x="1" y='two'><b/><c z="3"><d/></c></a>`);
    expect(els.map((e) => e.name)).toEqual(["a", "b", "c", "d"]);
    expect(els[0]!.attrs).toEqual({ x: "1", y: "two" });
    expect(els[3]!.path).toEqual(["a", "c"]);
    expect(els[0]!.children.map((c) => c.name)).toEqual(["b", "c"]);
  });

  it("decodes named, decimal and hex entities in attributes, and leaves unknown ones as they are", () => {
    const [el] = parseXml(`<a v="A &amp; B &lt;x&gt; &quot;q&quot; &apos;s&apos; &#65;&#x42; &unknown;"/>`);
    expect(el!.attrs.v).toBe(`A & B <x> "q" 's' AB &unknown;`);
  });

  it("skips the declaration, comments, CDATA and text", () => {
    const els = parseXml(`<?xml version="1.0"?><!-- <fake a="1"/> --><a>text<![CDATA[<b/>]]><!DOCTYPE x></a>`);
    expect(els.map((e) => e.name)).toEqual(["a"]);
  });

  it("copes with garbage: nothing in it is nothing, a stray closing tag is ignored, an unclosed one still reads", () => {
    expect(parseXml("")).toEqual([]);
    expect(parseXml("no tags at all")).toEqual([]);
    expect(parseXml(`</x><a><b></a>`).map((e) => e.name)).toEqual(["a", "b"]);
    expect(parseXml(`<a><b x="1"`).map((e) => e.name)).toEqual(["a"]);
  });
});

const oxs = (o: { props?: string; palette?: string; full?: string; part?: string; objects?: string; back?: string } = {}) => `<?xml version="1.0"?>
<chart>
<properties oxsversion="1.0" software="Other" chartwidth="10" chartheight="8" charttitle="T &amp; U" ${o.props ?? ""}/>
<palette>
<palette_item index="0" number="cloth" name="cloth" color="FFFFE0"/>
${o.palette ?? '<palette_item index="1" number="310" name="Black" color="000000" strands="2" bsstrands="1"/>'}
</palette>
<fullstitches>${o.full ?? ""}</fullstitches>
<partstitches>${o.part ?? ""}</partstitches>
<ornaments_inc_knots_and_beads>${o.objects ?? ""}</ornaments_inc_knots_and_beads>
<backstitches>${o.back ?? ""}</backstitches>
</chart>`;
const read = (x: string) => importOxs(x, ALL_SYMBOLS);

describe("colours no brand here has (SPEC §15.52)", () => {
  const unknown = oxs({
    palette: '<palette_item index="1" number="K-7" name="Pearl" color="EEEEEE"/><palette_item index="2" number="310" name="Black" color="000000"/><palette_item index="3" number="k-7" name="Pearl again" color="EEEEEE"/>',
    full: '<stitch x="0" y="0" palindex="1"/><stitch x="1" y="0" palindex="2"/><stitch x="2" y="0" palindex="3"/>',
  });

  it("by default they become threads of one's own; the option puts them in the project palette, one colour per number", () => {
    const own = importOxs(unknown, ALL_SYMBOLS);
    expect(Object.values(own.pattern.customs).map((c) => c.brand)).toEqual(["Thread", "Thread"]);
    expect(own.report.unmatched).toBe(2);
    const { pattern: p, report } = importOxs(unknown, ALL_SYMBOLS, { unmatched: "project" });
    expect(Object.values(p.customs).map((c) => [c.brand, c.code, c.name, c.hex])).toEqual([[ORGANIZER, "K-7", "", "#EEEEEE"]]);
    expect(report.unmatched).toBe(1);
    // 310 is DMC's, so it stays DMC; both K-7 cells share the one palette colour
    expect(p.key.filter(Boolean).map((e) => e!.src)).toEqual([Object.keys(p.customs)[0], "dmc:310"]);
  });
});

describe("opening an OXS file", () => {
  it("refuses a file that isn't a chart, or has no usable size", () => {
    expect(() => read("<html></html>")).toThrow(OxsFormatError);
    expect(() => read("not xml")).toThrow(OxsFormatError);
    expect(() => read(`<chart><properties chartwidth="0" chartheight="5"/></chart>`)).toThrow(OxsFormatError);
    expect(() => read(`<chart><properties chartwidth="abc" chartheight="5"/></chart>`)).toThrow(OxsFormatError);
    expect(() => read(`<chart><properties chartwidth="5"/></chart>`)).toThrow(OxsFormatError);
  });

  it("refuses a chart bigger than the app makes (1000 × 1000) before allocating anything, and takes exactly that", () => {
    const sized = (w: number, h: number) => `<chart><properties chartwidth="${w}" chartheight="${h}"/></chart>`;
    expect(() => read(sized(1001, 10))).toThrow(OxsFormatError);
    expect(() => read(sized(10, 1001))).toThrow(OxsFormatError);
    expect(() => read(sized(60000, 60000))).toThrow(OxsFormatError);
    expect(() => read(sized(1e9, 1e9))).toThrow(OxsFormatError);
    expect(read(sized(1000, 1000)).pattern.layers.stitches).toHaveLength(1_000_000);
  });

  it("takes the title, size, fabric colour, designer info and the fabric count when it is one we know", () => {
    const { pattern: p } = read(oxs({ props: 'stitchesperinch="18" author="A" copyright="2026" instructions="Go"' }));
    expect({ name: p.name, w: p.w, h: p.h, count: p.count, fabric: p.fabric }).toEqual({ name: "T & U", w: 10, h: 8, count: 18, fabric: "#FFFFE0" });
    expect(p.meta).toEqual({ designer: "A", copyright: "2026", instructions: "Go" });
    expect(read(oxs({ props: 'stitchesperinch="13"' })).pattern.count).toBe(14);
    expect(read(oxs()).pattern.count).toBe(14);
  });

  it("a thread is found by its number — plain, zero-padded, in another case, or named for its brand", () => {
    const code = (palette: string) => {
      const { pattern: p } = read(oxs({ palette, full: '<stitch x="0" y="0" palindex="1"/>' }));
      return resolveColor(p, p.key[p.layers.stitches[0]!]!.src)!.id;
    };
    expect(code('<palette_item index="1" number="310" name="x" color="000000"/>')).toBe("dmc:310");
    expect(code('<palette_item index="1" number="DMC 310" name="x" color="000000"/>')).toBe("dmc:310");
    expect(code('<palette_item index="1" number="blanc" name="x" color="FFFFFF"/>')).toBe("dmc:White");
    expect(code('<palette_item index="1" number="ANC-403" name="x" color="000000"/>')).toBe("anchor:403");
    expect(code('<palette_item index="1" number="Anchor 0403" name="x" color="000000"/>')).toBe("anchor:403");
  });

  it("a colour nobody has becomes the file's own thread, with its colour; a missing or bad colour is grey", () => {
    const own = (color: string) => {
      const { pattern: p } = read(oxs({ palette: `<palette_item index="1" number="ZZ-9" name="Mine" ${color}/>`, full: '<stitch x="0" y="0" palindex="1"/>' }));
      return Object.values(p.customs);
    };
    expect(own('color="12AB34"')).toMatchObject([{ kind: "thread", code: "ZZ-9", name: "Mine", hex: "#12AB34" }]);
    expect(own('color="nope"')[0]!.hex).toBe("#999999");
    expect(own("")[0]!.hex).toBe("#999999");
  });

  it("full stitches go in their cells; ones outside the chart, or of a colour the palette lacks, are dropped", () => {
    const { pattern: p } = read(oxs({ full: '<stitch x="0" y="0" palindex="1"/><stitch x="9" y="7" palindex="1"/><stitch x="10" y="0" palindex="1"/><stitch x="-1" y="0" palindex="1"/><stitch x="2" y="2" palindex="7"/>' }));
    expect(p.layers.stitches[0]).toBeGreaterThan(0);
    expect(p.layers.stitches[7 * 10 + 9]).toBeGreaterThan(0);
    expect([...p.layers.stitches].filter(Boolean)).toHaveLength(2);
  });

  it("part stitches: halves in either direction, three-quarters by their corners, anything else counted as simplified", () => {
    const { pattern: p, report } = read(oxs({
      palette: '<palette_item index="1" number="310" name="a" color="000000"/><palette_item index="2" number="321" name="b" color="FF0000"/>',
      part: '<partstitch x="0" y="0" direction="3" palindex1="1" palindex2="0"/><partstitch x="1" y="0" direction="4" palindex1="0" palindex2="2"/><partstitch x="2" y="0" direction="2" palindex1="1" palindex2="2"/><partstitch x="3" y="0" direction="1" palindex1="1" palindex2="0"/><partstitch x="4" y="0" direction="9" palindex1="1" palindex2="0"/><partstitch x="40" y="0" direction="3" palindex1="1"/>',
    }));
    const st = (i: number) => p.key[p.layers.stitches[i]!]?.st;
    expect([st(0), st(1)]).toEqual(["half", "halfb"]);
    expect(p.layers.partials.get(2)!.map((s) => [s.kind, s.corner])).toEqual([["threeQuarter", 0], ["threeQuarter", 2]]);
    expect(p.layers.partials.get(3)!.map((s) => [s.kind, s.corner])).toEqual([["threeQuarter", 1]]);
    expect(st(4)).toBe("full");
    expect(report.simplified).toBe(1);
  });

  it("beads, tent stitches, knots (snapped to the half grid) and quarters; unknown ornaments are counted, not lost silently", () => {
    const { pattern: p, report } = read(oxs({
      palette: '<palette_item index="1" number="310" name="a" color="000000"/><palette_item index="2" number="00557" name="bead" color="FF00FF"/>',
      objects: '<object x1="1" y1="1" palindex="2" objecttype="bead"/><object x1="2" y1="1" palindex="1" objecttype="tent" direction="1"/><object x1="3.3" y1="2.8" palindex="1" objecttype="knot"/><object x1="4" y1="4" palindex="1" objecttype="quarter" petit="false"/><object x1="50" y1="1" palindex="1" objecttype="bead"/><object x1="5" y1="5" palindex="1" objecttype="sparkle"/><object x1="abc" y1="1" palindex="1" objecttype="knot"/>',
    }));
    expect(p.key[p.layers.beads[11]!]).toMatchObject({ t: "bead", src: "bead:00557" });
    expect(p.key[p.layers.stitches[12]!]?.st).toBe("halfb");
    expect(p.layers.knots).toEqual([{ x: 3.5, y: 3, k: expect.any(Number) }]);
    expect(p.layers.partials.get(44)).toHaveLength(1);
    expect([...p.layers.beads].filter(Boolean)).toHaveLength(1);
    expect(report.simplified).toBe(1);
  });

  it("backstitches keep their ends; other line objects and ones with broken numbers are counted as simplified", () => {
    const { pattern: p, report } = read(oxs({ back: '<backstitch x1="0" y1="0" x2="3" y2="0.5" palindex="1" objecttype="backstitch"/><backstitch x1="0" y1="0" x2="1" y2="1" palindex="1" objecttype="straightstitch"/><backstitch x1="a" y1="0" x2="1" y2="1" palindex="1"/><backstitch x1="0" y1="0" x2="1" y2="1" palindex="9"/>' }));
    expect(p.layers.segments).toHaveLength(1);
    expect(p.layers.segments[0]).toMatchObject({ x1: 0, y1: 0, x2: 3, y2: 0.5 });
    expect(report.simplified).toBe(2);
  });

  it("a blend of two threads becomes one blend entry; a thread with a bead becomes floss + bead", () => {
    const { pattern: p } = read(oxs({
      palette: '<palette_item index="1" number="310+321" name="blend" color="000000" comments="blend"><blend number="310" name="Black" color="000000" strands="1"/><blend number="321" name="Red" color="C00000" strands="1"/></palette_item><palette_item index="2" number="00557+310" name="x" color="000000"/>',
      full: '<stitch x="0" y="0" palindex="1"/><stitch x="1" y="0" palindex="2"/>',
    }));
    const a = p.key[p.layers.stitches[0]!]!, b = p.key[p.layers.stitches[1]!]!;
    expect(a.src.startsWith("blend:")).toBe(true);
    expect(p.blends[a.src]!.parts.map((q) => [q.id, q.n])).toEqual([["dmc:310", 1], ["dmc:321", 1]]);
    expect(b.t).toBe("combo");
    expect(p.combos[b.src]).toEqual({ thread: "dmc:310", bead: "bead:00557" });
  });

  it("strands are kept within 1–6 and default to 2", () => {
    const strands = (attr: string) => {
      const { pattern: p } = read(oxs({ palette: `<palette_item index="1" number="310" name="a" color="000000" ${attr}/>`, full: '<stitch x="0" y="0" palindex="1"/>' }));
      return p.key[p.layers.stitches[0]!]!.n;
    };
    expect([strands('strands="3"'), strands('strands="99"'), strands('strands="0"'), strands("")]).toEqual([3, 6, 2, 2]);
  });
});
