/*
 * What a PDF page draws, as plain data (SPEC §15.47): the reader of other apps' charts works on this, not on the PDF.
 * Points, the origin at the page's top-left corner, y going down.
 */

/** One character drawn: its box (`x`, `y` top-left, `w` its advance, `h` its size), what it is, its ink. */
export interface Glyph {
  /** The character (from the font's own mapping); a key of the font's glyph when it has none. */
  ch: string;
  font: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** "#rrggbb"; with `alpha` below 1 when drawn see-through. */
  ink: string;
  alpha: number;
  /** Upright (false: turned, as row numbers often are). */
  upright: boolean;
}

/** A small picture drawn in place — some apps stamp each chart symbol as one. `key`: the same pixels, the same key. */
export interface Stamp {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
}

/** A straight stroke. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  ink: string;
}

/** A filled rectangle, upright (cells filled with their thread's colour, among others). */
export interface FillRect {
  x: number;
  y: number;
  w: number;
  h: number;
  ink: string;
}

/** Characters drawn one after another, as one word or number. */
export interface Word {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  upright: boolean;
  /** Indices into the page's glyphs. */
  glyphs: number[];
}

export interface PageContent {
  w: number;
  h: number;
  glyphs: Glyph[];
  stamps: Stamp[];
  segments: Segment[];
  rects: FillRect[];
  words: Word[];
}

export interface PdfContent {
  title: string;
  pages: PageContent[];
}

export const centre = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
