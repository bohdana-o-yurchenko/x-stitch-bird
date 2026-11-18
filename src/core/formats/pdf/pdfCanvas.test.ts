import { describe, expect, it } from "vitest";
import { PdfCanvas } from "./pdfCanvas";
import { PdfPage } from "./pdfWriter";

/* Canvas calls as PDF operators: the printed chart draws what the screen draws (SPEC §15.10b). */
function canvas() {
  const page = new PdfPage(100, 200), g = new PdfCanvas(page);
  return { page, g, ops: () => page.ops.slice(1) };
}

describe("PdfCanvas", () => {
  it("flips the page once so drawing uses the canvas's top-left coordinates, and closes with Q", () => {
    const { page, g } = canvas();
    expect(page.ops[0]).toBe("q 1 0 0 -1 0 200 cm 1 w 0 J 0 j 0 0 0 RG 0 0 0 rg");
    g.end();
    expect(page.ops.at(-1)).toBe("Q");
  });

  it("colours: #RRGGBB and #RGB are used; names, rgba and nonsense are black rather than broken operators", () => {
    const { g, ops } = canvas();
    g.strokeStyle = "#ff0000";
    g.fillStyle = "#0f0";
    g.strokeStyle = "red";
    g.fillStyle = "rgba(1,2,3,0.5)";
    g.strokeStyle = "#12345";
    expect(ops()).toEqual(["1 0 0 RG", "0 1 0 rg", "0 0 0 RG", "0 0 0 rg", "0 0 0 RG"]);
    expect(g.strokeStyle).toBe("#12345");
  });

  it("line width, cap, join and dashes are written, and read back", () => {
    const { g, ops } = canvas();
    g.lineWidth = 2.5;
    g.lineCap = "round";
    g.lineJoin = "bevel";
    g.setLineDash([3, 1.5]);
    g.setLineDash([]);
    expect(ops()).toEqual(["2.5 w", "1 J", "2 j", "[3 1.5] 0 d", "[] 0 d"]);
    expect([g.lineWidth, g.lineCap, g.lineJoin]).toEqual([2.5, "round", "bevel"]);
  });

  it("save and restore bring back the style, and a restore with nothing saved changes nothing", () => {
    const { g } = canvas();
    g.lineWidth = 4;
    g.save();
    g.lineWidth = 9;
    g.fillStyle = "#fff";
    g.restore();
    expect(g.lineWidth).toBe(4);
    expect(g.fillStyle).toBe("#000000");
    g.restore();
    expect(g.lineWidth).toBe(4);
  });

  it("paths are written whole when stroked or filled, and a new path starts empty", () => {
    const { g, ops } = canvas();
    g.beginPath();
    g.moveTo(1, 2);
    g.lineTo(3, 4);
    g.closePath();
    g.stroke();
    g.fill();
    g.beginPath();
    g.stroke();
    g.fill();
    expect(ops()).toEqual(["1 2 m 3 4 l h S", "1 2 m 3 4 l h f"]);
  });

  it("an arc becomes quarter-turn curves that end where the arc ends; a small one is a single curve", () => {
    const { g, ops } = canvas();
    g.beginPath();
    g.arc(0, 0, 10, 0, Math.PI);
    g.stroke();
    const out = ops()[0]!;
    expect(out.match(/ c/g)).toHaveLength(2);
    expect(out.startsWith("10 0 m")).toBe(true);
    expect(out).toMatch(/-10 0 c S$/);
    g.beginPath();
    g.arc(0, 0, 10, 0, 0.3);
    g.stroke();
    expect(ops()[1]!.match(/ c/g)).toHaveLength(1);
  });

  it("an arc after a line goes on from where the line is, not as a new path", () => {
    const { g, ops } = canvas();
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(5, 0, 5, 0, Math.PI / 2);
    g.stroke();
    expect(ops()[0]).toMatch(/^0 0 m 10 0 l /);
  });

  it("an arc going the other way (negative sweep) still ends at its end", () => {
    const { g, ops } = canvas();
    g.beginPath();
    g.arc(0, 0, 10, Math.PI, 0);
    g.fill();
    expect(ops()[0]).toMatch(/10 0 c f$/);
  });

  it("moves, turns and rectangles are written as the PDF's own operators", () => {
    const { g, ops } = canvas();
    g.translate(5, 6);
    g.rotate(Math.PI / 2);
    g.fillRect(1, 2, 3, 4);
    expect(ops()).toEqual(["1 0 0 1 5 6 cm", "0 1 -1 0 0 0 cm", "1 2 3 4 re f"]);
  });

  it("numbers are never written in a form a PDF reader can't read", () => {
    const { g, ops } = canvas();
    g.beginPath();
    g.moveTo(1e-9, 123456.789012);
    g.lineTo(0.1 + 0.2, -0);
    g.stroke();
    expect(ops()[0]).not.toMatch(/e[+-]?\d|NaN|Infinity/);
  });
});
