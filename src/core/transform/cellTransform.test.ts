import { describe, expect, it } from "vitest";
import { TRANSFORMS } from "./cellTransform";

describe("whole-chart cell transforms", () => {
  const size = { w: 4, h: 2 };
  it("rotating four times, or flipping twice, returns every cell, point and corner home", () => {
    const again = (id: keyof typeof TRANSFORMS, times: number) => {
      let cell: [number, number] = [1, 0], point: [number, number] = [1.5, 2], corner = 1 as 0 | 1 | 2 | 3, s = size;
      for (let n = 0; n < times; n++) {
        const t = TRANSFORMS[id];
        cell = t.cell(cell[0], cell[1], s) as [number, number];
        point = t.point(point[0], point[1], s) as [number, number];
        corner = t.corner(corner);
        s = t.newSize(s);
      }
      return { cell, point, corner, s };
    };
    const home = { cell: [1, 0], point: [1.5, 2], corner: 1, s: size };
    expect(again("rot90cw", 4)).toEqual(home);
    expect(again("rot90ccw", 4)).toEqual(home);
    expect(again("rot180", 2)).toEqual(home);
    expect(again("flipH", 2)).toEqual(home);
    expect(again("flipV", 2)).toEqual(home);
  });

  it("a quarter turn swaps width and height, and clockwise undoes counter-clockwise", () => {
    const cw = TRANSFORMS.rot90cw, ccw = TRANSFORMS.rot90ccw;
    expect(cw.newSize(size)).toEqual({ w: 2, h: 4 });
    const [x, y] = cw.cell(3, 1, size);
    expect(ccw.cell(x, y, cw.newSize(size))).toEqual([3, 1]);
    expect(ccw.corner(cw.corner(2))).toBe(2);
  });
});
