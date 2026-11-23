// SPDX-License-Identifier: GPL-3.0-or-later — ported from Embroiderly (© Nazar Antoniuk); see NOTICE.md
/*
 * Pattern Maker for Cross Stitch (HobbyWare, v4) `.xsd` files: a binary format with no published specification.
 *
 * The layout follows Embroiderly's reader (https://github.com/embroidery-space/embroiderly,
 * crates/embroiderly-parsers/src/pmaker/xsd.rs at commit 38b5f39, GPL-3.0-or-later) and the xsp-specs description
 * (https://github.com/embroidery-space/xsp-specs, pmaker/patterns/xsd.hexpat, MIT) — see NOTICE.md. The special
 * stitches (Smyrna crosses and the like: a model of lines placed on the chart) were worked out here from sample files.
 *
 * This reads what a chart needs and skips the rest (print, screen and machine-export settings).
 */

export class XsdFormatError extends Error {}

/** Little-endian reader over the file's bytes; reading past the end throws `XsdFormatError`. */
class Bytes {
  private readonly view: DataView;
  pos = 0;
  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  private need(n: number) {
    if (n < 0 || this.pos + n > this.bytes.length) throw new XsdFormatError("the file ends too soon");
  }
  skip(n: number) {
    this.need(n);
    this.pos += n;
  }
  u8() {
    this.need(1);
    return this.bytes[this.pos++]!;
  }
  u16() {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32() {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  i32() {
    this.need(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  slice(n: number) {
    this.need(n);
    const s = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
  /** A fixed-size, NUL-terminated string of up to `length` characters (plus the NUL). */
  text(length: number) {
    return decodeText(this.slice(length + 1));
  }
  /** Three bytes, RGB, as "RRGGBB". */
  color() {
    return Array.from(this.slice(3), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
}

const UTF8 = new TextDecoder("utf-8", { fatal: true });
const CP1251 = new TextDecoder("windows-1251");

/** Up to the first NUL: UTF-8 when it is (plain English is), else Windows Cyrillic — what Pattern Maker saved in Russia and Ukraine. */
function decodeText(raw: Uint8Array): string {
  const end = raw.indexOf(0);
  const bytes = end < 0 ? raw : raw.subarray(0, end);
  try {
    return UTF8.decode(bytes).trim();
  } catch {
    return CP1251.decode(bytes).trim();
  }
}

export const XSD_SIGNATURE = 0x0510;

/** Whether these bytes start like a Pattern Maker file. */
export const looksLikeXsd = (bytes: Uint8Array) => bytes.length > 2 && bytes[0] === 0x10 && bytes[1] === 0x05;

/** Strands per stitch kind; 0 = the pattern's default. */
export interface XsdStrands {
  full: number;
  half: number;
  quarter: number;
  back: number;
  knot: number;
  petite: number;
  special: number;
  straight: number;
}

export interface XsdBlendPart {
  brand: number;
  number: string;
  strands: number;
}

export interface XsdPaletteItem {
  /** Pattern Maker's brand id (`threadBrands.ts`). */
  brand: number;
  number: string;
  name: string;
  /** "RRGGBB". */
  color: string;
  blend: XsdBlendPart[];
  bead: boolean;
  strands: XsdStrands;
  /** The designer's note for this colour, per stitch kind ("ecru half cross st. 2 strands"), the non-empty ones. */
  notes: string[];
}

/** Quarter and petite corners as Pattern Maker stores them. */
export type XsdCorner = "tl" | "bl" | "tr" | "br";

export type XsdCell =
  | { kind: "full"; x: number; y: number; pal: number }
  /** `/` (bottom-left to top-right) or `\` across the cell. */
  | { kind: "half"; x: number; y: number; pal: number; dir: "/" | "\\" }
  | { kind: "quarter" | "petite"; x: number; y: number; pal: number; corner: XsdCorner };

/** Lines and points: coordinates in cells, on the half grid. */
export type XsdJoint =
  | { kind: "back" | "straight" | "special"; x1: number; y1: number; x2: number; y2: number; pal: number }
  | { kind: "knot" | "bead"; x: number; y: number; pal: number };

export interface XsdPattern {
  version: string;
  width: number;
  height: number;
  /** Stitches per inch, across. */
  count: number;
  palette: XsdPaletteItem[];
  info: { title: string; author: string; company: string; copyright: string; notes: string };
  fabric: { name: string; color: string; kind: string };
  defaults: XsdStrands;
  cells: XsdCell[];
  joints: XsdJoint[];
  /** Curves and other things read past but not taken in. */
  skipped: number;
}

/** Room for 240 colours is saved whatever the palette's size. */
const FORMAT_SLOTS = 240;
const BLEND_SLOTS = 4;
/** Full, half, quarter, back, knot, straight, special, petite, bead. */
const NOTE_KINDS = 9;
const COLOR_NUMBER = 10;
const COLOR_NAME = 40;
/** Too big to be a pattern: a damaged file. */
const MAX_CELLS = 4_000_000;

export function readXsd(data: Uint8Array): XsdPattern {
  const r = new Bytes(data);
  if (r.u16() !== XSD_SIGNATURE) throw new XsdFormatError("not a Pattern Maker v4 file");
  r.skip(4);
  const v = [r.u16(), r.u16(), r.u16(), r.u16()];
  const version = `${v[1]}.${v[0]}.${v[3]}.${v[2]}`;
  r.skip(727);
  const width = r.u16(), height = r.u16();
  if (!width || !height || width * height > MAX_CELLS) throw new XsdFormatError("no size");
  const smallCount = r.u32();
  const jointCount = r.u16();
  const count = r.u16();
  r.skip(2 + 6);

  const palette = readPalette(r);
  readFormats(r);
  r.skip(palette.length * 6 * 2); // symbols: codes in Pattern Maker's own symbol fonts, of no use here

  // screen and print settings
  r.text(32);
  r.skip(20);
  r.text(32);
  r.skip(6 + 10 + 2 * 2 + 2 * 4 + 4 + 2);
  r.text(119);
  r.text(119);
  r.skip(12 + 6 + 2);
  // grid
  r.skip(2 + 2 + 4 * 10 + 12);

  const fabricName = r.text(40), fabricColor = r.color();
  r.skip(65);
  const info = { title: r.text(40), author: r.text(40), company: r.text(40), copyright: r.text(200), notes: r.text(2048) };
  r.skip(6);
  const fabricKind = r.text(40);
  r.skip(206);

  const d = [r.u16(), r.u16(), r.u16(), r.u16(), r.u16(), r.u16(), r.u16()];
  const defaults: XsdStrands = { full: d[0]!, half: d[1]!, quarter: d[2]!, back: d[3]!, petite: d[4]!, special: d[5]!, straight: d[6]!, knot: 2 };
  r.skip(13 * 2 + 2 + 2 + 2 + 4 + 2); // display thickness, outline
  r.skip(32); // symbol settings
  r.skip(16412 + 512); // library, machine export

  const cells = readCells(r, width, height, smallCount);
  const models = readSpecialModels(r);
  const { joints, skipped } = readJoints(r, jointCount, models);
  return { version, width, height, count, palette, info, fabric: { name: fabricName, color: fabricColor, kind: fabricKind }, defaults, cells, joints, skipped };
}

function readPalette(r: Bytes): XsdPaletteItem[] {
  const size = r.u16();
  const palette: XsdPaletteItem[] = [];
  for (let i = 0; i < size; i++) {
    r.skip(2);
    const brand = r.u8(), number = r.text(COLOR_NUMBER), name = r.text(COLOR_NAME), color = r.color();
    r.skip(1);
    const blendCount = Math.min(r.u16(), BLEND_SLOTS);
    const blend: XsdBlendPart[] = [];
    for (let j = 0; j < blendCount; j++) blend.push({ brand: r.u8(), number: r.text(COLOR_NUMBER), strands: 0 });
    r.skip((BLEND_SLOTS - blendCount) * 12);
    for (const b of blend) b.strands = r.u8();
    r.skip(BLEND_SLOTS - blendCount);
    const bead = r.u32() === 1;
    r.skip(4 + 2); // bead length and width
    palette.push({ brand, number, name, color, blend, bead, strands: { full: 0, half: 0, quarter: 0, back: 0, knot: 0, petite: 0, special: 0, straight: 0 }, notes: [] });
  }
  r.skip(size * 2); // positions
  for (const item of palette) {
    for (let k = 0; k < NOTE_KINDS; k++) {
      // as the key prints it after the name ("Cream. / ecru half cross st."): without the slash
      const note = decodeText(r.slice(r.u16())).replace(/^\/\s*/, "").replace(/\s+/g, " ");
      if (note && !item.notes.includes(note)) item.notes.push(note);
    }
  }
  for (const item of palette) {
    const s = item.strands;
    [s.full, s.half, s.quarter, s.back, s.knot, s.petite, s.special, s.straight] = [r.u16(), r.u16(), r.u16(), r.u16(), r.u16(), r.u16(), r.u16(), r.u16()];
  }
  return palette;
}

/** Colours, line styles and fonts per palette item: how Pattern Maker draws them. Skipped. */
function readFormats(r: Bytes) {
  const block = (bytes: number) => r.skip(FORMAT_SLOTS * bytes);
  block(10); // symbols
  block(10); // backstitch
  r.skip(FORMAT_SLOTS * 4);
  block(10); // special
  block(10); // straight
  block(10); // knots
  block(10); // beads
  block(53); // fonts
}

/*
 * The grid, one 32-bit word per cell, row by row — scrambled and run-length packed. Four numbers start it; from them
 * a key and 16 rotations are made. Then come chunks, each a length and that many words; a word XORed with the key and
 * the first number gives the cell; after each word the key turns and the first number grows by the second.
 * Unpacked: a word with bit 30 set says how many times (bits 16–29) the next word repeats.
 *
 * A cell's top byte: 15 empty, 0 a full cross (palette index in the byte below it); with bit 31 set its parts are in
 * the list of small-stitch records after the grid, at the index in bits 16–30.
 */
function readCells(r: Bytes, width: number, height: number, smallCount: number): XsdCell[] {
  const total = width * height;
  const words = unscramble(r, total);
  const small: Uint8Array[] = [];
  for (let i = 0; i < smallCount; i++) small.push(r.slice(10));

  const cells: XsdCell[] = [];
  for (let i = 0; i < total; i++) {
    const w = words[i]!, top = (w >>> 24) & 0xff;
    if (top === 15) continue;
    const x = i % width, y = Math.floor(i / width);
    if (top === 0) {
      cells.push({ kind: "full", x, y, pal: (w >>> 16) & 0xff });
      continue;
    }
    const s = small[(w >>> 16) & 0x7fff];
    if (!s) continue;
    // byte 1: petites by corner; byte 0: halves and quarters. Bytes 4–7: the colour of the TL, BL, TR, BR part.
    const corners: XsdCorner[] = ["tl", "bl", "tr", "br"];
    corners.forEach((corner, c) => {
      if (s[1]! & (1 << c)) cells.push({ kind: "petite", x, y, pal: s[4 + c]!, corner });
    });
    if (s[0]! & 1) cells.push({ kind: "half", x, y, pal: s[2]!, dir: "\\" });
    if (s[0]! & 2) cells.push({ kind: "half", x, y, pal: s[3]!, dir: "/" });
    corners.forEach((corner, c) => {
      if (s[0]! & (4 << c)) cells.push({ kind: "quarter", x, y, pal: s[4 + c]!, corner });
    });
  }
  return cells;
}

const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) | 0;

/** The grid's words, unscrambled and unpacked (see above). */
function unscramble(r: Bytes, total: number): Int32Array {
  const seed = [r.i32(), r.i32(), r.i32(), r.i32()] as [number, number, number, number];
  const byte = (v: number, i: number) => (v >>> (8 * i)) & 0xff;
  let key = ((((((seed[0] << 8) | byte(seed[1], 1)) << 8) | byte(seed[2], 2)) << 8) | (seed[3] & 0xff)) | 0;
  const turns = Array.from({ length: 16 }, (_, i) => ((seed[i >> 2]! >>> 0) >>> (i % 4)) % 32);
  let acc = seed[0], turn = 0, n = 0;
  const out = new Int32Array(total);
  while (n < total) {
    const length = r.u32();
    if (!length) continue;
    if (length > (total - n) * 2 + 2) throw new XsdFormatError("damaged chart");
    const chunk = new Int32Array(length);
    for (let i = 0; i < length; i++) {
      chunk[i] = r.i32() ^ key ^ acc;
      key = rotl(key, turns[turn]!);
      acc = (acc + seed[1]) | 0;
      turn = (turn + 1) % 16;
    }
    for (let i = 0; i < length && n < total; i++) {
      let times = 1;
      if (chunk[i]! & 0x40000000) {
        times = (chunk[i]! & 0x3fffffff) >> 16;
        i++;
      }
      for (; times > 0 && n < total; times--) out[n++] = chunk[i] ?? 0;
    }
  }
  return out;
}

/** A special stitch's drawing: its lines, in cells from the stitch's top-left. */
type Model = { x1: number; y1: number; x2: number; y2: number }[];

function readSpecialModels(r: Bytes): Model[] {
  r.skip(2);
  const count = r.u16();
  const models: Model[] = [];
  for (let m = 0; m < count; m++) {
    const model: Model = [];
    models.push(model);
    if (r.u16() !== 4) continue;
    r.skip(2);
    if (String.fromCharCode(...r.slice(4)) !== "sps1") continue;
    r.skip(512 + 2); // its name
    for (let part = 0; part < 3; part++) {
      r.skip(10);
      if (r.u16() !== XSD_SIGNATURE) break;
      const n = r.u16();
      for (const j of readJoints(r, n, []).joints) if ("x1" in j) model.push({ x1: j.x1, y1: j.y1, x2: j.x2, y2: j.y2 });
    }
  }
  return models;
}

/** Backstitches, straight stitches, knots, beads and special stitches (as their lines). */
function readJoints(r: Bytes, count: number, models: Model[]): { joints: XsdJoint[]; skipped: number } {
  const joints: XsdJoint[] = [];
  let skipped = 0;
  const half = () => r.u16() / 2;
  for (let i = 0; i < count; i++) {
    const kind = r.u16();
    if (kind === 1) {
      r.skip(2);
      const x = half(), y = half();
      r.skip(4);
      joints.push({ kind: "knot", x, y, pal: r.u8() });
      r.skip(1);
    } else if (kind === 2 || kind === 5) {
      r.skip(2);
      const x1 = half(), y1 = half(), x2 = half(), y2 = half();
      joints.push({ kind: kind === 2 ? "back" : "straight", x1, y1, x2, y2, pal: r.u8() });
      r.skip(1);
    } else if (kind === 3) {
      // a curve: its points, skipped
      r.skip(3);
      r.skip(r.u16() * 4);
      skipped++;
    } else if (kind === 4) {
      // a special stitch: model (bytes 0–1), colour (2), top-left (7–10, half grid); the rest unknown
      const b = r.slice(23), at = (o: number) => (b[o]! | (b[o + 1]! << 8)) / 2;
      const model = models[b[0]! | (b[1]! << 8)] ?? (models.length === 1 ? models[0] : undefined);
      const x = at(7), y = at(9), pal = b[2]!;
      if (!model?.length) skipped++;
      else for (const l of model) joints.push({ kind: "special", x1: x + l.x1, y1: y + l.y1, x2: x + l.x2, y2: y + l.y2, pal });
    } else if (kind === 6) {
      r.skip(2);
      const x = half(), y = half();
      joints.push({ kind: "bead", x, y, pal: r.u8() });
      r.skip(1 + 2); // rotation
    } else throw new XsdFormatError(`unknown stitch kind ${kind}`);
  }
  return { joints, skipped };
}
