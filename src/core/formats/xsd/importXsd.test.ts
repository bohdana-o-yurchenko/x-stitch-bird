import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveColor } from "../../pattern/resolve";
import type { Pattern } from "../../pattern/types";
import { ALL_SYMBOLS } from "../../symbols/symbols";
import { importXsd, XsdFormatError } from "./importXsd";
import { looksLikeXsd, readXsd } from "./readXsd";

/*
 * Pattern Maker files are made here byte by byte, laid out as readXsd.ts reads them (real ones are other people's
 * designs, so they stay out of the repo). The grid is scrambled with a non-zero seed, as Pattern Maker does.
 */

interface Item {
  brand?: number;
  number: string;
  name?: string;
  color?: string;
  blend?: { brand: number; number: string; strands: number }[];
  bead?: boolean;
  strands?: Partial<Record<"full" | "half" | "quarter" | "back" | "knot" | "petite" | "special" | "straight", number>>;
  notes?: string[];
}
/** 10 bytes: halves/quarters flags, petite flags, half colours, TL BL TR BR colours, 2 unused. */
type Small = number[];
type Joint =
  | { kind: "back" | "straight"; x1: number; y1: number; x2: number; y2: number; pal: number }
  | { kind: "knot" | "bead"; x: number; y: number; pal: number }
  | { kind: "special"; x: number; y: number; pal: number; model: number };
interface Spec {
  w: number;
  h: number;
  count?: number;
  palette: Item[];
  /** Per cell: a palette index (full cross), null (empty) or a small-stitch record. */
  cells?: (number | null | Small)[];
  joints?: Joint[];
  /** Special-stitch models: lines in half-grid units. */
  models?: { x1: number; y1: number; x2: number; y2: number }[][];
  info?: Partial<Record<"title" | "author" | "company" | "copyright" | "notes", string>>;
  fabric?: string;
  defaults?: number[];
  /** Raw text bytes for the title (another code page). */
  titleBytes?: number[];
}

class Out {
  bytes: number[] = [];
  u8 = (v: number) => void this.bytes.push(v & 0xff);
  u16 = (v: number) => { this.u8(v); this.u8(v >> 8); };
  u32 = (v: number) => { this.u16(v & 0xffff); this.u16((v >>> 16) & 0xffff); };
  zeros = (n: number) => { for (let i = 0; i < n; i++) this.u8(0); };
  text = (s: string, length: number, raw?: number[]) => {
    const b = raw ?? [...new TextEncoder().encode(s)];
    for (let i = 0; i <= length; i++) this.u8(b[i] ?? 0);
  };
  color = (hex: string) => [0, 2, 4].forEach((i) => this.u8(parseInt(hex.slice(i, i + 2), 16)));
}

const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) | 0;

function xsd(s: Spec): Uint8Array {
  const o = new Out();
  o.u16(0x0510);
  o.zeros(4);
  [4, 4, 1, 0].forEach(o.u16);
  o.zeros(727);
  const cells = s.cells ?? [];
  const smalls = cells.filter((c): c is Small => Array.isArray(c));
  const joints = s.joints ?? [];
  o.u16(s.w); o.u16(s.h); o.u32(smalls.length); o.u16(joints.length); o.u16(s.count ?? 14); o.zeros(2 + 6);
  // palette
  o.u16(s.palette.length);
  for (const it of s.palette) {
    o.zeros(2); o.u8(it.brand ?? 0); o.text(it.number, 10); o.text(it.name ?? "", 40); o.color(it.color ?? "808080"); o.zeros(1);
    const blend = it.blend ?? [];
    o.u16(blend.length);
    for (const b of blend) { o.u8(b.brand); o.text(b.number, 10); }
    o.zeros((4 - blend.length) * 12);
    for (const b of blend) o.u8(b.strands);
    o.zeros(4 - blend.length);
    o.u32(it.bead ? 1 : 0); o.zeros(4 + 2);
  }
  o.zeros(s.palette.length * 2);
  for (const it of s.palette) for (let k = 0; k < 9; k++) {
    const b = [...new TextEncoder().encode(it.notes?.[k] ?? "")];
    o.u16(b.length); b.forEach(o.u8);
  }
  for (const it of s.palette) for (const k of ["full", "half", "quarter", "back", "knot", "petite", "special", "straight"] as const) o.u16(it.strands?.[k] ?? 0);
  o.zeros(240 * 10 * 2 + 240 * 4 + 240 * 10 * 4 + 240 * 53);
  o.zeros(s.palette.length * 12);
  o.zeros(33 + 20 + 33 + 34 + 120 + 120 + 20 + 56);
  o.text("White", 40); o.color(s.fabric ?? "FFFFFF"); o.zeros(65);
  o.text(s.info?.title ?? "", 40, s.titleBytes); o.text(s.info?.author ?? "", 40); o.text(s.info?.company ?? "", 40);
  o.text(s.info?.copyright ?? "", 200); o.text(s.info?.notes ?? "", 2048);
  o.zeros(6); o.text("Aida", 40); o.zeros(206);
  (s.defaults ?? [2, 2, 2, 1, 2, 2, 1]).forEach(o.u16);
  o.zeros(38 + 32 + 16412 + 512);

  // the grid: packed (a run of the same word becomes a count and the word), then scrambled
  let small = 0;
  const words = Array.from({ length: s.w * s.h }, (_, i) => {
    const c = cells[i];
    return c === undefined || c === null ? 15 << 24 : Array.isArray(c) ? (0x80000000 | (small++ << 16)) | 0 : c << 16;
  });
  const packed: number[] = [];
  for (let i = 0; i < words.length; ) {
    let j = i;
    while (j < words.length && words[j] === words[i]) j++;
    if (j - i > 1) packed.push(0x40000000 | ((j - i) << 16), words[i]!);
    else packed.push(words[i]!);
    i = j;
  }
  const seed = [0x12345678, 0x0badf00d, 0x7f00ff01, 0x00c0ffee];
  seed.forEach(o.u32);
  const byte = (v: number, i: number) => (v >>> (8 * i)) & 0xff;
  let key = ((((((seed[0]! << 8) | byte(seed[1]!, 1)) << 8) | byte(seed[2]!, 2)) << 8) | (seed[3]! & 0xff)) | 0;
  const turns = Array.from({ length: 16 }, (_, i) => ((seed[i >> 2]! >>> 0) >>> (i % 4)) % 32);
  let acc = seed[0]!, turn = 0;
  // an empty chunk, then the words in two
  o.u32(0);
  let mid = Math.ceil(packed.length / 2);
  if (packed[mid - 1]! & 0x40000000) mid++;
  for (const chunk of [packed.slice(0, mid), packed.slice(mid)].filter((c) => c.length)) {
    o.u32(chunk.length);
    for (const w of chunk) {
      o.u32(w ^ key ^ acc);
      key = rotl(key, turns[turn]!);
      acc = (acc + seed[1]!) | 0;
      turn = (turn + 1) % 16;
    }
  }
  for (const sm of smalls) for (let b = 0; b < 10; b++) o.u8(sm[b] ?? 0);

  const joint = (j: Joint) => {
    if (j.kind === "knot") { o.u16(1); o.zeros(2); o.u16(j.x * 2); o.u16(j.y * 2); o.zeros(4); o.u8(j.pal); o.zeros(1); }
    else if (j.kind === "back" || j.kind === "straight") { o.u16(j.kind === "back" ? 2 : 5); o.zeros(2); [j.x1, j.y1, j.x2, j.y2].forEach((v) => o.u16(v * 2)); o.u8(j.pal); o.zeros(1); }
    else if (j.kind === "bead") { o.u16(6); o.zeros(2); o.u16(j.x * 2); o.u16(j.y * 2); o.u8(j.pal); o.zeros(1 + 2); }
    else if (j.kind === "special") { o.u16(4); o.u16(j.model); o.u8(j.pal); o.zeros(4); o.u16(j.x * 2); o.u16(j.y * 2); o.zeros(12); }
  };
  o.zeros(2);
  o.u16(s.models?.length ?? 0);
  for (const m of s.models ?? []) {
    o.u16(4); o.zeros(2); "sps1".split("").forEach((c) => o.u8(c.charCodeAt(0))); o.zeros(512 + 2);
    o.zeros(10); o.u16(0x0510); o.u16(m.length);
    for (const l of m) joint({ kind: "back", x1: l.x1 / 2, y1: l.y1 / 2, x2: l.x2 / 2, y2: l.y2 / 2, pal: 0 });
    o.zeros(10); o.u16(0);
  }
  joints.forEach(joint);
  o.zeros(154);
  return new Uint8Array(o.bytes);
}

const load = (s: Spec, name?: string) => importXsd(xsd(s), ALL_SYMBOLS, { name });
const describeKey = (p: Pattern) => p.key.flatMap((e) => (e ? [`${e.t} ${e.st ?? ""} ${e.src} ${e.n ?? "-"}`.replace(/\s+/g, " ")] : []));

describe("Pattern Maker (.xsd) files", () => {
  it("are told by their first bytes", () => {
    expect(looksLikeXsd(xsd({ w: 1, h: 1, palette: [] }))).toBe(true);
    expect(looksLikeXsd(new TextEncoder().encode("<?xml"))).toBe(false);
  });

  it("read size, count, fabric, the pattern's info and the colours' notes", () => {
    const { pattern: p } = load({
      w: 3, h: 2, count: 18, fabric: "B78954", palette: [{ number: "310", notes: ["/ attach with 2 strands"] }], cells: [0],
      info: { title: "Spring", author: "Anna", company: "Mill Hill", copyright: "© 2001", notes: "Start in the middle." },
    });
    expect([p.w, p.h, p.count, p.fabric, p.name]).toEqual([3, 2, 18, "#B78954", "Spring"]);
    expect(p.meta).toMatchObject({ designer: "Anna", publisher: "Mill Hill", copyright: "© 2001" });
    expect(p.meta.instructions).toBe("Start in the middle.\n\n310: attach with 2 strands");
  });

  it("take the file's name when the pattern has none, and an odd count as 14", () => {
    expect(load({ w: 1, h: 1, count: 13, palette: [] }, "Stable Mates").pattern).toMatchObject({ name: "Stable Mates", count: 14 });
  });

  it("read text saved in the Cyrillic code page", () => {
    // "Лера" in Windows-1251
    expect(load({ w: 1, h: 1, palette: [], titleBytes: [0xcb, 0xe5, 0xf0, 0xe0] }).pattern.name).toBe("Лера");
  });

  it("unscramble the grid: full crosses, repeats and empty cells, row by row", () => {
    const cells = [0, 0, 0, 0, null, 1, null, null, 1, 1, 0, null];
    const { pattern: p } = load({ w: 4, h: 3, palette: [{ number: "310" }, { number: "BLANC" }], cells });
    const at = (i: number) => p.key[p.layers.stitches[i]!]?.src ?? null;
    expect(cells.map((_, i) => at(i))).toEqual(["dmc:310", "dmc:310", "dmc:310", "dmc:310", null, "dmc:White", null, null, "dmc:White", "dmc:White", "dmc:310", null]);
  });

  it("match brands: DMC, Anchor, Madeira, Mill Hill beads; blends of two; anything else as the pattern's own colour", () => {
    const { pattern: p, report } = load({
      w: 6, h: 1, cells: [0, 1, 2, 3, 4, 5],
      palette: [
        { number: "Ecru", strands: { full: 3 } },
        { brand: 1, number: "403" },
        { brand: 252, number: "120", blend: [{ brand: 0, number: "415", strands: 1 }, { brand: 0, number: "762", strands: 1 }] },
        { brand: 200, number: "02012", bead: true },
        { brand: 18, number: "032", name: "Pearl", color: "EEEEEE" },
        { brand: 2, number: "0703" },
      ],
    });
    const key = describeKey(p);
    expect(key[0]).toBe("thread full dmc:Ecru 3");
    expect(key[1]).toMatch(/^thread full anchor:403 2$/);
    expect(key[2]).toMatch(/^thread full blend:\S+ -$/);
    expect(p.blends[p.key[3]!.src]!.parts).toEqual([{ id: "dmc:415", n: 1 }, { id: "dmc:762", n: 1 }]);
    expect(key[3]).toBe("bead bead:02012 -");
    expect(p.layers.beads[3]).toBe(4);
    expect(resolveColor(p, p.key[5]!.src)).toMatchObject({ brand: "Kreinik Blending Filament", code: "032", hex: "#EEEEEE" });
    expect(key[5]).toMatch(/^thread full madeira:0?703 2$/);
    expect(report.unmatched).toBe(1);
  });

  it("read petites, quarters and halves — a half and a quarter of one colour as a three-quarter", () => {
    const { pattern: p, report } = load({
      w: 4, h: 1, palette: [{ number: "310" }, { number: "321", strands: { petite: 1 } }],
      cells: [
        [0, 0b1001, 0, 0, 1, 0, 0, 0],      // petites: top-left 321, bottom-right 310
        [0b10 | 0b100, 0, 0, 0, 0, 0, 0, 0], // half "/" and a top-left quarter, both 310: a three-quarter
        [0b1, 0, 1, 0, 0, 0, 0, 0],          // half "\" alone, 321
        [0b100000, 0, 0, 0, 0, 0, 0, 1],     // a bottom-right quarter, 321
      ],
    });
    const parts = (i: number) => (p.layers.partials.get(i) ?? []).map((s) => `${s.kind} ${s.corner} ${p.key[s.k]!.src} ${p.key[s.k]!.n}`);
    expect(parts(0)).toEqual(["petite 0 dmc:321 1", "petite 2 dmc:310 2"]);
    expect(parts(1)).toEqual(["threeQuarter 0 dmc:310 2"]);
    expect(p.key[p.layers.stitches[2]!]).toMatchObject({ st: "halfb", src: "dmc:321" });
    expect(parts(3)).toEqual(["quarter 2 dmc:321 2"]);
    expect(report.simplified).toBe(0);
  });

  it("read backstitch, straight and special stitches as lines with their own strands, knots, and beads in cells or on points", () => {
    const { pattern: p } = load({
      w: 10, h: 10,
      palette: [{ number: "501", strands: { back: 3, straight: 2 } }, { number: "Ecru", strands: { special: 4, knot: 1 } }, { brand: 202, number: "40123", bead: true }],
      models: [[{ x1: 0, y1: 0, x2: 4, y2: 4 }, { x1: 4, y1: 0, x2: 0, y2: 4 }]],
      joints: [
        { kind: "back", x1: 1, y1: 1, x2: 2.5, y2: 1, pal: 0 },
        { kind: "straight", x1: 3, y1: 3, x2: 4, y2: 4, pal: 0 },
        { kind: "special", x: 5, y: 5, pal: 1, model: 0 },
        { kind: "knot", x: 2, y: 2.5, pal: 1 },
        { kind: "bead", x: 6.5, y: 0.5, pal: 2 },
        { kind: "bead", x: 7, y: 1, pal: 2 },
        { kind: "back", x1: 9, y1: 9, x2: 12, y2: 9, pal: 0 }, // off the chart: dropped
      ],
    });
    const line = (i: number) => { const s = p.layers.segments[i]!; return `${s.x1},${s.y1}-${s.x2},${s.y2} ${p.key[s.k]!.src} ${p.key[s.k]!.n}`; };
    expect(p.layers.segments.map((_, i) => line(i))).toEqual(["1,1-2.5,1 dmc:501 3", "3,3-4,4 dmc:501 2", "5,5-7,7 dmc:Ecru 4", "7,5-5,7 dmc:Ecru 4"]);
    expect(p.key[p.layers.beads[6]!]).toMatchObject({ t: "bead", src: "bead:40123" });
    const knots = p.layers.knots.map((k) => `${k.x},${k.y} ${p.key[k.k]!.t} ${p.key[k.k]!.st ?? ""}`.trim());
    expect(knots).toEqual(["2,2.5 knot", "7,1 bead point"]);
  });

  it("refuse other files and damaged ones with a clear error", () => {
    expect(() => readXsd(new TextEncoder().encode("<chart/>"))).toThrow(XsdFormatError);
    const whole = xsd({ w: 2, h: 2, palette: [{ number: "310" }], cells: [0, 0, 0, 0] });
    expect(() => readXsd(whole.subarray(0, whole.length - 100))).not.toThrow();
    expect(() => readXsd(whole.subarray(0, 30000))).toThrow(XsdFormatError);
    expect(() => readXsd(whole.subarray(0, 3000))).toThrow(XsdFormatError);
  });
});

/** Other people's charts, on this computer only (tests/fixtures/private, not in the repository). */
const privateFile = (name: string) => new URL(`../../../../tests/fixtures/private/${name}`, import.meta.url);
describe("real Pattern Maker files (only where the files are) — counts checked against each file's PDF", () => {
  const open = (name: string) => importXsd(new Uint8Array(readFileSync(privateFile(name))), ALL_SYMBOLS, { name: "file" });
  const keyOf = (p: Pattern) => p.key.filter(Boolean);

  it.skipIf(!existsSync(privateFile("pattern-maker-rabbits.xsd")))("crosses and backstitch, a Cyrillic copyright line", () => {
    const { pattern: p, report } = open("pattern-maker-rabbits.xsd");
    expect([p.name, p.w, p.h, p.meta.copyright]).toEqual(["Rabbits Feed Time", 98, 76, "Лера - перенабор для Pattern Maker"]);
    expect(keyOf(p).filter((e) => e!.t === "thread")).toHaveLength(31);
    expect(keyOf(p).filter((e) => e!.t === "back").map((e) => `${e!.src} ${e!.n}`)).toEqual(["dmc:413 1", "dmc:White 1"]);
    expect(p.layers.stitches.filter(Boolean)).toHaveLength(3276);
    expect(p.layers.segments).toHaveLength(596);
    expect(report).toEqual({ simplified: 0, unmatched: 0 });
  });

  it.skipIf(!existsSync(privateFile("pattern-maker-stable-mates.xsd")))("blends and petites (four in each of 145 cells)", () => {
    const { pattern: p } = open("pattern-maker-stable-mates.xsd");
    expect(p.name).toBe("file");
    expect(Object.values(p.blends).map((b) => b.parts.map((x) => `${x.n}×${x.id}`).join("+")).sort()).toEqual(["1×dmc:415+1×dmc:762", "1×dmc:433+1×dmc:840", "1×dmc:644+1×dmc:739"]);
    expect([...p.layers.partials.values()].flat().filter((s) => s.kind === "petite")).toHaveLength(580);
  });

  it.skipIf(!existsSync(privateFile("pattern-maker-spring-lamb.xsd")))("Mill Hill beads in cells and on points, straight stitches and Smyrna crosses as lines", () => {
    const { pattern: p } = open("pattern-maker-spring-lamb.xsd");
    expect(p.layers.beads.filter(Boolean).length + p.layers.knots.length).toBe(852);
    // 190 backstitches, 700 straight stitches, 58 Smyrna crosses of four lines
    expect(p.layers.segments).toHaveLength(190 + 700 + 58 * 4);
    expect(keyOf(p).filter((e) => e!.t === "back").map((e) => `${e!.src} ${e!.n}`).sort()).toEqual(["dmc:3799 6", "dmc:501 2", "dmc:501 3", "dmc:Ecru 4"]);
    expect(p.meta.instructions).toContain("40123 Cream: Top Knot: 3 beads ecru 2 strands");
  });
});
