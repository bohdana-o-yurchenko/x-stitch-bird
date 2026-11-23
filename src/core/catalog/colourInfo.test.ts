import { describe, expect, it } from "vitest";
import { ANCHOR, BEADS, DMC, DMC_BY_CODE, THREAD_CATALOGUES, libraryColor } from "./catalog";
import { FAMILIES, SIMILAR, byColour, closeness, familyOf, flossFor, inOtherBrands, lightness, nearest, seriesOf, shades, similar } from "./colourInfo";

const dmc = (code: string) => DMC_BY_CODE.get(code)!;

describe("colour families", () => {
  it("sorts well-known DMC colours as a stitcher would", () => {
    expect(familyOf(dmc("310"))).toBe("neutral");
    expect(familyOf(dmc("B5200"))).toBe("neutral");
    expect(familyOf(dmc("321"))).toBe("red");
    expect(familyOf(dmc("740"))).toBe("orange");
    expect(familyOf(dmc("444"))).toBe("yellow");
    expect(familyOf(dmc("699"))).toBe("green");
    expect(familyOf(dmc("820"))).toBe("blue");
    expect(familyOf(dmc("550"))).toBe("purple");
    expect(familyOf(dmc("3326"))).toBe("pink");
    expect(familyOf(dmc("801"))).toBe("brown");
  });
  it("every family has colours in DMC", () => {
    const seen = new Set(DMC.map(familyOf));
    for (const f of FAMILIES) expect(seen.has(f)).toBe(true);
  });
});

describe("by colour", () => {
  it("runs family by family round the wheel, each light to dark — a pale colour sits at its family's light end", () => {
    const sorted = [...DMC].sort(byColour);
    const families = sorted.map(familyOf);
    // each family is one run
    expect(families.filter((f, i) => f !== families[i - 1])).toEqual([...FAMILIES]);
    for (let i = 1; i < sorted.length; i++)
      if (families[i] === families[i - 1]) expect(lightness(sorted[i - 1]!)).toBeGreaterThanOrEqual(lightness(sorted[i]!));
  });
});

describe("similar and shades", () => {
  it("nearest never offers the colour itself, nearest first", () => {
    const near = nearest(dmc("310"), DMC, 3);
    expect(near).toHaveLength(3);
    expect(near.map((n) => n.entry.code)).not.toContain("310");
    expect(near[0]!.d).toBeLessThanOrEqual(near[1]!.d);
  });
  it("similar offers only colours that look close; a colour on its own gets its one nearest, rough", () => {
    for (const e of DMC) {
      const { close, alone } = similar(e, DMC);
      for (const x of close) expect(x.d).toBeLessThan(SIMILAR);
      expect(!!alone).toBe(close.length === 0);
    }
    // red has close neighbours; black has none — its nearest (3371) is offered on its own
    expect(similar(dmc("321"), DMC).close.map((x) => x.entry.code)).toContain("349");
    expect(similar(dmc("310"), DMC)).toMatchObject({ close: [], alone: { entry: { code: "3371" } } });
  });
  it("a shade ladder runs light to dark and holds the colour", () => {
    const ladder = shades(dmc("3865"), DMC.filter((e) => e.code !== "B5200"));
    const blue = shades(dmc("799"), DMC);
    expect(blue.map((e) => e.code)).toContain("799");
    expect(blue.length).toBeGreaterThan(3);
    for (let i = 1; i < blue.length; i++) expect(lightness(blue[i - 1]!)).toBeGreaterThanOrEqual(lightness(blue[i]!));
    expect(ladder.map((e) => e.code)).toContain("3865");
  });
});

describe("other brands", () => {
  it("Anchor 403 is DMC 310 by the chart", () => {
    const a403 = libraryColor("anchor:403")!;
    const m = inOtherBrands(a403, THREAD_CATALOGUES).find((x) => x.brand === "DMC")!;
    expect(m).toMatchObject({ how: "chart", entry: { code: "310" } });
  });
  it("from DMC to the others through their charts, never to itself", () => {
    const ms = inOtherBrands(dmc("310"), THREAD_CATALOGUES);
    expect(ms.map((m) => m.brand)).toEqual(["Anchor", "Madeira", "Dimensions"]);
    expect(ms.find((m) => m.brand === "Anchor")!.entry.dmc).toBe("310");
  });
  it("a colour without a chart entry gets the nearest, said how near", () => {
    const loose = ANCHOR.find((e) => !e.dmc);
    if (!loose) return;
    const m = inOtherBrands(loose, THREAD_CATALOGUES).find((x) => x.brand === "DMC")!;
    expect(m.how).toBe("near");
    expect(["veryClose", "close", "rough"]).toContain(closeness(m.d));
  });
  it("a bead's floss and its series", () => {
    const bead = BEADS.find((b) => b.dmc && DMC_BY_CODE.has(b.dmc))!;
    expect(flossFor(bead)).toMatchObject({ how: "chart", entry: { code: bead.dmc } });
    expect(seriesOf(bead)).toBe(bead.series);
    expect(seriesOf(libraryColor("preciosa:00050")!)).toBe("Natural Transparent");
  });
});
