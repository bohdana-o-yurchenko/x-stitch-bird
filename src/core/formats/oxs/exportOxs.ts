import { computeUsage, entryCount, partialCount } from "../../calculator/usage";
import type { ColorEntry } from "../../color/colorEntry";
import { resolveColor } from "../../pattern/resolve";
import type { Corner, KeyIndex, Pattern } from "../../pattern/types";
import { stitchType } from "../../stitches/registry";
import { cornerOffset } from "./partials";

/*
 * Open Cross Stitch export (SPEC §10.3). Each used key entry becomes its own palette item; beads are
 * de-duplicated by colour. Fractional stitches and knots (SPEC §15.13–15.14): three-quarters as <partstitch>
 * (direction 2 = split along ╱, 1 = along ╲); quarters and petites as <object>s placed on the half grid — x1/y1 is
 * the top-left of the quarter of the cell they cover (Ursa / XSPro convention), quarters marked petit="false".
 */

export const OXS_BEAD_TYPE: Record<string, string> = { "Petite Glass": "bead2mm", "Size 8": "bead3mm", "Size 6": "bead5mm", Pebble: "bead6mm" };

export const xmlEscape = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hx = (h: string) => h.replace("#", "").toUpperCase();

interface Item {
  number: string;
  name: string;
  color: string;
  blendcolor?: string;
  strands: number;
  comments: string;
  parts?: { e: ColorEntry; n: number }[];
}

const FORMAT_LINE =
  '<format comments01="Designed to allow interchange of basic pattern data between any cross stitch style software" comments02="the \'properties\' section establishes size, copyright, authorship and software used" comments03="The features of each software package varies, but using XML each can pick out the things it can deal with, while ignoring others" comments04="The basic items are :" comments05="\'palette\'..a set of colors used in the design: palettecount excludes cloth color, which is item 0" comments06="\'fullstitches\'.. simple crosses" comments07="\'backstitches\'.. lines/objects with a start and end point" comments08="(There is a wide variety of ways of treating part stitches, knots, beads and so on.)" comments09="Colors are expressed in hex RGB format." comments10="Decimal numbers use US/UK format where \'.\' is the indicator - eg 0.5 is \'half\'" comments11="For readability, please use words not enumerations" comments12="The properties, fullstitches, and backstitches elements should be considered mandatory, even if empty" comments13="Exported by Stitchwork"/>';

export function exportOxs(p: Pattern): string {
  const usage = computeUsage(p).perEntry;
  const items: Item[] = [];
  const keyItem = new Map<KeyIndex, number>(), beadItem = new Map<string, number>(), beadKind = new Map<string, string>();
  const beadIndex = (e: ColorEntry) => {
    if (!beadItem.has(e.id)) {
      items.push({ number: e.code, name: e.name, color: hx(e.hex), strands: 1, comments: "bead" + (e.series ? " " + e.series : "") });
      beadItem.set(e.id, items.length);
      beadKind.set(e.id, (e.series && OXS_BEAD_TYPE[e.series]) || "bead");
    }
    return beadItem.get(e.id)!;
  };
  p.key.forEach((entry, i) => {
    const u = usage.get(i);
    if (!entry || !i || !(entryCount(u) + partialCount(u))) return;
    const e = resolveColor(p, entry.src);
    if (!e) return;
    if (entry.t === "bead") return void beadIndex(e);
    const suffix = entry.t === "back" ? " (backstitch)" : entry.t === "knot" ? " (French knot)" : stitchType(entry.st).id === "full" ? "" : " (half cross)";
    if (entry.t === "combo" && e.thread && e.bead) {
      items.push({
        number: `${e.bead.code}+${e.thread.code}`, name: `${e.bead.code} + ${e.thread.code}`, color: hx(e.thread.hex), blendcolor: hx(e.bead.hex),
        strands: entry.n ?? 2, comments: "blend", parts: [{ e: e.bead, n: 1 }, { e: e.thread, n: entry.n ?? 2 }],
      });
    } else if (e.isBlend && e.parts) {
      items.push({
        number: e.parts.map((q) => q.entry.code).join("+"), name: "Blend " + e.parts.map((q) => `${q.n}x${q.entry.code}`).join(" + ") + suffix,
        color: hx(e.hex), blendcolor: hx(e.parts[1]?.entry.hex ?? e.hex), strands: e.parts.reduce((a, q) => a + q.n, 0), comments: "blend",
        parts: e.parts.map((q) => ({ e: q.entry, n: q.n })),
      });
    } else items.push({ number: e.code, name: e.name + suffix, color: hx(e.hex), strands: entry.n ?? 1, comments: "" });
    keyItem.set(i, items.length);
  });

  const ct = Math.floor(p.count);
  const L: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<chart>", FORMAT_LINE];
  L.push(
    `<properties oxsversion="1.0" software="Stitchwork" software_version="1.3" chartheight="${p.h}" chartwidth="${p.w}" charttitle="${xmlEscape(p.name)}" author="${xmlEscape(p.meta.designer)}" copyright="${xmlEscape(p.meta.copyright)}" instructions="${xmlEscape(p.meta.instructions)}" stitchesperinch="${ct}" stitchesperinch_y="${ct}" palettecount="${items.length}"/>`,
  );
  L.push("<palette>");
  L.push(`<palette_item index="0" number="cloth" name="cloth" color="${hx(p.fabric)}" printcolor="${hx(p.fabric)}" blendcolor="nil" comments="aida" strands="2" symbol="0" dashpattern="" bsstrands="1" bscolor="000000"/>`);
  items.forEach((it, k) => {
    const n = k + 1;
    const head = `<palette_item index="${n}" number="${xmlEscape(it.number)}" name="${xmlEscape(it.name)}" color="${it.color}" printcolor="${it.color}" blendcolor="${it.blendcolor || "nil"}" comments="${xmlEscape(it.comments)}" strands="${it.strands}" symbol="${n}" dashpattern="" bsstrands="${it.strands}" bscolor="${it.color}"`;
    if (!it.parts) return void L.push(head + "/>");
    L.push(head + ">");
    it.parts.forEach((q) => L.push(`  <blend number="${xmlEscape(q.e.code)}" name="${xmlEscape(q.e.name)}" color="${hx(q.e.hex)}" strands="${q.n}"/>`));
    L.push("</palette_item>");
  });
  L.push("</palette>", "<fullstitches>");

  const objects: string[] = [];
  const { stitches, beads, partials, segments, knots } = p.layers;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const v = stitches[y * p.w + x] ?? 0;
      const item = keyItem.get(v);
      if (!v || !item) continue;
      const st = stitchType(p.key[v]?.st);
      if (st.id === "full") L.push(`<stitch x="${x}" y="${y}" palindex="${item}"/>`);
      else objects.push(`<object x1="${x}" y1="${y}" palindex="${item}" objecttype="tent" direction="${st.oxsTentDirection}"/>`);
    }
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const v = beads[y * p.w + x] ?? 0, entry = p.key[v];
      const e = entry && resolveColor(p, entry.src);
      if (!v || !e || !beadItem.has(e.id)) continue;
      objects.push(`<object x1="${x + 0.5}" y1="${y + 0.5}" palindex="${beadItem.get(e.id)}" objecttype="${beadKind.get(e.id)}"/>`);
    }
  L.push("</fullstitches>", "<partstitches>");
  for (const [i, list] of [...partials].sort((a, b) => a[0] - b[0])) {
    const x = i % p.w, y = (i / p.w) | 0;
    const tq = (c: Corner) => keyItem.get(list.find((s) => s.kind === "threeQuarter" && s.corner === c)?.k ?? 0) ?? 0;
    for (const [dir, a, b] of [[2, 0, 2], [1, 1, 3]] as const) {
      const pa = tq(a), pb = tq(b);
      if (pa || pb) L.push(`<partstitch x="${x}" y="${y}" palindex1="${pa}" palindex2="${pb}" direction="${dir}"/>`);
    }
    for (const s of list)
      if (s.kind !== "threeQuarter" && keyItem.has(s.k)) {
        const { dx, dy } = cornerOffset(s.corner);
        objects.push(`<object x1="${x + dx}" y1="${y + dy}" palindex="${keyItem.get(s.k)}" objecttype="${s.kind}"${s.kind === "quarter" ? ' petit="false"' : ""}/>`);
      }
  }
  L.push("</partstitches>", "<backstitches>");
  segments.forEach((s, q) => {
    if (keyItem.has(s.k)) L.push(`<backstitch x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" palindex="${keyItem.get(s.k)}" objecttype="backstitch" sequence="${q}"/>`);
  });
  for (const k of knots) if (keyItem.has(k.k)) objects.push(`<object x1="${k.x}" y1="${k.y}" palindex="${keyItem.get(k.k)}" objecttype="knot"/>`);
  L.push("</backstitches>", "<ornaments_inc_knots_and_beads>", ...objects, "</ornaments_inc_knots_and_beads>", "<commentboxes>", "</commentboxes>", "</chart>");
  return L.join("\n");
}
