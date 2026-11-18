import { describe, expect, it, vi } from "vitest";

// the validators are pure; the database and the bucket are never touched
vi.mock("./db", () => ({ sql: vi.fn() }));
vi.mock("./storage", () => ({ assets: {} }));

const { validPattern } = await import("./patterns");
const { validThread } = await import("./threads");
const { isPictureId, isPictureType, pictureIds, validPictures } = await import("./pictures");

const ID = `img:${"a".repeat(32)}`;
const ID2 = `img:${"b".repeat(32)}`;
const ID3 = `img:${"c".repeat(32)}`;

describe("validPattern: what the account accepts as a pattern file", () => {
  const ok = { app: "stitchwork", id: "p1", name: "Bird", w: 10, h: 8 };

  it("takes a file written by the app, for its own id", () => {
    expect(validPattern(ok, "p1")).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "pattern"],
    ["another app", { ...ok, app: "other" }],
    ["no app", { id: "p1", name: "Bird", w: 1, h: 1 }],
    ["another id (a file can't be saved under someone else's id)", { ...ok, id: "p2" }],
    ["a name that isn't text", { ...ok, name: 5 }],
    ["a fractional width", { ...ok, w: 1.5 }],
    ["a missing height", { ...ok, h: undefined }],
  ])("refuses %s", (_what, v) => {
    expect(validPattern(v, "p1")).toBe(false);
  });

  it("refuses a chart bigger than 500 either way, and takes 500", () => {
    expect(validPattern({ ...ok, w: 501 }, "p1")).toBe(false);
    expect(validPattern({ ...ok, h: 501 }, "p1")).toBe(false);
    expect(validPattern({ ...ok, w: 500, h: 500 }, "p1")).toBe(true);
  });

  it("refuses a file bigger than the limit", () => {
    expect(validPattern({ ...ok, big: "x".repeat(20_000_001) }, "p1")).toBe(false);
  });
});

describe("validThread: a thread or bead of one's own", () => {
  const ok = { id: "custom:a", kind: "thread", brand: "Anchor", code: "403", name: "Black", hex: "#0a0B0c" };

  it("takes threads and beads", () => {
    expect(validThread(ok, "custom:a")).toBe(true);
    expect(validThread({ ...ok, kind: "bead" }, "custom:a")).toBe(true);
    expect(validThread({ ...ok, name: "" }, "custom:a")).toBe(true);
  });

  it.each([
    ["null", null],
    ["an id that isn't the address's", { ...ok, id: "custom:b" }],
    ["an id outside custom:", { ...ok, id: "dmc:310" }],
    ["a kind that is neither", { ...ok, kind: "combo" }],
    ["a blank brand", { ...ok, brand: "   " }],
    ["a blank code", { ...ok, code: "" }],
    ["a code over 40 characters", { ...ok, code: "9".repeat(41) }],
    ["a brand over 120 characters", { ...ok, brand: "b".repeat(121) }],
    ["a name over 120 characters", { ...ok, name: "n".repeat(121) }],
    ["a short hex", { ...ok, hex: "#fff" }],
    ["a hex without #", { ...ok, hex: "ffffff" }],
    ["a name that isn't text", { ...ok, name: 1 }],
  ])("refuses %s", (_what, v) => {
    expect(validThread(v, "custom:a")).toBe(false);
  });
});

describe("picture ids and types", () => {
  it("an id is img: and 32 lowercase hex digits, nothing else", () => {
    expect(isPictureId(ID)).toBe(true);
    for (const bad of [`img:${"a".repeat(31)}`, `img:${"a".repeat(33)}`, `img:${"A".repeat(32)}`, `x:${"a".repeat(32)}`, `img:${"g".repeat(32)}`, `${ID}/../x`, "", 5, null])
      expect(isPictureId(bad)).toBe(false);
  });

  it("a type is an image or plain bytes", () => {
    for (const t of ["image/png", "image/jpeg", "image/svg+xml", "application/octet-stream"]) expect(isPictureType(t)).toBe(true);
    for (const t of ["text/html", "application/json", "image/", "IMAGE/PNG", "", 1, undefined]) expect(isPictureType(t)).toBe(false);
  });
});

describe("pictureIds: every picture the records use", () => {
  it("collects photos, marks, the underlay and its straighten source, each once", () => {
    const refs = [{ image: ID, marks: ID2 }, { image: ID }];
    const underlay = { image: ID3, straighten: { source: ID } };
    expect(pictureIds(refs, underlay).sort()).toEqual([ID, ID2, ID3].sort());
  });

  it("ignores things that aren't picture ids, and no underlay", () => {
    expect(pictureIds([{ image: "data:image/png;base64,xx", marks: null }, null as never], null)).toEqual([]);
  });
});

describe("validPictures: windows and underlay as the app writes them", () => {
  it("takes none, windows with a stored photo (marks optional), and an underlay with its picture", () => {
    expect(validPictures([], null)).toBe(true);
    expect(validPictures([{ image: ID }, { image: ID2, marks: ID3 }], null)).toBe(true);
    expect(validPictures([], { image: ID })).toBe(true);
    expect(validPictures([], { image: ID, straighten: { source: ID2 } })).toBe(true);
  });

  it.each([
    ["refs that aren't a list", {}, null],
    ["a window without a stored photo (a data URL)", [{ image: "data:image/png;base64,xx" }], null],
    ["marks that aren't a picture id", [{ image: ID, marks: "x" }], null],
    ["a null window", [null], null],
    ["an underlay without its picture", [], { image: "x" }],
    ["a straighten source that isn't a picture id", [], { image: ID, straighten: { source: "x" } }],
    ["an underlay that isn't an object", [], "x"],
  ])("refuses %s", (_what, refs, underlay) => {
    expect(validPictures(refs, underlay)).toBe(false);
  });

  it("refuses more than 100 windows, and records that are far too big", () => {
    expect(validPictures(Array.from({ length: 101 }, () => ({ image: ID })), null)).toBe(false);
    expect(validPictures(Array.from({ length: 100 }, () => ({ image: ID, pad: "x".repeat(20_000) })), null)).toBe(false);
  });
});
