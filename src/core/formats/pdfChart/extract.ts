import type { FillRect, Glyph, PageContent, Segment, Stamp, Word } from "./content";

/*
 * pdf.js → what a page draws (SPEC §15.47): every character with its box, every picture stamped, every straight
 * stroke, every filled upright rectangle. Walks the page's operator list the way pdf.js draws it, keeping the
 * transformation, text and colour state. pdf.js itself is passed in (the app's in the browser, the Node build in
 * tests), so nothing here loads it.
 */

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const mul = (a: Matrix, b: readonly number[]): Matrix => [
  a[0] * b[0]! + a[2] * b[1]!, a[1] * b[0]! + a[3] * b[1]!, a[0] * b[2]! + a[2] * b[3]!, a[1] * b[2]! + a[3] * b[3]!,
  a[0] * b[4]! + a[2] * b[5]! + a[4], a[1] * b[4]! + a[3] * b[5]! + a[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** The parts of pdf.js used here. */
export interface PdfJsLib {
  OPS: Record<string, number>;
}
interface PdfGlyph {
  unicode?: string;
  fontChar?: string;
  width?: number;
  isSpace?: boolean;
}
interface ImageObject {
  width: number;
  height: number;
  data?: Uint8Array | Uint8ClampedArray;
  bitmap?: unknown;
}
interface ObjStore {
  has(id: string): boolean;
  get(id: string, callback?: (v: unknown) => void): unknown;
}
export interface PdfPageLike {
  getViewport(o: { scale: number }): { width: number; height: number; transform: number[] };
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  getTextContent(): Promise<{ styles: Record<string, { ascent?: number; descent?: number }> }>;
  objs: ObjStore;
  commonObjs: ObjStore;
}

export interface ExtractOptions {
  /** Pixels of a picture pdf.js handed over as a bitmap (in the browser): RGBA, row by row. */
  readBitmap?: (bitmap: unknown, w: number, h: number) => Uint8ClampedArray | null;
}

/** FNV-1a over the bytes: the same pixels, the same key. */
function hashBytes(data: ArrayLike<number>, seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i]!, 0x01000193);
  return (h >>> 0).toString(36);
}

/** An object pdf.js resolved for the page — at once when it has it; given up on after a while. */
function objectOf(page: PdfPageLike, id: string): Promise<ImageObject | null> {
  const store = id.startsWith("g_") ? page.commonObjs : page.objs;
  if (store.has(id)) return Promise.resolve(store.get(id) as ImageObject);
  return Promise.race([
    new Promise<ImageObject | null>((done) => store.get(id, (v) => done(v as ImageObject))),
    new Promise<null>((done) => setTimeout(() => done(null), 5000)),
  ]);
}

interface TextState {
  font: string;
  size: number;
  tm: Matrix;
  x: number;
  y: number;
  lx: number;
  ly: number;
  leading: number;
  charSpacing: number;
  wordSpacing: number;
  hScale: number;
  rise: number;
  mode: number;
}
interface State {
  ctm: Matrix;
  fill: string;
  stroke: string;
  lineWidth: number;
  alpha: number;
  text: TextState;
}

const freshText = (): TextState => ({ font: "", size: 0, tm: IDENTITY, x: 0, y: 0, lx: 0, ly: 0, leading: 0, charSpacing: 0, wordSpacing: 0, hScale: 1, rise: 0, mode: 0 });

/** Path-building codes in a `constructPath` (pdf.js DrawOPS). */
const MOVE = 0, LINE = 1, CURVE = 2, QUAD = 3, CLOSE = 4;

export async function extractPage(page: PdfPageLike, lib: PdfJsLib, o: ExtractOptions = {}): Promise<PageContent> {
  const OPS = lib.OPS;
  const viewport = page.getViewport({ scale: 1 });
  const base = viewport.transform as unknown as Matrix;
  const [ops, text] = await Promise.all([page.getOperatorList(), page.getTextContent().catch(() => ({ styles: {} as Record<string, { ascent?: number; descent?: number }> }))]);
  const glyphs: Glyph[] = [], stamps: Stamp[] = [], segments: Segment[] = [], rects: FillRect[] = [];
  /** Glyph runs as drawn, for words: [start, end) into `glyphs`, broken at spaces. */
  const runs: number[][] = [];
  /** Each glyph's baseline: where it starts and where the next one would — for telling words apart. */
  const baselines: [number, number, number, number][] = [];
  const imageKeys = new Map<string, string | null>();
  let st: State = { ctm: base, fill: "#000000", stroke: "#000000", lineWidth: 1, alpha: 1, text: freshText() };
  const stack: State[] = [];
  const fontMatrix = new Map<string, number>();
  const fontOf = (id: string) => {
    if (!fontMatrix.has(id)) {
      const f = page.commonObjs.has(id) ? (page.commonObjs.get(id) as { fontMatrix?: number[] } | null) : null;
      fontMatrix.set(id, f?.fontMatrix?.[0] ?? 0.001);
    }
    return fontMatrix.get(id)!;
  };

  const stamp = (key: string, m: Matrix) => {
    const corners = [apply(m, 0, 0), apply(m, 1, 0), apply(m, 0, 1), apply(m, 1, 1)];
    const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    stamps.push({ key, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, alpha: st.alpha });
  };
  const keyOfImage = async (id: string | null, img: ImageObject | null, mask: boolean): Promise<string | null> => {
    if (id && imageKeys.has(id)) return imageKeys.get(id)!;
    let key: string | null = null;
    if (img) {
      const data = img.data ?? (img.bitmap && o.readBitmap ? o.readBitmap(img.bitmap, img.width, img.height) : null);
      if (data) key = (mask ? "m" : "i") + hashBytes(data, `${img.width}x${img.height}`);
    }
    if (id) imageKeys.set(id, key);
    return key;
  };

  const showText = (items: (PdfGlyph | number)[]) => {
    const t = st.text, scale = fontOf(t.font), style = text.styles[t.font] ?? {};
    const ascent = style.ascent || 0.8, descent = style.descent ?? -0.2;
    const m = mul(st.ctm, t.tm);
    let x = 0, run: number[] = [];
    const close = () => {
      if (run.length) runs.push(run);
      run = [];
    };
    for (const g of items) {
      if (typeof g === "number") {
        x -= (g * t.size) / 1000;
        continue;
      }
      const adv = (g.width ?? 0) * t.size * scale;
      const ch = g.unicode && g.unicode !== "\u0000" ? g.unicode : g.fontChar ? `${t.font}#${g.fontChar}` : "";
      if (!ch.trim() || g.isSpace) close();
      // drawn, not invisible (a scan's searchable text layer is invisible)
      else if (t.mode !== 3 && t.mode !== 7) {
        const left = t.x + x * t.hScale, right = t.x + (x + adv) * t.hScale, lo = t.y + t.rise + descent * t.size, hi = t.y + t.rise + ascent * t.size;
        const pts = [apply(m, left, lo), apply(m, right, lo), apply(m, left, hi), apply(m, right, hi)];
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const gx = Math.min(...xs), gy = Math.min(...ys);
        // upright: the text's own x-axis runs left to right on the page
        const upright = Math.abs(m[1]) < Math.abs(m[0]) && m[0] > 0;
        const [ox, oy] = apply(m, left, t.y), [ex, ey] = apply(m, right, t.y);
        const along = Math.hypot(ex - ox, ey - oy), across = Math.hypot(m[2] * t.size, m[3] * t.size);
        glyphs.push({ ch, font: t.font, x: gx, y: gy, w: upright ? along : Math.max(...xs) - gx, h: upright ? across : Math.max(...ys) - gy, ink: st.fill, alpha: st.alpha, upright });
        baselines.push([ox, oy, ex, ey]);
        run.push(glyphs.length - 1);
      } else close();
      x += adv + t.charSpacing + (g.isSpace ? t.wordSpacing : 0);
    }
    close();
    t.x += x * t.hScale;
  };

  const path = (op: number, data: ArrayLike<number>) => {
    const isFill = op === OPS.fill || op === OPS.eoFill || op === OPS.fillStroke || op === OPS.eoFillStroke || op === OPS.closeFillStroke || op === OPS.closeEOFillStroke;
    const isStroke = op === OPS.stroke || op === OPS.closeStroke || op === OPS.fillStroke || op === OPS.eoFillStroke || op === OPS.closeFillStroke || op === OPS.closeEOFillStroke;
    if (!isFill && !isStroke) return;
    const width = st.lineWidth * Math.sqrt(Math.abs(st.ctm[0] * st.ctm[3] - st.ctm[1] * st.ctm[2]));
    let start: [number, number] | null = null, at: [number, number] | null = null, sub: [number, number][] = [], curved = false;
    const finish = (closed: boolean) => {
      if (isFill && !curved && sub.length >= 4 && sub.length <= 5) {
        const xs = [...new Set(sub.map((p) => Math.round(p[0] * 100)))], ys = [...new Set(sub.map((p) => Math.round(p[1] * 100)))];
        if (xs.length === 2 && ys.length === 2) {
          const x = Math.min(...xs) / 100, y = Math.min(...ys) / 100;
          rects.push({ x, y, w: Math.max(...xs) / 100 - x, h: Math.max(...ys) / 100 - y, ink: st.fill });
        }
      }
      if (isStroke && closed && start && at && (at[0] !== start[0] || at[1] !== start[1])) segments.push({ x1: at[0], y1: at[1], x2: start[0], y2: start[1], width, ink: st.stroke });
      sub = [];
      curved = false;
    };
    for (let i = 0; i < data.length; ) {
      const c = data[i++];
      if (c === MOVE) {
        finish(false);
        at = start = apply(st.ctm, data[i]!, data[i + 1]!);
        sub = [at];
        i += 2;
      } else if (c === LINE) {
        const p = apply(st.ctm, data[i]!, data[i + 1]!);
        if (isStroke && at) segments.push({ x1: at[0], y1: at[1], x2: p[0], y2: p[1], width, ink: st.stroke });
        at = p;
        sub.push(p);
        i += 2;
      } else if (c === CURVE || c === QUAD) {
        const n = c === CURVE ? 6 : 4;
        at = apply(st.ctm, data[i + n - 2]!, data[i + n - 1]!);
        curved = true;
        i += n;
      } else if (c === CLOSE) {
        finish(true);
        at = start;
      } else break;
    }
    finish(false);
  };

  for (let i = 0; i < ops.fnArray.length; i++) {
    const f = ops.fnArray[i]!, a = (ops.argsArray[i] ?? []) as unknown[];
    switch (f) {
      case OPS.save:
        stack.push({ ...st, text: { ...st.text } });
        break;
      case OPS.restore: {
        const back = stack.pop();
        // the text matrix isn't part of the saved state
        if (back) st = { ...back, text: { ...back.text, tm: st.text.tm, x: st.text.x, y: st.text.y, lx: st.text.lx, ly: st.text.ly } };
        break;
      }
      case OPS.transform:
        st.ctm = mul(st.ctm, a as number[]);
        break;
      case OPS.paintFormXObjectBegin:
        stack.push({ ...st, text: { ...st.text } });
        if (Array.isArray(a[0]) || ArrayBuffer.isView(a[0])) st.ctm = mul(st.ctm, Array.from(a[0] as number[]));
        break;
      case OPS.paintFormXObjectEnd:
        st = stack.pop() ?? st;
        break;
      case OPS.setFillRGBColor:
        st.fill = String(a[0]);
        break;
      case OPS.setStrokeRGBColor:
        st.stroke = String(a[0]);
        break;
      case OPS.setLineWidth:
        st.lineWidth = Number(a[0]);
        break;
      case OPS.setGState:
        for (const [k, v] of (a[0] as [string, unknown][]) ?? []) if (k === "ca") st.alpha = Number(v);
        break;
      case OPS.beginText:
        st.text = { ...st.text, tm: IDENTITY, x: 0, y: 0, lx: 0, ly: 0 };
        break;
      case OPS.setFont:
        st.text.font = String(a[0]);
        st.text.size = Number(a[1]);
        break;
      case OPS.setTextMatrix: {
        const m = Array.isArray(a[0]) || ArrayBuffer.isView(a[0]) ? Array.from(a[0] as number[]) : (a as number[]);
        st.text = { ...st.text, tm: m.slice(0, 6) as Matrix, x: 0, y: 0, lx: 0, ly: 0 };
        break;
      }
      case OPS.moveText:
        st.text.x = st.text.lx += Number(a[0]);
        st.text.y = st.text.ly += Number(a[1]);
        break;
      case OPS.setLeadingMoveText:
        st.text.leading = -Number(a[1]);
        st.text.x = st.text.lx += Number(a[0]);
        st.text.y = st.text.ly += Number(a[1]);
        break;
      case OPS.setLeading:
        st.text.leading = -Number(a[0]);
        break;
      case OPS.nextLine:
        st.text.x = st.text.lx;
        st.text.y = st.text.ly += st.text.leading;
        break;
      case OPS.setCharSpacing:
        st.text.charSpacing = Number(a[0]);
        break;
      case OPS.setWordSpacing:
        st.text.wordSpacing = Number(a[0]);
        break;
      case OPS.setHScale:
        st.text.hScale = Number(a[0]) / 100;
        break;
      case OPS.setTextRise:
        st.text.rise = Number(a[0]);
        break;
      case OPS.setTextRenderingMode:
        st.text.mode = Number(a[0]);
        break;
      case OPS.showText:
      case OPS.showSpacedText:
        showText(a[0] as (PdfGlyph | number)[]);
        break;
      case OPS.nextLineShowText:
        st.text.x = st.text.lx;
        st.text.y = st.text.ly += st.text.leading;
        showText(a[0] as (PdfGlyph | number)[]);
        break;
      case OPS.nextLineSetSpacingShowText:
        st.text.wordSpacing = Number(a[0]);
        st.text.charSpacing = Number(a[1]);
        st.text.x = st.text.lx;
        st.text.y = st.text.ly += st.text.leading;
        showText(a[2] as (PdfGlyph | number)[]);
        break;
      case OPS.constructPath:
        path(Number(a[0]), (a[1] as ArrayLike<number>[] | undefined)?.[0] ?? []);
        break;
      case OPS.paintImageXObject: {
        const id = String(a[0]);
        const key = await keyOfImage(id, imageKeys.has(id) ? null : await objectOf(page, id), false);
        if (key) stamp(key, st.ctm);
        break;
      }
      case OPS.paintImageXObjectRepeat: {
        const id = String(a[0]), [sx, sy, positions] = [Number(a[1]), Number(a[2]), a[3] as number[]];
        const key = await keyOfImage(id, imageKeys.has(id) ? null : await objectOf(page, id), false);
        if (key) for (let j = 0; j < positions.length; j += 2) stamp(key, mul(st.ctm, [sx, 0, 0, sy, positions[j]!, positions[j + 1]!]));
        break;
      }
      case OPS.paintInlineImageXObject:
        {
          const key = await keyOfImage(null, a[0] as ImageObject, false);
          if (key) stamp(key, st.ctm);
        }
        break;
      case OPS.paintImageMaskXObject:
        {
          const key = await keyOfImage(null, a[0] as ImageObject, true);
          if (key) stamp(key, st.ctm);
        }
        break;
      case OPS.paintImageMaskXObjectRepeat: {
        const key = await keyOfImage(null, a[0] as ImageObject, true), [sx, kx, ky, sy, positions] = [Number(a[1]), Number(a[2]), Number(a[3]), Number(a[4]), a[5] as number[]];
        if (key) for (let j = 0; j < positions.length; j += 2) stamp(key, mul(st.ctm, [sx, kx, ky, sy, positions[j]!, positions[j + 1]!]));
        break;
      }
    }
  }

  return { w: viewport.width, h: viewport.height, glyphs, stamps, segments, rects, words: wordsOf(glyphs, runs, baselines) };
}

/** Runs of glyphs that follow on from each other (the next one starting where the last ended) as words. */
function wordsOf(glyphs: Glyph[], runs: number[][], baselines: [number, number, number, number][]): Word[] {
  const words: Word[] = [];
  for (const run of runs) {
    let cur: number[] = [];
    const flush = () => {
      if (!cur.length) return;
      const gs = cur.map((i) => glyphs[i]!), x = Math.min(...gs.map((g) => g.x)), y = Math.min(...gs.map((g) => g.y));
      words.push({ text: gs.map((g) => g.ch).join(""), x, y, w: Math.max(...gs.map((g) => g.x + g.w)) - x, h: Math.max(...gs.map((g) => g.y + g.h)) - y, upright: gs[0]!.upright, glyphs: cur });
      cur = [];
    };
    for (const i of run) {
      const last = cur[cur.length - 1];
      if (last !== undefined) {
        const [, , ex, ey] = baselines[last]!, [ox, oy] = baselines[i]!, g = glyphs[i]!;
        // more than a third of the letter's size from where the last one ended: the next word, though no space was drawn
        if (g.upright !== glyphs[last]!.upright || Math.hypot(ox - ex, oy - ey) > (g.upright ? g.h : g.w) / 3) flush();
      }
      cur.push(i);
    }
    flush();
  }
  return words;
}
