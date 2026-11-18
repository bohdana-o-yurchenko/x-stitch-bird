import { beforeEach, describe, expect, it, vi } from "vitest";

const pdf = vi.hoisted(() => ({ pages: 1, drawn: [] as number[] }));
vi.mock("@/platform/pdf", () => ({
  pdfPageCount: async () => pdf.pages,
  renderPdfPage: async (_b: Blob, page: number) => (pdf.drawn.push(page), { blob: new Blob([`page ${page}`]), w: 3000, h: 4600 }),
}));
vi.mock("./photoRoom", () => ({ photoFits: async () => true }));

const { addPdf } = await import("./pdfPages");

/** Just what adding a PDF uses of the editor: the picture store and the dialogs. */
type Asked = { type: string; pages: number; to: string; answer(page: number | null): void };

function fakeEditor() {
  const store = new Map<string, Blob>();
  const ed = {
    dialog: null as Asked | null,
    images: { put: async (b: Blob) => (store.set(`img:${store.size}`, b), `img:${store.size - 1}`), blob: async (id: string) => store.get(id) ?? null },
    openDialog: (d: Asked) => (ed.dialog = d),
    toast: vi.fn(),
  };
  return ed;
}

beforeEach(() => {
  pdf.drawn = [];
});

describe("adding a PDF: which page to start with (SPEC §15.44)", () => {
  it("one page: no question, that page is drawn", async () => {
    pdf.pages = 1;
    const ed = fakeEditor();
    const r = await addPdf(ed as never, new File(["%PDF"], "one.pdf"), "underlay");
    expect(ed.dialog).toBeNull();
    expect(r).toMatchObject({ pages: 1, page: 1 });
    expect(pdf.drawn).toEqual([1]);
  });

  it("several: the user picks the page, and only that one is drawn sharp; put aside, nothing is added", async () => {
    pdf.pages = 12;
    const ed = fakeEditor();
    const adding = addPdf(ed as never, new File(["%PDF"], "chart.pdf"), "window");
    await vi.waitFor(() => expect(ed.dialog).toMatchObject({ type: "pdfPage", pages: 12, to: "window" }));
    ed.dialog!.answer(7);
    expect(await adding).toMatchObject({ pages: 12, page: 7 });
    expect(pdf.drawn).toEqual([7]);
    ed.dialog = null;
    const again = addPdf(ed as never, new File(["%PDF"], "chart.pdf"), "underlay");
    await vi.waitFor(() => expect(ed.dialog).not.toBeNull());
    ed.dialog!.answer(null);
    expect(await again).toBeNull();
    expect(ed.toast).not.toHaveBeenCalled();
  });
});
