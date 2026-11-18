import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageRepository, RefWindowData } from "@/persistence/ports";
import type { UnderlayData } from "@/core/underlay/underlay";

const decoded = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/platform/images", () => ({ loadImage: vi.fn(async () => (decoded.calls++, { naturalWidth: 4, naturalHeight: 4 })) }));

const { ImageService } = await import("./ImageService");

const png = "data:image/png;base64,iVBORw0KGgo=";
let blobs: Map<string, Blob>, puts: number, svc: InstanceType<typeof ImageService>;
const repo: ImageRepository = {
  put: async () => (puts++, `img:${puts}`),
  get: async (id) => blobs.get(id) ?? null,
  collectGarbage: async () => {},
};
const win = (image: string, marks: string | null = null): RefWindowData => ({ id: "r1", name: "Photo", image, x: 1, y: 2, w: 3, h: 4, min: false, op: 1, view: null, tool: "pan", color: "#000", size: 4, grid: false, showSt: false, marks });
const under = (image: string, source?: string): UnderlayData => ({
  image, imageW: 10, imageH: 10, crop: { x: 0, y: 0, w: 10, h: 10 }, rect: { x: 0, y: 0, w: 5, h: 5 }, opacity: 0.5, behind: true, visible: true, tool: "move",
  ...(source && { straighten: { source, sourceW: 10, sourceH: 10, corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], cols: 2, rows: 2, at: { x: 0, y: 0 } } }),
});

beforeEach(() => {
  blobs = new Map();
  puts = 0;
  decoded.calls = 0;
  svc = new ImageService(repo);
});

describe("decoded pictures", () => {
  it("are decoded once per id while they are in use", async () => {
    blobs.set("img:a", new Blob(["x"]));
    await Promise.all([svc.load("img:a"), svc.load("img:a")]);
    await svc.load("img:a");
    expect(decoded.calls).toBe(1);
  });

  it("a picture the store doesn't have is an error that isn't remembered: it can be tried again once it's there", async () => {
    await expect(svc.load("img:a")).rejects.toThrow("missing image img:a");
    blobs.set("img:a", new Blob(["x"]));
    await expect(svc.load("img:a")).resolves.toBeTruthy();
  });

  it("only the 16 most recent are kept: older ones are decoded again", async () => {
    for (let i = 0; i < 17; i++) blobs.set(`img:${i}`, new Blob(["x"]));
    for (let i = 0; i < 17; i++) await svc.load(`img:${i}`);
    expect(decoded.calls).toBe(17);
    await svc.load("img:16");
    expect(decoded.calls).toBe(17);
    await svc.load("img:0");
    expect(decoded.calls).toBe(18);
  });
});

describe("pictures travelling in a .xbird as data URLs", () => {
  it("a stored picture becomes a data URL and back to a stored id, ids and data URLs passing through", async () => {
    blobs.set("img:a", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
    expect(await svc.toDataUrl("img:a")).toMatch(/^data:image\/png;base64,/);
    expect(await svc.toDataUrl(png)).toBe(png);
    expect(await svc.toDataUrl("img:gone")).toBeNull();
    expect(await svc.fromDataUrl("img:keep")).toBe("img:keep");
    expect(puts).toBe(0);
    expect(await svc.fromDataUrl(png)).toBe("img:1");
  });

  it("photo windows keep their settings, photo and marks both ways", async () => {
    blobs.set("img:a", new Blob(["a"], { type: "image/png" }));
    blobs.set("img:m", new Blob(["m"], { type: "image/png" }));
    const [file] = await svc.refsToFile([win("img:a", "img:m")]);
    expect(file).toMatchObject({ id: "r1", name: "Photo", x: 1, w: 3 });
    expect(file!.src).toMatch(/^data:image\/png/);
    expect(file!.marks).toMatch(/^data:image\/png/);
    const [back] = await svc.refsFromFile([file]);
    expect(back).toMatchObject({ id: "r1", x: 1, w: 3, image: "img:1", marks: "img:2" });
    expect(back).not.toHaveProperty("src");
  });

  it("a window whose photo is no longer in the store is left out of the file, one whose marks are gone has none", async () => {
    blobs.set("img:a", new Blob(["a"], { type: "image/png" }));
    const out = await svc.refsToFile([win("img:gone"), win("img:a", "img:gone")]);
    expect(out).toHaveLength(1);
    expect(out[0]!.marks).toBeNull();
  });

  it("windows from a file without a picture, or that aren't windows at all, are skipped", async () => {
    const out = await svc.refsFromFile([null, { id: "x" }, { id: "y", src: "" }, 5, { id: "ok", src: png, marks: "" }]);
    expect(out.map((r) => r.id)).toEqual(["ok"]);
    expect(out[0]!.marks).toBeNull();
  });

  it("the image behind the chart keeps everything, straighten source included", async () => {
    blobs.set("img:a", new Blob(["a"], { type: "image/png" }));
    blobs.set("img:s", new Blob(["s"], { type: "image/png" }));
    const file = (await svc.underlayToFile(under("img:a", "img:s"))) as { src: string; straighten: { src: string; cols: number } };
    expect(file.src).toMatch(/^data:/);
    expect(file).not.toHaveProperty("image");
    expect(file.straighten.src).toMatch(/^data:/);
    expect(file.straighten).not.toHaveProperty("source");
    expect(file.straighten.cols).toBe(2);
    const back = await svc.underlayFromFile(file as never);
    expect(back).toMatchObject({ image: "img:1", behind: true, straighten: { source: "img:2", cols: 2 } });
  });

  it("an image whose picture is gone isn't written; one whose straighten source is gone is written without it", async () => {
    expect(await svc.underlayToFile(under("img:gone"))).toBeUndefined();
    blobs.set("img:a", new Blob(["a"], { type: "image/png" }));
    const file = (await svc.underlayToFile(under("img:a", "img:gone"))) as Record<string, unknown>;
    expect(file.src).toBeTruthy();
    expect(file).not.toHaveProperty("straighten");
  });

  it("a damaged underlay in a file is none, not a crash", async () => {
    expect(await svc.underlayFromFile(null)).toBeNull();
    expect(await svc.underlayFromFile({ image: 5 } as never)).toBeNull();
  });
});

describe("a PDF in a .xbird (SPEC §15.41)", () => {
  it("a PDF window carries the PDF and its pages' marks, and the page shown for older versions — and comes back", async () => {
    blobs.set("img:pdf", new Blob(["%PDF"], { type: "application/pdf" }));
    blobs.set("img:page", new Blob(["p"], { type: "image/png" }));
    blobs.set("img:m1", new Blob(["m"], { type: "image/png" }));
    const [file] = await svc.refsToFile([{ ...win("img:page"), pdf: { source: "img:pdf", page: 2, pages: 3, marks: { "1": "img:m1" } } }]);
    expect(file!.src).toMatch(/^data:image\/png/);
    expect(file!.pdf).toMatchObject({ page: 2, pages: 3 });
    expect(file!.pdf!.src).toMatch(/^data:application\/pdf/);
    expect(file!.pdf!.marks!["1"]).toMatch(/^data:image\/png/);
    const [back] = await svc.refsFromFile([file]);
    expect(back!.pdf).toEqual({ source: expect.stringMatching(/^img:/), page: 2, pages: 3, marks: { "1": expect.stringMatching(/^img:/) } });
  });

  it("a PDF window without its page drawn still travels, and comes back to be drawn", async () => {
    blobs.set("img:pdf", new Blob(["%PDF"], { type: "application/pdf" }));
    const [file] = await svc.refsToFile([{ ...win("img:not-here"), pdf: { source: "img:pdf", page: 1, pages: 2 } }]);
    expect(file!.src).toBe("");
    const [back] = await svc.refsFromFile([file]);
    expect(back).toMatchObject({ image: "", pdf: { page: 1, pages: 2 } });
  });

  it("an underlay that's a page of a PDF carries the PDF as pdf.src, and back", async () => {
    blobs.set("img:pdf", new Blob(["%PDF"], { type: "application/pdf" }));
    blobs.set("img:a", new Blob(["a"], { type: "image/png" }));
    const file = (await svc.underlayToFile({ ...under("img:a"), pdf: { source: "img:pdf", page: 3, pages: 4 } })) as { pdf: { src: string; page: number } };
    expect(file.pdf.src).toMatch(/^data:application\/pdf/);
    expect(file.pdf).not.toHaveProperty("source");
    const back = await svc.underlayFromFile(file as never);
    expect(back!.pdf).toEqual({ source: expect.stringMatching(/^img:/), page: 3, pages: 4 });
  });
});
