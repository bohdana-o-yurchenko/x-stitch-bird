import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testEditor } from "../../tests/support/editorHarness";
import { LARGE_PHOTO_PX, confirmLargePhoto, largePhotoAsked, stopAskingLargePhoto } from "./images/largePhoto";
import { savedHeight, savedOpen, savedSections, saveHeight, saveOpen, saveSections, SECTION_HEIGHT } from "./panelSections";
import { requestStart, takeStartIntent } from "./startRequest";

function storage(throws = false) {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => (throws ? (() => { throw new Error("blocked"); })() : data.get(k) ?? null),
    setItem: (k: string, v: string) => (throws ? (() => { throw new Error("blocked"); })() : void data.set(k, v)),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("the side panel's remembered section", () => {
  beforeEach(() => vi.stubGlobal("localStorage", storage()));

  it("starts with Totals shown and open, at the first height", () => {
    expect([savedSections(), savedOpen(), savedHeight()]).toEqual([["totals"], "totals", SECTION_HEIGHT]);
  });

  it("remembers what was chosen: one section at most, all folded, a height in whole pixels", () => {
    saveSections(["a", "b", "key"]);
    expect(savedSections()).toEqual(["key"]);
    saveOpen(null);
    expect(savedOpen()).toBeNull();
    saveOpen("key");
    expect(savedOpen()).toBe("key");
    saveHeight(412.7);
    expect(savedHeight()).toBe(413);
  });

  it("junk in storage gives the starting values", () => {
    localStorage.setItem("stitchwork.panelSections", "{broken");
    localStorage.setItem("stitchwork.sectionHeight", "abc");
    expect([savedSections(), savedHeight()]).toEqual([["totals"], SECTION_HEIGHT]);
    localStorage.setItem("stitchwork.panelSections", JSON.stringify([1, "x", null]));
    expect(savedSections()).toEqual(["x"]);
  });

  it("when the browser won't store anything, nothing throws", () => {
    vi.stubGlobal("localStorage", storage(true));
    expect(() => (saveSections(["a"]), saveOpen("a"), saveHeight(5))).not.toThrow();
    expect([savedSections(), savedOpen(), savedHeight()]).toEqual([["totals"], "totals", SECTION_HEIGHT]);
  });
});

describe("what the editor opens on arrival (SPEC §15.37)", () => {
  function at(url: string) {
    const replaced: string[] = [];
    const location = { href: url };
    vi.stubGlobal("window", { location, history: { replaceState: (_s: unknown, _t: string, u: URL) => void (replaced.push(String(u)), (location.href = String(u))) } });
    return replaced;
  }

  it("with nothing asked, the pattern worked on last", () => {
    const replaced = at("https://x/uk");
    expect(takeStartIntent()).toEqual({ kind: "resume" });
    expect(replaced).toEqual([]);
  });

  it("?open=<id> opens that pattern and is taken out of the address so a reload doesn't repeat it", () => {
    const replaced = at("https://x/uk?open=abc&keep=1");
    expect(takeStartIntent()).toEqual({ kind: "open", id: "abc" });
    expect(replaced).toEqual(["https://x/uk?keep=1"]);
  });

  it("?new=1 makes a new one", () => {
    const replaced = at("https://x/uk?new=1");
    expect(takeStartIntent()).toEqual({ kind: "new" });
    expect(replaced).toEqual(["https://x/uk"]);
  });

  it("a file picked on the patterns page wins over the address, and is handed over once", () => {
    at("https://x/uk?open=abc");
    const file = new File(["x"], "a.xbird");
    requestStart({ kind: "file", file });
    expect(takeStartIntent()).toEqual({ kind: "file", file });
    expect(takeStartIntent()).toEqual({ kind: "resume" });
  });

  it("an empty ?open= is not an id", () => {
    at("https://x/uk?open=");
    expect(takeStartIntent()).toEqual({ kind: "resume" });
  });
});

describe("very large photos", () => {
  beforeEach(() => vi.stubGlobal("localStorage", storage()));

  it("up to 24 megapixels are used without asking", async () => {
    const { ed } = testEditor();
    const side = Math.floor(Math.sqrt(LARGE_PHOTO_PX));
    expect(await confirmLargePhoto(ed, { naturalWidth: side, naturalHeight: side })).toBe(true);
    expect(ed.state.dialog).toBeNull();
  });

  it("bigger ones ask first, and the answer decides", async () => {
    const { ed } = testEditor();
    const asked = confirmLargePhoto(ed, { naturalWidth: 6000, naturalHeight: 5000 });
    expect(ed.state.dialog).toMatchObject({ type: "largePhoto", w: 6000, h: 5000 });
    (ed.state.dialog as unknown as { answer(v: boolean): void }).answer(false);
    expect(await asked).toBe(false);
  });

  it("'don't ask again' is remembered, and then they pass", async () => {
    const { ed } = testEditor();
    expect(largePhotoAsked()).toBe(false);
    stopAskingLargePhoto();
    expect(largePhotoAsked()).toBe(true);
    expect(await confirmLargePhoto(ed, { naturalWidth: 9000, naturalHeight: 9000 })).toBe(true);
  });

  it("without storage the question is asked every time", () => {
    vi.stubGlobal("localStorage", storage(true));
    expect(() => stopAskingLargePhoto()).not.toThrow();
    expect(largePhotoAsked()).toBe(false);
  });
});
