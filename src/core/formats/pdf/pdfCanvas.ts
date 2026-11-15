import { num, rgb, type PdfPage } from "./pdfWriter";

/**
 * The part of a 2D canvas context that drawing helpers such as the backstitch line styles use. `PdfCanvas` writes
 * those calls into a PDF page, so the PDF draws exactly what the screen draws (SPEC §15.10b).
 */
export interface CanvasLike {
  lineWidth: number;
  lineCap: "butt" | "round" | "square";
  lineJoin: "miter" | "round" | "bevel";
  strokeStyle: string;
  fillStyle: string;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(a: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(cx: number, cy: number, r: number, a0: number, a1: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  setLineDash(d: number[]): void;
}

const CAP = { butt: 0, round: 1, square: 2 }, JOIN = { miter: 0, round: 1, bevel: 2 };
/** "#RRGGBB" / "#RGB" only; anything else (CSS names, rgba) becomes black. */
const colour = (c: string) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? rgb(c) : "0 0 0");

interface State {
  lineWidth: number;
  lineCap: CanvasLike["lineCap"];
  lineJoin: CanvasLike["lineJoin"];
  strokeStyle: string;
  fillStyle: string;
}

/** Canvas calls → PDF operators on `page`, in the page's top-left coordinates. Call `end()` when done. */
export class PdfCanvas implements CanvasLike {
  private s: State = { lineWidth: 1, lineCap: "butt", lineJoin: "miter", strokeStyle: "#000000", fillStyle: "#000000" };
  private stack: State[] = [];
  private path: string[] = [];

  constructor(private page: PdfPage) {
    // flip the y axis once, so all drawing below uses the canvas's own top-left coordinates
    page.ops.push(`q 1 0 0 -1 0 ${num(page.height)} cm 1 w 0 J 0 j 0 0 0 RG 0 0 0 rg`);
  }

  end() {
    this.page.ops.push("Q");
  }

  get lineWidth() { return this.s.lineWidth; }
  set lineWidth(v: number) { this.s.lineWidth = v; this.page.ops.push(`${num(v)} w`); }
  get lineCap() { return this.s.lineCap; }
  set lineCap(v: CanvasLike["lineCap"]) { this.s.lineCap = v; this.page.ops.push(`${CAP[v]} J`); }
  get lineJoin() { return this.s.lineJoin; }
  set lineJoin(v: CanvasLike["lineJoin"]) { this.s.lineJoin = v; this.page.ops.push(`${JOIN[v]} j`); }
  get strokeStyle() { return this.s.strokeStyle; }
  set strokeStyle(v: string) { this.s.strokeStyle = v; this.page.ops.push(`${colour(v)} RG`); }
  get fillStyle() { return this.s.fillStyle; }
  set fillStyle(v: string) { this.s.fillStyle = v; this.page.ops.push(`${colour(v)} rg`); }

  save() {
    this.stack.push({ ...this.s });
    this.page.ops.push("q");
  }
  restore() {
    this.s = this.stack.pop() ?? this.s;
    this.page.ops.push("Q");
  }
  translate(x: number, y: number) {
    this.page.ops.push(`1 0 0 1 ${num(x)} ${num(y)} cm`);
  }
  rotate(a: number) {
    const c = Math.cos(a), s = Math.sin(a), f = (v: number) => String(Math.round(v * 1e5) / 1e5);
    this.page.ops.push(`${f(c)} ${f(s)} ${f(-s)} ${f(c)} 0 0 cm`);
  }
  beginPath() {
    this.path = [];
  }
  moveTo(x: number, y: number) {
    this.path.push(`${num(x)} ${num(y)} m`);
  }
  lineTo(x: number, y: number) {
    this.path.push(`${num(x)} ${num(y)} l`);
  }
  /** Clockwise arcs (as the line styles use them), in quarter-turn Bézier pieces. */
  arc(cx: number, cy: number, r: number, a0: number, a1: number) {
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2))), step = (a1 - a0) / n, k = (4 / 3) * Math.tan(step / 4);
    const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
    this.path.push(`${num(p(a0)[0])} ${num(p(a0)[1])} ${this.path.length ? "l" : "m"}`);
    for (let i = 0; i < n; i++) {
      const a = a0 + i * step, b = a + step, [ax, ay] = p(a), [bx, by] = p(b);
      this.path.push(`${num(ax - k * r * Math.sin(a))} ${num(ay + k * r * Math.cos(a))} ${num(bx + k * r * Math.sin(b))} ${num(by - k * r * Math.cos(b))} ${num(bx)} ${num(by)} c`);
    }
  }
  closePath() {
    this.path.push("h");
  }
  stroke() {
    if (this.path.length) this.page.ops.push(`${this.path.join(" ")} S`);
  }
  fill() {
    if (this.path.length) this.page.ops.push(`${this.path.join(" ")} f`);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.page.ops.push(`${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);
  }
  setLineDash(d: number[]) {
    this.page.ops.push(`[${d.map(num).join(" ")}] 0 d`);
  }
}
