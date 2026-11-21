import { computeUsage, entryCount, partialCount } from "../../calculator/usage";
import { getBeadWord } from "../../catalog/catalog";
import { materialsOf, ORGANIZER } from "../../pattern/brands";
import type { ColorEntry } from "../../color/colorEntry";
import { resolveColor } from "../../pattern/resolve";
import type { Corner, KeyEntry, KeyIndex, Pattern } from "../../pattern/types";
import { stitchType } from "../../stitches/registry";
import { cornerOffset } from "./partials";
import { isPointBead } from "../../entryKinds/registry";

/*
 * Open Cross Stitch export (SPEC §10.3, §15.42). Each used key entry becomes its own palette item; beads are
 * de-duplicated by colour. Brands: a pattern of one brand — DMC threads, Mill Hill beads, what other apps assume —
 * names colours by code only; otherwise every colour's number starts with its brand, short ("ANC 403", "MH 00557",
 * your own brands in full: "Kreinik 032"). Each palette item also carries, in a `stitchwork` attribute other apps
 * ignore, exactly what it stands for (key entries with their symbols, own colours, blends, floss + bead), and a
 * bead between cells is marked so — so the app reads its own file back exactly. Fractional stitches and knots (SPEC §15.13–15.14): three-quarters as <partstitch>
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
  /** The key entries it stands for (a bead colour can be several). */
  entries: KeyEntry[];
}

/** Brands' short names in an exported number; your own brands go in full. */
const SHORT_BRAND: Record<string, string> = { DMC: "DMC", Anchor: "ANC", Madeira: "MAD", "Mill Hill": "MH", Preciosa: "PREC" };
/** What other apps take a bare number for. */
const ASSUMED = { thread: "DMC", bead: "Mill Hill" } as const;

/** The colours the chart uses, threads and beads apart — blends' and floss + bead's parts included. */
function usedColours(p: Pattern, used: (i: number) => boolean) {
  const out = { thread: new Set<string>(), bead: new Set<string>() };
  p.key.forEach((entry, i) => {
    if (!entry || !used(i)) return;
    const e = resolveColor(p, entry.src);
    if (!e) return;
    const add = (c: ColorEntry) => { if (c.brand !== ORGANIZER) out[c.kind === "bead" ? "bead" : "thread"].add(c.brand); };
    if (e.thread && e.bead) [e.thread, e.bead].forEach(add);
    else if (e.parts) e.parts.forEach((q) => add(q.entry));
    else add(e);
  });
  return out;
}

/** What an item stands for, for this app to read back exactly: its entries and the colours they're made of. */
function exactly(p: Pattern, entries: KeyEntry[]): string {
  const customs: Pattern["customs"] = {}, blends: Pattern["blends"] = {}, combos: Pattern["combos"] = {};
  const own = (id: string) => {
    if (p.customs[id]) customs[id] = p.customs[id];
  };
  for (const e of entries) {
    own(e.src);
    const blend = p.blends[e.src];
    if (blend) {
      blends[e.src] = blend;
      blend.parts.forEach((q) => own(q.id));
    }
    if (p.combos[e.src]) {
      combos[e.src] = p.combos[e.src]!;
      own(p.combos[e.src]!.thread);
      own(p.combos[e.src]!.bead);
    }
  }
  return JSON.stringify({ entries, ...(Object.keys(customs).length && { customs }), ...(Object.keys(blends).length && { blends }), ...(Object.keys(combos).length && { combos }) });
}

const FORMAT_LINE =
  '<format comments01="Designed to allow interchange of basic pattern data between any cross stitch style software" comments02="the \'properties\' section establishes size, copyright, authorship and software used" comments03="The features of each software package varies, but using XML each can pick out the things it can deal with, while ignoring others" comments04="The basic items are :" comments05="\'palette\'..a set of colors used in the design: palettecount excludes cloth color, which is item 0" comments06="\'fullstitches\'.. simple crosses" comments07="\'backstitches\'.. lines/objects with a start and end point" comments08="(There is a wide variety of ways of treating part stitches, knots, beads and so on.)" comments09="Colors are expressed in hex RGB format." comments10="Decimal numbers use US/UK format where \'.\' is the indicator - eg 0.5 is \'half\'" comments11="For readability, please use words not enumerations" comments12="The properties, fullstitches, and backstitches elements should be considered mandatory, even if empty" comments13="Exported by Stitchwork"/>';

export function exportOxs(p: Pattern): string {
  const usage = computeUsage(p).perEntry;
  const used = (i: number) => !!i && entryCount(usage.get(i)) + partialCount(usage.get(i)) > 0;
  // brands named in numbers unless the pattern keeps to the one other apps assume (SPEC §15.42)
  const brands = usedColours(p, used);
  const prefixed = { thread: brands.thread.size > 1 || (brands.thread.size === 1 && !brands.thread.has(ASSUMED.thread)), bead: brands.bead.size > 1 || (brands.bead.size === 1 && !brands.bead.has(ASSUMED.bead)) };
  const label = (c: ColorEntry) => (c.brand === ORGANIZER ? (c.kind === "bead" ? `${getBeadWord()} ${c.code}` : c.code) : prefixed[c.kind === "bead" ? "bead" : "thread"] ? `${SHORT_BRAND[c.brand] ?? c.brand} ${c.code}` : c.code);
  const items: Item[] = [];
  const keyItem = new Map<KeyIndex, number>(), beadItem = new Map<string, number>(), beadKind = new Map<string, string>();
  const beadIndex = (e: ColorEntry, entry: KeyEntry) => {
    if (!beadItem.has(e.id)) {
      items.push({ number: label(e), name: e.name, color: hx(e.hex), strands: 1, comments: "bead" + (e.series ? " " + e.series : ""), entries: [] });
      beadItem.set(e.id, items.length);
      beadKind.set(e.id, (e.series && OXS_BEAD_TYPE[e.series]) || "bead");
    }
    items[beadItem.get(e.id)! - 1]!.entries.push(entry);
    return beadItem.get(e.id)!;
  };
  p.key.forEach((entry, i) => {
    if (!entry || !used(i)) return;
    const e = resolveColor(p, entry.src);
    if (!e) return;
    if (entry.t === "bead") return void beadIndex(e, entry);
    if (entry.t === "combo" && isPointBead(entry) && e.thread && e.bead) {
      const bead = e.bead, thread = e.thread;
      const organizer = bead.brand === ORGANIZER || thread.brand === ORGANIZER;
      items.push({
        number: organizer ? `${label(thread)}+${label(bead)}` : `${label(bead)}+${label(thread)}`,
        name: organizer ? `${label(thread)} + ${label(bead)}` : `${label(bead)} + ${label(thread)}`,
        color: hx(bead.hex), strands: 1, comments: "bead" + (bead.series ? " " + bead.series : ""), entries: [entry],
      });
      keyItem.set(i, items.length);
      return;
    }
    const suffix = entry.t === "back" ? " (backstitch)" : entry.t === "knot" ? " (French knot)" : stitchType(entry.st).id === "full" ? "" : " (half cross)";
    if (entry.t === "combo" && e.thread && e.bead) {
      items.push({
        // a numbered organizer's floss is a bare number, its bead "Bead N"
        ...(e.thread.brand === ORGANIZER || e.bead.brand === ORGANIZER
          ? { number: `${label(e.thread)}+${label(e.bead)}`, name: `${label(e.thread)} + ${label(e.bead)}${isPointBead(entry) ? " (bead between cells)" : ""}` }
          : { number: `${label(e.bead)}+${label(e.thread)}`, name: `${label(e.bead)} + ${label(e.thread)}${isPointBead(entry) ? " (bead between cells)" : ""}` }),
        color: hx(e.thread.hex), blendcolor: hx(e.bead.hex),
        strands: entry.n ?? 2, comments: "blend", parts: [{ e: e.bead, n: 1 }, { e: e.thread, n: entry.n ?? 2 }], entries: [entry],
      });
    } else if (e.isBlend && e.parts) {
      items.push({
        number: e.parts.map((q) => label(q.entry)).join("+"), name: "Blend " + e.parts.map((q) => `${q.n}x${label(q.entry)}`).join(" + ") + suffix,
        color: hx(e.hex), blendcolor: hx(e.parts[1]?.entry.hex ?? e.hex), strands: e.parts.reduce((a, q) => a + q.n, 0), comments: "blend",
        parts: e.parts.map((q) => ({ e: q.entry, n: q.n })), entries: [entry],
      });
    } else items.push({ number: label(e), name: e.name + suffix, color: hx(e.hex), strands: entry.n ?? 1, comments: "", entries: [entry] });
    keyItem.set(i, items.length);
  });

  const ct = Math.floor(p.count);
  const L: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<chart>", FORMAT_LINE];
  L.push(
    `<properties oxsversion="1.0" software="Stitchwork" software_version="1.3" chartheight="${p.h}" chartwidth="${p.w}" charttitle="${xmlEscape(p.name)}" author="${xmlEscape(p.meta.designer)}" copyright="${xmlEscape(p.meta.copyright)}" instructions="${xmlEscape(p.meta.instructions)}" stitchesperinch="${ct}" stitchesperinch_y="${ct}" palettecount="${items.length}" stitchwork_materials="${xmlEscape(JSON.stringify(materialsOf(p)))}"/>`,
  );
  L.push("<palette>");
  L.push(`<palette_item index="0" number="cloth" name="cloth" color="${hx(p.fabric)}" printcolor="${hx(p.fabric)}" blendcolor="nil" comments="aida" strands="2" symbol="0" dashpattern="" bsstrands="1" bscolor="000000"/>`);
  items.forEach((it, k) => {
    const n = k + 1;
    const head = `<palette_item index="${n}" number="${xmlEscape(it.number)}" name="${xmlEscape(it.name)}" color="${it.color}" printcolor="${it.color}" blendcolor="${it.blendcolor || "nil"}" comments="${xmlEscape(it.comments)}" strands="${it.strands}" symbol="${n}" dashpattern="" bsstrands="${it.strands}" bscolor="${it.color}" stitchwork="${xmlEscape(exactly(p, it.entries))}"`;
    if (!it.parts) return void L.push(head + "/>");
    L.push(head + ">");
    it.parts.forEach((q) => L.push(`  <blend number="${xmlEscape(label(q.e))}" name="${xmlEscape(q.e.name)}" color="${hx(q.e.hex)}" strands="${q.n}"/>`));
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
  for (const k of knots) {
    const entry = p.key[k.k], e = entry && resolveColor(p, entry.src);
    if (!entry || !e) continue;
    // stitchwork_x/_y: the point itself, for this app to read back as a bead between cells (SPEC §15.42)
    const at = `stitchwork_x="${k.x}" stitchwork_y="${k.y}"`;
    if (entry.t === "bead") {
      if (beadItem.has(e.id)) objects.push(`<object x1="${k.x}" y1="${k.y}" palindex="${beadItem.get(e.id)}" objecttype="${beadKind.get(e.id)}" ${at}/>`);
    } else if (entry.t === "combo" && e.bead) {
      if (keyItem.has(k.k)) objects.push(`<object x1="${k.x}" y1="${k.y}" palindex="${keyItem.get(k.k)}" objecttype="${(e.bead.series && OXS_BEAD_TYPE[e.bead.series]) || "bead"}" ${at}/>`);
    } else if (keyItem.has(k.k)) objects.push(`<object x1="${k.x}" y1="${k.y}" palindex="${keyItem.get(k.k)}" objecttype="knot"/>`);
  }
  L.push("</backstitches>", "<ornaments_inc_knots_and_beads>", ...objects, "</ornaments_inc_knots_and_beads>", "<commentboxes>", "</commentboxes>", "</chart>");
  return L.join("\n");
}
