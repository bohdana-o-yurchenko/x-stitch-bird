import { describe, expect, it } from "vitest";
import { importOxs } from "../formats/oxs/importOxs";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { brandCode, byNumber, libraryColor, THREAD_CATALOGUES } from "./catalog";

describe("Anchor and Madeira catalogues (open data, NOTICE.md)", () => {
  it("are built in next to DMC, with codes, names, colours — and Anchor's DMC equivalents", () => {
    expect(Object.keys(THREAD_CATALOGUES)).toEqual(["DMC", "Anchor", "Madeira"]);
    expect(THREAD_CATALOGUES.Anchor!.length).toBe(445);
    expect(THREAD_CATALOGUES.Madeira!.length).toBe(369);
    const a = libraryColor("anchor:403")!;
    expect([brandCode(a), a.name, a.dmc]).toEqual(["Anchor 403", "Black", "310"]);
    expect(libraryColor("madeira:Black")?.hex).toBe("#000000");
    // DMC first, then Anchor, then Madeira
    expect([libraryColor("madeira:2713")!, a, libraryColor("dmc:310")!].sort(byNumber).map((e) => e.brand)).toEqual(["DMC", "Anchor", "Madeira"]);
  });

  it("OXS from other apps: a number named with its brand is that brand's colour", () => {
    const xml = `<?xml version="1.0"?><chart><format comments01="" /><properties oxsversion="1.0" software="x" chartheight="1" chartwidth="2" stitchesperinch="14" /><palette>
      <palette_item index="0" number="cloth" name="cloth" color="FFFFFF" />
      <palette_item index="1" number="Anchor 403" name="Black" color="000000" strands="2" />
      <palette_item index="2" number="2713" name="Madeira Pink Purple" color="BE839D" strands="2" />
    </palette><fullstitches><stitch x="0" y="0" palindex="1" /><stitch x="1" y="0" palindex="2" /></fullstitches></chart>`;
    const { pattern } = importOxs(xml, ALL_SYMBOLS);
    expect(pattern.key.filter(Boolean).map((e) => e!.src).sort()).toEqual(["anchor:403", "madeira:2713"]);
  });
});

describe("Preciosa Rocailles (from Preciosa's sample cards)", () => {
  it("a second bead brand: codes with their finish; the same code in another finish is its own colour", async () => {
    const { BEAD_CATALOGUES, PRECIOSA } = await import("./catalog");
    expect(Object.keys(BEAD_CATALOGUES)).toEqual(["Mill Hill", "Preciosa"]);
    expect(PRECIOSA.length).toBeGreaterThan(600);
    expect(new Set(PRECIOSA.map((e) => e.id)).size).toBe(PRECIOSA.length);
    const plain = libraryColor("preciosa:13600")!, matt = libraryColor("preciosa:13600/33139001")!;
    expect([brandCode(plain), plain.name, matt.name]).toEqual(["Preciosa 13600", "Natural Opaque", "Opaque - Matt"]);
    expect(plain.kind).toBe("bead");
  });
});
