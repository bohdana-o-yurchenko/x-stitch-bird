import { describe, expect, it } from "vitest";
import type { ColorEntry } from "../../color/colorEntry";
import { resolveColor } from "../../pattern/resolve";
import type { KeyIndex, Pattern } from "../../pattern/types";
import { oxsSuite } from "../../readerCheck/oxsSuite";
import { ALL_SYMBOLS } from "../../symbols/symbols";
import { exportOxs } from "./exportOxs";
import { importOxs } from "./importOxs";

/*
 * Every kind of thing an .oxs can carry, on one chart (core/readerCheck/oxsSuite.ts — the /check page's too), for
 * checking by eye in other apps (Хрестики, Ruta Stitch, …) and in this one. Each sample is numbered on the chart — its
 * number backstitched in DMC 310, one strand, to its left — and described in a text file beside the .oxs:
 *   tests/fixtures/oxs-showcase/showcase.oxs, showcase.txt
 * Both are file snapshots: a change to the export shows up as a change to them (`vitest -u` writes them anew).
 */

const PER_ROW = 5;
/** A sample's own area: 5 × 2 cells to the right of its number (its box takes in the number too). */
const AREA = { w: 5, h: 2 };
const LABEL_W = 4;

/* ---------- what a pattern has in an area, in words ---------- */

const CORNER = ["TL", "TR", "BR", "BL"];
const PARTIAL = { threeQuarter: "¾", quarter: "¼", petite: "petite" };
const name = (c: ColorEntry | undefined) => (c ? `${c.brand} ${c.code}` : "?");
function colour(p: Pattern, src: string): string {
  const c = resolveColor(p, src);
  if (c?.thread && c.bead) return `${name(c.thread)} + bead ${name(c.bead)}`;
  if (c?.isBlend && c.parts) return "blend " + c.parts.map((q) => `${q.n}×${name(q.entry)}`).join(" + ");
  return name(c);
}
function entry(p: Pattern, v: KeyIndex): string {
  const e = p.key[v];
  if (!e) return "?";
  const strands = e.n ? `, ${e.n} strand${e.n > 1 ? "s" : ""}` : "";
  const extra = (e.wraps ? `, ${e.wraps} wraps` : "") + (e.ink ? `, drawn ${e.ink}` : "");
  return `${colour(p, e.src)}${strands}${extra}`;
}
const stitchName = { full: "whole cross", half: "half ╱", halfb: "half ╲", point: "?" };

/** Cells counted from 1, as the app's rulers do; grid points from 0 at the chart's top-left corner. */
function contents(p: Pattern, a: { x: number; y: number; w: number; h: number }): string[] {
  const out: string[] = [];
  for (let y = a.y; y < a.y + a.h; y++)
    for (let x = a.x; x < a.x + a.w; x++) {
      const i = y * p.w + x, at = `cell ${x + 1},${y + 1}`;
      const s = p.layers.stitches[i]!, b = p.layers.beads[i]!;
      if (s) out.push(`${at}: ${p.key[s]!.t === "combo" ? "floss + bead, " : ""}${stitchName[p.key[s]!.st ?? "full"]} ${entry(p, s)}`);
      for (const q of [...(p.layers.partials.get(i) ?? [])].sort((m, n) => m.corner - n.corner)) out.push(`${at}: ${PARTIAL[q.kind]} ${CORNER[q.corner]} ${entry(p, q.k)}`);
      if (b) out.push(`${at}: bead ${entry(p, b)}`);
    }
  const inside = (x: number, y: number) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h;
  for (const s of p.layers.segments) if (inside(s.x1, s.y1) && inside(s.x2, s.y2)) out.push(`backstitch (${s.x1},${s.y1})–(${s.x2},${s.y2}) ${entry(p, s.k)}`);
  for (const n of [...p.layers.knots].sort((m, o) => m.y - o.y || m.x - o.x))
    if (inside(n.x, n.y)) {
      const e = p.key[n.k]!;
      out.push(`${e.t === "knot" ? "French knot" : e.t === "combo" ? "floss + bead between cells" : "bead between cells"} at point (${n.x},${n.y}) ${entry(p, n.k)}`);
    }
  return out;
}

/** The palette as written: index, number, name, strands, its <blend> parts. */
function palette(xml: string): string[] {
  return [...xml.matchAll(/<palette_item index="(\d+)" number="([^"]*)" name="([^"]*)"[^>]*?strands="(\d+)"[^>]*?(\/>|>([\s\S]*?)<\/palette_item>)/g)].map((m) => {
    const blends = [...(m[6] ?? "").matchAll(/<blend number="([^"]*)"[^>]*strands="(\d+)"/g)].map((b) => `${b[2]}×${b[1]}`);
    return `${m[1]!.padStart(3)}  ${m[2]!.padEnd(26)} ${m[3]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")}  · strands ${m[4]}${blends.length ? "  · blend: " + blends.join(" + ") : ""}`;
  });
}

const OUT = "../../../../tests/fixtures/oxs-showcase";
const GROUPS: Record<string, string> = {
  crosses: "Whole crosses", halves: "Half crosses", combos: "Floss + bead in a cell", beads: "Beads in a cell", points: "Beads between cells",
  partials: "Fractional stitches", backstitch: "Backstitch", knots: "French knots", everyUse: "One colour, every use", edge: "On the chart's edge",
};

describe("OXS showcase: every kind of thing an .oxs carries, numbered on one chart", () => {
  const { pattern: p, items: samples, label } = oxsSuite();
  const areas = samples.map((s) => ({ x: s.area!.x + LABEL_W, y: s.area!.y, w: AREA.w, h: s.area!.h }));
  const xml = exportOxs(p);
  const own = importOxs(xml, ALL_SYMBOLS);
  // another app's view: the file without this app's own extras
  const theirs = importOxs(xml.replace(/ stitchwork(_\w+)?="[^"]*"/g, ""), ALL_SYMBOLS);

  it("every sample is on the chart", () => {
    areas.forEach((a, i) => expect(contents(p, a), `#${i + 1}`).not.toEqual([]));
    expect(p.layers.segments.filter((s) => s.k === label).length).toBeGreaterThan(samples.length);
  });

  it("this app reads it back exactly", () => {
    const q = own.pattern;
    expect(own.report.simplified).toBe(0);
    expect({ w: q.w, h: q.h, name: q.name, count: q.count, fabric: q.fabric, meta: q.meta, brands: q.brands, beadBrands: q.beadBrands }).toEqual({ w: p.w, h: p.h, name: p.name, count: p.count, fabric: p.fabric, meta: p.meta, brands: p.brands, beadBrands: p.beadBrands });
    expect(q.key).toEqual(p.key);
    expect([q.customs, q.blends, q.combos]).toEqual([p.customs, p.blends, p.combos]);
    expect([...q.layers.stitches]).toEqual([...p.layers.stitches]);
    expect([...q.layers.beads]).toEqual([...p.layers.beads]);
    expect(new Map([...q.layers.partials].sort((a, b) => a[0] - b[0]))).toEqual(new Map([...p.layers.partials].sort((a, b) => a[0] - b[0])));
    expect(q.layers.segments).toEqual(p.layers.segments);
    const byPlace = (a: { x: number; y: number }, b: { x: number; y: number }) => a.y - b.y || a.x - b.x;
    expect([...q.layers.knots].sort(byPlace)).toEqual([...p.layers.knots].sort(byPlace));
  });

  it("read without this app's extras, as another app has it: only what OXS has no words for differs", () => {
    expect(theirs.report.simplified).toBe(0);
    const differ = samples.flatMap((s, i) => (contents(theirs.pattern, areas[i]!).join() === contents(p, areas[i]!).join() ? [] : [`#${i + 1} ${s.what.en}`]));
    expect(differ).toEqual([
      // an own bead's number doesn't say it's a bead: floss + bead becomes a blend
      "#24 own thread + own bead: Kreinik 032 + Toho 11-21",
      // a bead on a grid point is an ordinary bead <object>, at the point
      "#36 bead Mill Hill 00020 on a grid corner",
      "#37 bead Mill Hill 00020 on the middle of a cell's edge",
      "#38 the same bead, 00557, in a cell and between cells: one palette item",
      // floss + bead on a grid point goes out as its tacking stitch
      "#39 floss + bead DMC 321 + Mill Hill 00557 on a grid corner",
      // line colour and wraps: this app's own
      "#62 DMC 3865 printed in red on the chart (line colour; only this app keeps it)",
      "#68 DMC 321, 2 strands, 3 wraps (only this app keeps wraps)",
      "#72 floss + bead DMC 321 + Mill Hill 00557 on the chart's bottom edge, below its number",
    ]);
  });

  it("the .oxs and its description (tests/fixtures/oxs-showcase)", async () => {
    const L: string[] = [
      `OXS showcase — ${p.name}`,
      `${p.w} × ${p.h} cells, ${p.count} count, fabric ${p.fabric}; author "${p.meta.designer}", copyright "${p.meta.copyright}"`,
      "",
      "How to read it",
      `- Each sample sits in a box of ${AREA.w} × ${AREA.h} cells; its number is backstitched just to its left in DMC 310, 1 strand`,
      "  (seven-segment digits, 1 cell wide and 2 high). Those lines are labels, not part of any sample.",
      `- Samples go left to right, ${PER_ROW} to a row of boxes, with 5 empty cells all round the chart; #72 sits on its bottom edge.`,
      "- Cells are counted from 1 (column,row), as on the app's rulers. Grid points and lines are counted from 0 at the",
      "  chart's top-left corner, in cells; .5 is halfway.",
      "- \"other apps\": what this app makes of the file without its own extras (the stitchwork attributes) — close to",
      "  what another reader can get from it. Shown only where it differs.",
      "",
      "Palette, as written in the file (index, number, name)",
      ...palette(xml),
      "",
    ];
    let group = "";
    samples.forEach((s, i) => {
      if (s.group !== group) L.push(`== ${GROUPS[(group = s.group)]} ==`, "");
      const a = areas[i]!, mine = contents(p, a), other = contents(theirs.pattern, a);
      L.push(`#${i + 1}  ${s.what.en}`, `     box: cells ${a.x + 1}–${a.x + a.w},${a.y + 1}–${a.y + a.h}`, `     in the file: ${s.how!.en}`);
      for (const line of mine) L.push(`     · ${line}`);
      if (other.join() !== mine.join()) for (const line of other) L.push(`     other apps · ${line}`);
      L.push("");
    });
    L.push(
      "Not in an .oxs (this app keeps them only in its own extras, or not at all)",
      "- key symbols, backstitch line styles and line colours, knot wraps — in the stitchwork attribute only",
      "- pattern info beyond title, author, copyright and instructions (publisher, source, notes, …); versions; photos",
      "",
    );
    await expect(xml + "\n").toMatchFileSnapshot(`${OUT}/showcase.oxs`);
    await expect(L.join("\n")).toMatchFileSnapshot(`${OUT}/showcase.txt`);
  });
});
