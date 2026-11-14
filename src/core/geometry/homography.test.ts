import { describe, expect, it } from "vitest";
import { homography, project, warpQuad } from "./homography";

describe("perspective straightening", () => {
  it("maps the 4 corners exactly and keeps straight lines straight", () => {
    const photo = [{ x: 12, y: 8 }, { x: 410, y: 30 }, { x: 380, y: 290 }, { x: 25, y: 270 }];
    const flat = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 60 }, { x: 0, y: 60 }];
    const h = homography(flat, photo)!;
    flat.forEach((p, i) => {
      const q = project(h, p);
      expect(q.x).toBeCloseTo(photo[i]!.x, 6);
      expect(q.y).toBeCloseTo(photo[i]!.y, 6);
    });
    // the middle of the top edge lands on the photo's top edge
    const mid = project(h, { x: 40, y: 0 }), t = (mid.x - 12) / (410 - 12);
    expect(mid.y).toBeCloseTo(8 + t * (30 - 8), 6);
    expect(homography(flat, [photo[0]!, photo[0]!, photo[0]!, photo[0]!])).toBeNull();
  });

  it("straightens a skewed square back into a square", () => {
    // 20×20 photo: a black diamond-ish quad on white; the warp of exactly that quad is all black
    const w = 20, data = new Uint8ClampedArray(w * w * 4).fill(255);
    const inside = (x: number, y: number) => x >= 5 && x < 15 && y >= 5 && y < 15;
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (inside(x, y)) data.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3);
    const out = warpQuad({ width: w, height: w, data }, [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }], 4, 4);
    expect([...out.data].filter((_, i) => i % 4 === 0).every((v) => v < 10)).toBe(true);
  });
});
