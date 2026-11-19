import { MADEIRA, PRECIOSA } from "../catalog/catalog";
import type { Corner, CustomColor } from "../pattern/types";
import { LINE_INKS } from "../symbols/lineInks";
import { backstitchNumber, layOut, Painter, type SampleDef } from "./painter";
import { words as t, type CheckSuite } from "./types";

/*
 * The .oxs test chart (SPEC §15.51): every kind of thing an .oxs of ours carries, each sample in a box of 5 × 2 cells
 * with its number backstitched to its left in DMC 310, one strand; 5 empty cells all round. tests/fixtures/oxs-showcase
 * holds the file and a description of it (oxsShowcase.test.ts). Samples keep their numbers: new ones go at the end.
 */

export const KREINIK: CustomColor = { id: "custom:kreinik", kind: "thread", brand: "Kreinik", code: "032", name: "Pearl", hex: "#EEE8D5" };
export const TOHO: CustomColor = { id: "custom:toho", kind: "bead", brand: "Toho", code: "11-21", name: "Silver lined", hex: "#C0C0C0" };
const MADEIRA_ID = MADEIRA.find((e) => /^\d+$/.test(e.code))!.id;
/** A Preciosa bead of another article than the plain one: its id carries the article. */
const PRECIOSA_ART = PRECIOSA.find((e) => e.id.includes("/"))!.id;

export function oxsSuite(): CheckSuite {
  const pt = new Painter("Перевірка OXS — «усе» & <знаки>"), p = pt.p;
  p.count = 16;
  p.fabric = "#EFE6D2";
  p.meta = { ...p.meta, designer: "пташечка", copyright: "© 2026 test", instructions: "Every sample numbered; see showcase.txt" };
  p.customs[KREINIK.id] = KREINIK;
  p.customs[TOHO.id] = TOHO;
  p.blends["blend:b11"] = { parts: [{ id: "dmc:310", n: 1 }, { id: "dmc:White", n: 1 }] };
  p.blends["blend:b21"] = { parts: [{ id: "dmc:310", n: 2 }, { id: "dmc:White", n: 1 }] };
  p.blends["blend:b3"] = { parts: [{ id: "dmc:321", n: 1 }, { id: "dmc:3865", n: 1 }, { id: "dmc:798", n: 1 }] };
  p.blends["blend:bAnc"] = { parts: [{ id: "dmc:321", n: 1 }, { id: "anchor:403", n: 1 }] };
  p.blends["blend:bOwn"] = { parts: [{ id: "dmc:3865", n: 1 }, { id: KREINIK.id, n: 1 }] };
  p.combos["combo:mh"] = { thread: "dmc:321", bead: "bead:00557" };
  p.combos["combo:prec"] = { thread: "anchor:403", bead: "preciosa:00050" };
  p.combos["combo:own"] = { thread: KREINIK.id, bead: TOHO.id };
  p.brands = ["DMC", "Anchor", "Madeira", "Kreinik"];
  p.beadBrands = ["Mill Hill", "Preciosa", "Toho"];
  const { thread, combo, bead, back, knot, cell, beadAt, part, line, point, row, corners } = pt;
  const two = (src: string, n?: number | null, st?: "half" | "halfb") => (x: number, y: number) => row(x, y, 2, thread(src, n, st));
  const four = (kind: "quarter" | "petite") => (x: number, y: number) =>
    (["dmc:310", "dmc:321", "dmc:3865", "dmc:798"] as const).forEach((s, c) => part(x, y, kind, c as Corner, thread(s, { "dmc:310": 2, "dmc:321": 3, "dmc:3865": 1, "dmc:798": 6 }[s])));

  const cross = "crosses", halves = "halves", combos = "combos", beads = "beads", points = "points", parts = "partials", lines = "backstitch", knots = "knots";
  const defs: SampleDef[] = [
    { id: "dmc310", group: cross, tags: ["dmc"], what: t("DMC 310, 2 strands", "DMC 310, 2 нитки"), how: t("<stitch>", "<stitch>"), put: two("dmc:310") },
    { id: "dmcWhite", group: cross, tags: ["dmcNamed"], what: t("DMC White — the code is a word", "DMC White — код словом"), how: t('<stitch>; number "DMC White"', '<stitch>; number "DMC White"'), put: two("dmc:White") },
    { id: "dmcEcru", group: cross, tags: ["dmcNamed"], what: t("DMC Ecru", "DMC Ecru"), how: t("<stitch>", "<stitch>"), put: two("dmc:Ecru") },
    { id: "dmcB5200", group: cross, tags: ["dmcNamed"], what: t("DMC B5200", "DMC B5200"), how: t("<stitch>", "<stitch>"), put: two("dmc:B5200") },
    { id: "strands1", group: cross, tags: ["strands"], what: t("DMC 3865, 1 strand", "DMC 3865, 1 нитка"), how: t('<stitch>; strands="1"', '<stitch>; strands="1"'), put: two("dmc:3865", 1) },
    { id: "strands3", group: cross, tags: ["strands"], what: t("DMC 321, 3 strands", "DMC 321, 3 нитки"), how: t('<stitch>; strands="3"', '<stitch>; strands="3"'), put: two("dmc:321", 3) },
    { id: "strands6", group: cross, tags: ["strands"], what: t("DMC 798, 6 strands", "DMC 798, 6 ниток"), how: t('<stitch>; strands="6"', '<stitch>; strands="6"'), put: two("dmc:798", 6) },
    { id: "anchor", group: cross, tags: ["anchor"], what: t("Anchor 403", "Anchor 403"), how: t('<stitch>; number "ANC 403"', '<stitch>; number "ANC 403"'), put: two("anchor:403") },
    { id: "madeira", group: cross, tags: ["madeira"], what: t(`Madeira ${MADEIRA_ID.split(":")[1]}`, `Madeira ${MADEIRA_ID.split(":")[1]}`), how: t('<stitch>; number "MAD …"', '<stitch>; number "MAD …"'), put: two(MADEIRA_ID) },
    { id: "ownThread", group: cross, tags: ["ownThread"], what: t("own thread: Kreinik 032 Pearl", "своя нитка: Kreinik 032 Pearl"), how: t('<stitch>; number "Kreinik 032"', '<stitch>; number "Kreinik 032"'), put: two(KREINIK.id, 1) },
    { id: "blend11", group: cross, tags: ["blend"], what: t("blend: 1 DMC 310 + 1 DMC White", "бленд: 1 DMC 310 + 1 DMC White"), how: t("<stitch>; palette item with two <blend>", "<stitch>; колір палітри з двома <blend>"), put: two("blend:b11") },
    { id: "blend21", group: cross, tags: ["blend", "blendStrands"], what: t("blend: 2 DMC 310 + 1 DMC White (strands differ)", "бленд: 2 DMC 310 + 1 DMC White (різна кількість ниток)"), how: t('<stitch>; <blend strands="2"> + <blend strands="1">', '<stitch>; <blend strands="2"> + <blend strands="1">'), put: two("blend:b21") },
    { id: "blend3", group: cross, tags: ["blend", "blend3"], what: t("blend of three: DMC 321 + 3865 + 798", "бленд із трьох: DMC 321 + 3865 + 798"), how: t("<stitch>; three <blend>", "<stitch>; три <blend>"), put: two("blend:b3") },
    { id: "blendBrands", group: cross, tags: ["blend", "anchor"], what: t("blend across brands: DMC 321 + Anchor 403", "бленд різних брендів: DMC 321 + Anchor 403"), how: t('<stitch>; <blend number="DMC 321"> + <blend number="ANC 403">', '<stitch>; <blend number="DMC 321"> + <blend number="ANC 403">'), put: two("blend:bAnc") },
    { id: "blendOwn", group: cross, tags: ["blend", "ownThread"], what: t("blend with an own thread: DMC 3865 + Kreinik 032", "бленд зі своєю ниткою: DMC 3865 + Kreinik 032"), how: t('<stitch>; <blend number="Kreinik 032">', '<stitch>; <blend number="Kreinik 032">'), put: two("blend:bOwn") },
    { id: "half", group: halves, tags: ["half"], what: t("half ╱ DMC 310", "напівхрестик ╱ DMC 310"), how: t('<object objecttype="tent" direction="2">', '<object objecttype="tent" direction="2">'), put: two("dmc:310", 2, "half") },
    { id: "halfb", group: halves, tags: ["half"], what: t("half ╲ DMC 310", "напівхрестик ╲ DMC 310"), how: t('<object objecttype="tent" direction="1">', '<object objecttype="tent" direction="1">'), put: two("dmc:310", 2, "halfb") },
    { id: "halfBlend", group: halves, tags: ["half", "blend"], what: t("half ╱ blend 1 DMC 310 + 1 DMC White", "напівхрестик ╱ бленд 1 DMC 310 + 1 DMC White"), how: t("tent, direction 2, blend item", "tent, direction 2, колір-бленд"), put: two("blend:b11", null, "half") },
    { id: "halfAnchor", group: halves, tags: ["half", "anchor"], what: t("half ╲ Anchor 403", "напівхрестик ╲ Anchor 403"), how: t("tent, direction 1", "tent, direction 1"), put: two("anchor:403", 2, "halfb") },
    { id: "combo", group: combos, tags: ["combo"], what: t("whole cross DMC 321 + bead Mill Hill 00557", "хрестик DMC 321 + бісер Mill Hill 00557"), how: t('<stitch>; item "MH 00557+DMC 321", comments="blend", two <blend>', '<stitch>; колір "MH 00557+DMC 321", comments="blend", два <blend>'), put: (x, y) => row(x, y, 2, combo("combo:mh")) },
    { id: "comboHalf", group: combos, tags: ["combo", "half"], what: t("half ╱ DMC 321 + bead Mill Hill 00557", "напівхрестик ╱ DMC 321 + бісер Mill Hill 00557"), how: t("tent, direction 2, the floss + bead item", "tent, direction 2, колір «нитка + бісер»"), put: (x, y) => row(x, y, 2, combo("combo:mh", "half")) },
    { id: "comboHalfb", group: combos, tags: ["combo", "half"], what: t("half ╲ DMC 321 + bead Mill Hill 00557", "напівхрестик ╲ DMC 321 + бісер Mill Hill 00557"), how: t("tent, direction 1", "tent, direction 1"), put: (x, y) => row(x, y, 2, combo("combo:mh", "halfb")) },
    { id: "comboPreciosa", group: combos, tags: ["combo", "anchor", "preciosa"], what: t("whole cross Anchor 403 + bead Preciosa 00050", "хрестик Anchor 403 + бісер Preciosa 00050"), how: t('<stitch>; item "PREC 00050+ANC 403"', '<stitch>; колір "PREC 00050+ANC 403"'), put: (x, y) => row(x, y, 2, combo("combo:prec")) },
    { id: "comboOwn", group: combos, tags: ["combo", "ownThread", "ownBead"], what: t("own thread + own bead: Kreinik 032 + Toho 11-21", "своя нитка + свій бісер: Kreinik 032 + Toho 11-21"), how: t('<stitch>; item "Toho 11-21+Kreinik 032"', '<stitch>; колір "Toho 11-21+Kreinik 032"'), put: (x, y) => row(x, y, 2, combo("combo:own")) },
    ...([
      ["beadSeed", "bead:00557", t("Mill Hill 00557 (Glass Seed)", "Mill Hill 00557 (Glass Seed)"), "bead", ["beadSeed"]],
      ["beadPetite", "bead:40020", t("Mill Hill 40020 (Petite Glass)", "Mill Hill 40020 (Petite Glass)"), "bead2mm", ["beadSize"]],
      ["beadSize8", "bead:18002", t("Mill Hill 18002 (Size 8)", "Mill Hill 18002 (Size 8)"), "bead3mm", ["beadSize"]],
      ["beadSize6", "bead:16002", t("Mill Hill 16002 (Size 6)", "Mill Hill 16002 (Size 6)"), "bead5mm", ["beadSize"]],
      ["beadPebble", "bead:05002", t("Mill Hill 05002 (Pebble)", "Mill Hill 05002 (Pebble)"), "bead6mm", ["beadSize"]],
      ["beadBugle", "bead:70020", t("Mill Hill 70020 (Small Bugle)", "Mill Hill 70020 (Small Bugle)"), "bead", ["bugle"]],
      ["beadTreasure", "bead:12005", t("Mill Hill 12005 (Glass Treasure)", "Mill Hill 12005 (Glass Treasure)"), "bead", ["treasure"]],
      ["preciosa", "preciosa:00050", t("Preciosa 00050, the plain article", "Preciosa 00050, звичайний артикул"), "bead", ["preciosa"]],
      ["preciosaArticle", PRECIOSA_ART, t(`Preciosa ${PRECIOSA_ART.split(":")[1]} — another article of the same code`, `Preciosa ${PRECIOSA_ART.split(":")[1]} — інший артикул того ж коду`), "bead", ["preciosa"]],
      ["ownBead", TOHO.id, t("own bead: Toho 11-21", "свій бісер: Toho 11-21"), "bead", ["ownBead"]],
    ] as const).map(([id, src, what, type, tags]): SampleDef => ({
      id, group: beads, tags: [...tags], what, how: t(`<object objecttype="${type}"> at the cell's centre (x + 0.5)`, `<object objecttype="${type}"> у центрі клітинки (x + 0.5)`), put: (x, y) => [0, 1].forEach((i) => beadAt(x + i, y, bead(src))),
    })),
    { id: "beadOnCross", group: beads, tags: ["beadOnCross"], what: t("bead on a whole cross, one cell (other apps' files have it; kept together)", "бісер на хрестику в одній клітинці (буває у файлах інших програм)"), how: t("<stitch> and a bead <object> in one cell", "<stitch> і бісер <object> в одній клітинці"), put: (x, y) => { cell(x, y, thread("dmc:3865", 1)); beadAt(x, y, bead("bead:00557")); } },
    { id: "pointBead", group: points, tags: ["pointBead"], what: t("bead Mill Hill 00020 on a grid corner", "бісер Mill Hill 00020 у куті сітки"), how: t('<object objecttype="bead"> at the point, stitchwork_x/_y', '<object objecttype="bead"> у точці, stitchwork_x/_y'), put: (x, y) => point(x + 1, y + 1, bead("bead:00020", "point")) },
    { id: "pointBeadEdge", group: points, tags: ["pointBead"], what: t("bead Mill Hill 00020 on the middle of a cell's edge", "бісер Mill Hill 00020 посередині краю клітинки"), how: t("bead <object> at x.5", "бісер <object> на x.5"), put: (x, y) => point(x + 1.5, y + 1, bead("bead:00020", "point")) },
    { id: "beadBothWays", group: points, tags: ["pointBead", "beadSeed"], what: t("the same bead, 00557, in a cell and between cells: one palette item", "той самий бісер 00557 у клітинці й між клітинками: один колір палітри"), how: t("one bead item, two <object>", "один колір, два <object>"), put: (x, y) => { beadAt(x, y, bead("bead:00557")); point(x + 3, y + 1, bead("bead:00557", "point")); } },
    { id: "pointCombo", group: points, tags: ["pointCombo"], what: t("floss + bead DMC 321 + Mill Hill 00557 on a grid corner", "нитка + бісер DMC 321 + Mill Hill 00557 у куті сітки"), how: t("a short <backstitch> ╱ through the point, in the floss + bead item", "короткий <backstitch> ╱ через точку, кольором «нитка + бісер»"), put: (x, y) => point(x + 1, y + 1, combo("combo:mh", "point")) },
    { id: "threeQuarter", group: parts, tags: ["threeQuarter"], what: t("¾ DMC 310 — cells left to right: corner TL, TR, BR, BL", "¾ DMC 310 — клітинки зліва направо: кут ↖, ↗, ↘, ↙"), how: t("<partstitch> direction 2 (TL, BR) / 1 (TR, BL), the other palindex 0", "<partstitch> direction 2 (↖, ↘) / 1 (↗, ↙), другий palindex 0"), put: (x, y) => corners(x, y, "threeQuarter", thread("dmc:310")) },
    { id: "quarter", group: parts, tags: ["quarter"], what: t("¼ DMC 310 — corners TL, TR, BR, BL", "¼ DMC 310 — кути ↖, ↗, ↘, ↙"), how: t('<object objecttype="quarter" petit="false"> at the quarter\'s top-left', '<object objecttype="quarter" petit="false"> у лівому верхньому куті чверті'), put: (x, y) => corners(x, y, "quarter", thread("dmc:310")) },
    { id: "petite", group: parts, tags: ["petite"], what: t("petite DMC 310 — corners TL, TR, BR, BL", "петіт DMC 310 — кути ↖, ↗, ↘, ↙"), how: t('<object objecttype="petite">', '<object objecttype="petite">'), put: (x, y) => corners(x, y, "petite", thread("dmc:310")) },
    { id: "twoThreeQuartersSlash", group: parts, tags: ["threeQuarter", "sharedCell"], what: t("two ¾ in one cell, split ╱: TL DMC 310, BR DMC 321", "два ¾ в одній клітинці, поділ ╱: ↖ DMC 310, ↘ DMC 321"), how: t('one <partstitch direction="2"> with both palindexes', 'один <partstitch direction="2"> з обома palindex'), put: (x, y) => { part(x, y, "threeQuarter", 0, thread("dmc:310")); part(x, y, "threeQuarter", 2, thread("dmc:321", 3)); } },
    { id: "twoThreeQuartersBackslash", group: parts, tags: ["threeQuarter", "sharedCell"], what: t("two ¾ in one cell, split ╲: TR DMC 310, BL DMC 321", "два ¾ в одній клітинці, поділ ╲: ↗ DMC 310, ↙ DMC 321"), how: t('one <partstitch direction="1">', 'один <partstitch direction="1">'), put: (x, y) => { part(x, y, "threeQuarter", 1, thread("dmc:310")); part(x, y, "threeQuarter", 3, thread("dmc:321", 3)); } },
    { id: "threeQuarterQuarter", group: parts, tags: ["threeQuarter", "quarter", "sharedCell"], what: t("¾ TL DMC 310 + ¼ BR DMC 321 in one cell", "¾ ↖ DMC 310 + ¼ ↘ DMC 321 в одній клітинці"), how: t("<partstitch> + quarter <object>", "<partstitch> + quarter <object>"), put: (x, y) => { part(x, y, "threeQuarter", 0, thread("dmc:310")); part(x, y, "quarter", 2, thread("dmc:321", 3)); } },
    { id: "fourQuarters", group: parts, tags: ["quarter", "sharedCell"], what: t("four ¼ in one cell: TL 310, TR 321, BR 3865, BL 798", "чотири ¼ в одній клітинці: ↖ 310, ↗ 321, ↘ 3865, ↙ 798"), how: t("four quarter <object>", "чотири quarter <object>"), put: four("quarter") },
    { id: "fourPetites", group: parts, tags: ["petite", "sharedCell"], what: t("four petites in one cell: TL 310, TR 321, BR 3865, BL 798", "чотири петіти в одній клітинці: ↖ 310, ↗ 321, ↘ 3865, ↙ 798"), how: t("four petite <object>", "чотири petite <object>"), put: four("petite") },
    { id: "halfQuarter", group: parts, tags: ["half", "quarter", "sharedCell"], what: t("half ╱ DMC 310 + ¼ DMC 321: TL in the first cell, BR in the second", "напівхрестик ╱ DMC 310 + ¼ DMC 321: ↖ у першій клітинці, ↘ у другій"), how: t("tent + quarter <object>", "tent + quarter <object>"), put: (x, y) => { cell(x, y, thread("dmc:310", 2, "half")); part(x, y, "quarter", 0, thread("dmc:321", 3)); cell(x + 1, y, thread("dmc:310", 2, "half")); part(x + 1, y, "quarter", 2, thread("dmc:321", 3)); } },
    { id: "threeQuarterBlend", group: parts, tags: ["threeQuarter", "blend"], what: t("¾ in a blend (1 DMC 310 + 1 DMC White), corners TL, TR", "¾ блендом (1 DMC 310 + 1 DMC White), кути ↖, ↗"), how: t("<partstitch>, blend item", "<partstitch>, колір-бленд"), put: (x, y) => { part(x, y, "threeQuarter", 0, thread("blend:b11")); part(x + 1, y, "threeQuarter", 1, thread("blend:b11")); } },
    { id: "quarterBlend3", group: parts, tags: ["quarter", "blend", "blend3"], what: t("¼ in a blend of three, corners TL, BR", "¼ блендом із трьох, кути ↖, ↘"), how: t("quarter <object>, blend item", "quarter <object>, колір-бленд"), put: (x, y) => { part(x, y, "quarter", 0, thread("blend:b3")); part(x + 1, y, "quarter", 2, thread("blend:b3")); } },
    { id: "petiteAnchor", group: parts, tags: ["petite", "anchor"], what: t("petite Anchor 403, corners TR, BL", "петіт Anchor 403, кути ↗, ↙"), how: t("petite <object>", "petite <object>"), put: (x, y) => { part(x, y, "petite", 1, thread("anchor:403")); part(x + 1, y, "petite", 3, thread("anchor:403")); } },
    { id: "threeQuarterOwn", group: parts, tags: ["threeQuarter", "ownThread"], what: t("¾ own thread Kreinik 032, corners BR, BL", "¾ своєю ниткою Kreinik 032, кути ↘, ↙"), how: t("<partstitch>", "<partstitch>"), put: (x, y) => { part(x, y, "threeQuarter", 2, thread(KREINIK.id, 1)); part(x + 1, y, "threeQuarter", 3, thread(KREINIK.id, 1)); } },
    { id: "backLevel", group: lines, tags: ["backstitch"], what: t("DMC 321, 1 strand: one cell long, level", "DMC 321, 1 нитка: на одну клітинку, рівно"), how: t("<backstitch>", "<backstitch>"), put: (x, y) => line(x, y + 1, x + 1, y + 1, back("dmc:321")) },
    { id: "backUpright", group: lines, tags: ["backstitch"], what: t("DMC 321: two cells, upright", "DMC 321: дві клітинки, прямовисно"), how: t("<backstitch>", "<backstitch>"), put: (x, y) => line(x + 1, y, x + 1, y + 2, back("dmc:321")) },
    { id: "backSlanted", group: lines, tags: ["backstitch"], what: t("DMC 321: corner to corner, slanted", "DMC 321: з кута в кут, навскіс"), how: t("<backstitch>", "<backstitch>"), put: (x, y) => line(x, y + 2, x + 2, y, back("dmc:321")) },
    { id: "backHalfGrid", group: lines, tags: ["backstitch", "halfGrid"], what: t("DMC 321: to a cell's centre (half grid)", "DMC 321: до центру клітинки (пів сітки)"), how: t("<backstitch> with x.5 / y.5", "<backstitch> з x.5 / y.5"), put: (x, y) => line(x, y, x + 1.5, y + 0.5, back("dmc:321")) },
    { id: "backZigzag", group: lines, tags: ["backstitch"], what: t("DMC 321: a zigzag of four lines", "DMC 321: зиґзаґ із чотирьох ліній"), how: t("four <backstitch>, sequence in order", "чотири <backstitch> по черзі"), put: (x, y) => [0, 1, 2, 3].forEach((i) => line(x + i, y + (i % 2 ? 2 : 0), x + i + 1, y + (i % 2 ? 0 : 2), back("dmc:321"))) },
    { id: "backLong", group: lines, tags: ["backstitch"], what: t("DMC 321: one long line over five cells", "DMC 321: одна довга лінія через п'ять клітинок"), how: t("one <backstitch>", "один <backstitch>"), put: (x, y) => line(x, y + 1, x + 5, y + 1, back("dmc:321")) },
    { id: "backBlend", group: lines, tags: ["backstitch", "blend"], what: t("blend 1 DMC 310 + 1 DMC White", "бленд 1 DMC 310 + 1 DMC White"), how: t("<backstitch>, blend item named … (backstitch)", "<backstitch>, колір-бленд із назвою … (backstitch)"), put: (x, y) => line(x, y + 1, x + 3, y + 1, back("blend:b11")) },
    { id: "backAnchor", group: lines, tags: ["backstitch", "anchor", "strands"], what: t("Anchor 403, 2 strands", "Anchor 403, 2 нитки"), how: t('<backstitch>; bsstrands="2"', '<backstitch>; bsstrands="2"'), put: (x, y) => line(x, y + 1, x + 3, y + 1, back("anchor:403", 2)) },
    { id: "backOwn", group: lines, tags: ["backstitch", "ownThread"], what: t("own thread Kreinik 032", "своя нитка Kreinik 032"), how: t("<backstitch>", "<backstitch>"), put: (x, y) => line(x, y + 1, x + 3, y + 1, back(KREINIK.id)) },
    { id: "backInk", group: lines, tags: ["lineColour"], what: t("DMC 3865 printed in red on the chart (line colour; only this app keeps it)", "DMC 3865, на схемі червоним (колір лінії є лише в пташечці)"), how: t("<backstitch>; the colour in the stitchwork attribute", "<backstitch>; колір в атрибуті stitchwork"), put: (x, y) => line(x, y + 1, x + 3, y + 1, back("dmc:3865", 1, { ink: LINE_INKS[1].hex })) },
    { id: "backOverCrosses", group: lines, tags: ["backstitch"], what: t("DMC 321 over whole crosses of DMC 3865", "DMC 321 поверх хрестиків DMC 3865"), how: t("<stitch> + <backstitch>", "<stitch> + <backstitch>"), put: (x, y) => { row(x, y, 3, thread("dmc:3865", 1)); line(x, y + 1, x + 3, y + 1, back("dmc:321")); } },
    { id: "knot", group: knots, tags: ["knot", "strands"], what: t("DMC 310, 2 strands, on a grid corner", "DMC 310, 2 нитки, у куті сітки"), how: t('<object objecttype="knot">', '<object objecttype="knot">'), put: (x, y) => point(x + 1, y + 1, knot("dmc:310")) },
    { id: "knotCentre", group: knots, tags: ["knot"], what: t("DMC 310 in a cell's centre", "DMC 310 у центрі клітинки"), how: t("knot at x.5, y.5", "knot на x.5, y.5"), put: (x, y) => point(x + 1.5, y + 0.5, knot("dmc:310")) },
    { id: "knotEdge", group: knots, tags: ["knot"], what: t("DMC 310 on the middle of a cell's edge", "DMC 310 посередині краю клітинки"), how: t("knot at x.5", "knot на x.5"), put: (x, y) => point(x + 1.5, y + 1, knot("dmc:310")) },
    { id: "knotBlend", group: knots, tags: ["knot", "blend"], what: t("blend 1 DMC 310 + 1 DMC White", "бленд 1 DMC 310 + 1 DMC White"), how: t("knot, blend item named … (French knot)", "knot, колір-бленд із назвою … (French knot)"), put: (x, y) => point(x + 1, y + 1, knot("blend:b11")) },
    { id: "knotWraps", group: knots, tags: ["knotWraps"], what: t("DMC 321, 2 strands, 3 wraps (only this app keeps wraps)", "DMC 321, 2 нитки, 3 оберти (оберти є лише в пташечці)"), how: t("knot; wraps in the stitchwork attribute", "knot; оберти в атрибуті stitchwork"), put: (x, y) => point(x + 1, y + 1, knot("dmc:321", 2, 3)) },
    { id: "knotAnchor", group: knots, tags: ["knot", "anchor"], what: t("Anchor 403, 1 strand", "Anchor 403, 1 нитка"), how: t("knot", "knot"), put: (x, y) => point(x + 1, y + 1, knot("anchor:403", 1)) },
    { id: "knotOnCrosses", group: knots, tags: ["knot"], what: t("DMC 310 on whole crosses of DMC 3865", "DMC 310 на хрестиках DMC 3865"), how: t("<stitch> + knot <object>", "<stitch> + knot <object>"), put: (x, y) => { row(x, y, 2, thread("dmc:3865", 1)); point(x + 1, y + 1, knot("dmc:310")); } },
    { id: "everyUse", group: "everyUse", tags: ["manyUses"], what: t("DMC 798, 1 strand: whole cross, half ╱, ¾, backstitch, knot — a palette item each", "DMC 798, 1 нитка: хрестик, напівхрестик ╱, ¾, бекстіч, вузлик — кожне окремим кольором палітри"), how: t("five items numbered 798", "п'ять кольорів із номером 798"), put: (x, y) => {
      cell(x, y, thread("dmc:798", 1));
      cell(x + 1, y, thread("dmc:798", 1, "half"));
      part(x + 2, y, "threeQuarter", 0, thread("dmc:798", 1));
      line(x, y + 2, x + 3, y + 2, back("dmc:798"));
      point(x + 4, y + 1, knot("dmc:798", 1));
    } },
    // last: on the chart's bottom edge, below its number and the margin
    { id: "pointComboEdge", group: "edge", tags: ["pointCombo", "chartEdge"], toBottom: true, what: t("floss + bead DMC 321 + Mill Hill 00557 on the chart's bottom edge, below its number", "нитка + бісер DMC 321 + Mill Hill 00557 на нижньому краю схеми, під номером"), how: t("its tacking <backstitch> cut at the edge: (x−0.5, h) to (x+0.5, h−0.5)", "його закріпка <backstitch>, обрізана по краю: (x−0.5, h) – (x+0.5, h−0.5)"), put: (x, _y, chart) => point(x + 1, chart.h, combo("combo:mh", "point")) },
  ];
  const label = pt.back("dmc:310");
  return layOut("oxs", pt, defs, { label, margin: 5, perRow: 5, labelW: 4, areaW: 5, areaH: 2, gapX: 1, gapY: 1, number: (n, x, y) => backstitchNumber(pt, n, x, y, label) });
}
