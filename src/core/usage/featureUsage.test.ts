import { describe, expect, it } from "vitest";
import { encodeUsage, featureOf, MAX_COUNT, parseUsage } from "./featureUsage";

describe("feature usage counts (SPEC §15.54)", () => {
  it("a feature is the command, with its argument when that names the thing used", () => {
    expect(featureOf("history.undo")).toBe("history.undo");
    expect(featureOf("tool.select", "fill")).toBe("tool.select:fill");
    expect(featureOf("draw.pickBrush", 3)).toBe("draw.pickBrush:3");
    expect(featureOf("key.select", 7)).toBe("key.select");
    expect(featureOf("selection.nudge", { dx: 1, dy: 0 })).toBe("selection.nudge");
    expect(featureOf("file.export", "png-both")).toBe("file.export:png-both");
    expect(featureOf("tool.select", "<script>")).toBeNull();
  });

  it("a batch goes out and comes back the same; the same feature is merged, empty rows dropped", () => {
    expect(parseUsage(encodeUsage([["history.undo", false, 2, 5], ["history.undo", true, 1, 0]]))).toEqual([
      ["history.undo", false, 2, 5],
      ["history.undo", true, 1, 0],
    ]);
    expect(parseUsage(JSON.stringify({ r: [["view.fit", 0, 1, 0], ["view.fit", 0, 2, 3], ["view.set", 1, 0, 0]] }))).toEqual([["view.fit", false, 3, 3]]);
  });

  it("anything else is refused; counts are capped", () => {
    for (const bad of ["", "nope", "{}", '{"r":5}', '{"r":[["x",0,1,1]]}', '{"r":[["view.fit",2,1,1]]}', '{"r":[["view.fit",0,-1,1]]}', '{"r":[["view.fit",0,1.5,1]]}', '{"r":[["view.fit",0,1]]}'])
      expect(parseUsage(bad), bad).toBeNull();
    expect(parseUsage(JSON.stringify({ r: Array.from({ length: 401 }, () => ["view.fit", 0, 1, 0]) }))).toBeNull();
    expect(parseUsage(JSON.stringify({ r: [["view.fit", 0, 1e9, 0]] }))).toEqual([["view.fit", false, MAX_COUNT, 0]]);
  });
});
