import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { cellPoint, dragCells, editorState, fileAction, fixture, gridPoint, loadFixture, openEditor } from "./helpers";

/*
 * The main things people do, start to finish: make a pattern, draw it, keep it, open it again, bring in pictures
 * and files, move parts around, every kind of stitch, and get it back out.
 */

test.beforeEach(async ({ page }) => openEditor(page));

const count = (page: Page, expr: string) => editorState<number>(page, `(ed) => ${expr}`);
const fulls = (page: Page) => count(page, "ed.doc.layers.stitches.filter(Boolean).length");

/** + Add to key → a floss by number → Add. `type`: the stitch type tab, as named in the form. */
async function addFloss(page: Page, code: string, type?: string) {
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  const form = page.getByTestId("key-form");
  if (type) await form.getByRole("radio", { name: type }).click();
  await page.getByPlaceholder("Search DMC number or name").fill(code);
  await page.locator(`[data-id='dmc:${code}']`).click();
  await form.getByRole("button", { name: "Add to key", exact: true }).click();
  await expect(form).toHaveCount(0);
}

test("a blank pattern: build the key, draw with line, rectangles and fill, save, and find it again after a reload", async ({ page }) => {
  await fileAction(page, "New", "Blank pattern…");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Tulip");
  await dialog.getByLabel("Width (stitches)").fill("30");
  await dialog.getByLabel("Height (stitches)").fill("20");
  await dialog.getByLabel(/Start with the same key/).setChecked(false);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Your key is empty.")).toBeVisible();
  expect(await editorState<string>(page, "(ed) => `${ed.doc.w}×${ed.doc.h}`")).toBe("30×20");

  await addFloss(page, "666");
  await expect(page.locator("[data-entry]")).toHaveCount(1);
  await page.keyboard.press("l");
  await dragCells(page, [1, 1], [8, 1]);
  expect(await fulls(page)).toBe(8);
  await page.keyboard.press("Shift+R");
  await dragCells(page, [2, 4], [5, 7]);
  expect(await fulls(page)).toBe(8 + 16);
  // an outline, then fill its inside
  await page.keyboard.press("r");
  await dragCells(page, [10, 4], [16, 10]);
  expect(await fulls(page)).toBe(8 + 16 + 24);
  await page.keyboard.press("f");
  const inside = await cellPoint(page, 13, 7);
  await page.mouse.click(inside.x, inside.y);
  await expect(page.getByTestId("totals")).toContainText("73 full");

  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Saved “Tulip” in this browser")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Pattern name" })).toHaveValue("Tulip");
  await expect(page.getByTestId("totals")).toContainText("73 full");
  await fileAction(page, "Open saved pattern…");
  await expect(page.getByRole("dialog").getByRole("button", { name: /Tulip 30×20/ })).toBeVisible();
});

test("a file opened from the computer is kept, even when another pattern is opened straight after", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+s");
  await loadFixture(page, "1.oxs");
  await expect(page.locator("[data-entry]")).toHaveCount(12);
  // straight away, another pattern
  await fileAction(page, "Open saved pattern…");
  const dialog = page.getByRole("dialog");
  // both are called "Untitled pattern": told apart by size (the demo is 60 × 60, the file 72 × 72)
  await dialog.getByRole("button", { name: /Untitled pattern 60×60/ }).click();
  await expect(page.locator("[data-entry]")).toHaveCount(8);
  // the imported one is in the library, whole
  await fileAction(page, "Open saved pattern…");
  await dialog.getByRole("button", { name: /Untitled pattern 72×72/ }).click();
  await expect(page.locator("[data-entry]")).toHaveCount(12);
  await expect(page.getByTestId("totals")).toContainText("138 half");
});

test("a picture becomes a pattern with the chosen size and number of colours", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await fileAction(page, "New", "From a picture…");
  await (await chooser).setFiles(fixture("underlay.png"));
  const dialog = page.getByRole("dialog", { name: "Turn a picture into a pattern" });
  await dialog.getByLabel("Width (stitches)").fill("20");
  await dialog.getByLabel("Max colours").fill("4");
  await expect(dialog.getByText(/^20 × 10 stitches/)).toBeVisible();
  await dialog.getByRole("button", { name: "Create pattern" }).click();
  await expect(page.getByText(/^Pattern created — \d colours/)).toBeVisible();
  expect(await editorState<string>(page, "(ed) => `${ed.doc.w}×${ed.doc.h}`")).toBe("20×10");
  const entries = await page.locator("[data-entry]").count();
  expect(entries).toBeGreaterThan(0);
  expect(entries).toBeLessThanOrEqual(4);
  // every cell is stitched with one of them
  expect(await fulls(page)).toBe(200);
});

test("Versions brings back the pattern as it was before a risky change", async ({ page }) => {
  const used = page.locator("[data-entry]").first();
  await used.hover();
  await used.getByRole("button", { name: "Delete entry" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator("[data-entry]")).toHaveCount(7);
  await fileAction(page, "Versions…");
  const row = page.getByRole("dialog").getByText(/Before deleting a key entry/);
  await expect(row).toBeVisible();
  await row.locator("..").getByRole("button", { name: "Restore" }).click();
  await expect(page.locator("[data-entry]")).toHaveCount(8);
  await expect(page.getByTestId("totals")).toContainText("91 full");
});

test("a selection is copied, pasted where the pointer is and placed; undo takes the copy away", async ({ page }) => {
  // the heart: 11 × 10 cells from column 24, row 22
  const heart = (x: number, y: number) => `Array.from({ length: 110 }, (_, i) => ed.doc.layers.stitches[(${y} + ((i / 11) | 0)) * 60 + ${x} + (i % 11)])`;
  await page.keyboard.press("s");
  await dragCells(page, [24, 22], [34, 31]);
  await expect(page.getByRole("button", { name: "Deselect" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+c");
  const target = await cellPoint(page, 2, 40);
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByText("Pasted — click or press Enter to place")).toBeVisible();
  await page.keyboard.press("Enter");
  const [source, copy] = await editorState<number[][]>(page, `(ed) => [${heart(24, 22)}, ${heart(2, 40)}]`);
  expect(copy).toEqual(source);
  expect(source!.filter(Boolean)).toHaveLength(70);
  await page.keyboard.press("ControlOrMeta+z");
  expect((await editorState<number[]>(page, `(ed) => ${heart(2, 40)}`)).filter(Boolean)).toHaveLength(0);
});

test("every kind of stitch: backstitch lines, French knots, partial stitches; the eraser takes one line away", async ({ page }) => {
  const segments = () => count(page, "ed.doc.layers.segments.length");
  const before = await segments();
  // the demo's backstitch entry: the pencil draws lines from corner to corner, Esc ends the chain
  await page.locator("[data-entry='7']").click();
  for (const [x, y] of [[2, 2], [6, 2], [6, 5]] as const) {
    const pt = await gridPoint(page, x, y);
    await page.mouse.click(pt.x, pt.y);
  }
  await page.keyboard.press("Escape");
  expect(await segments()).toBe(before + 2);

  await addFloss(page, "310", "French knot");
  const knot = await gridPoint(page, 10, 10);
  await page.mouse.click(knot.x, knot.y);
  expect(await count(page, "ed.doc.layers.knots.length")).toBe(1);

  // a partial stitch in the top-left corner of a cell
  await page.locator("[data-entry='1']").click();
  await page.keyboard.press("q");
  const corner = await cellPoint(page, 3, 12), zoom = await count(page, "ed.state.viewport.zoom");
  await page.mouse.click(corner.x - zoom * 0.3, corner.y - zoom * 0.3);
  expect(await count(page, "ed.doc.layers.partials.size")).toBe(1);
  expect(await count(page, "ed.doc.layers.stitches[12 * 60 + 3]")).toBe(0);

  // the eraser pointed at the middle of the first line removes only that line
  await page.keyboard.press("e");
  const mid = await gridPoint(page, 4, 2);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.click(mid.x, mid.y);
  expect(await segments()).toBe(before + 1);
});

test("exports an .oxs that opens again with the same stitches, and a shopping list", async ({ page }) => {
  const oxs = page.waitForEvent("download");
  await fileAction(page, "Export", "Open Cross Stitch file (.oxs)");
  const path = await (await oxs).path();
  expect(readFileSync(path, "utf8")).toContain("<chart>");
  const chooser = page.waitForEvent("filechooser");
  await fileAction(page, "Open file from computer…");
  await (await chooser).setFiles(path);
  await expect(page.getByText(/^Loaded /)).toBeVisible();
  await expect(page.getByTestId("totals")).toContainText("91 full");

  const csv = page.waitForEvent("download");
  await fileAction(page, "Export", "Shopping list (CSV)");
  const text = readFileSync(await (await csv).path(), "utf8");
  expect(text).toContain("321");
  expect(text).toContain("Generated by пташечка");
});

test("exports a stitched preview: bigger cells than the flat one, with the footer line below", async ({ page }) => {
  const size = async (item: string) => {
    const png = page.waitForEvent("download");
    await fileAction(page, "Export", item);
    const d = await png, b = readFileSync(await d.path());
    return { name: d.suggestedFilename(), w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  };
  const flat = await size("Preview image — colour blocks (PNG)"), stitched = await size("Preview image — stitched (PNG)");
  expect(stitched.name).toMatch(/-stitched\.png$/);
  // 60 cells of 28 px with 16 px margins, and 28 px of footer
  expect(stitched).toMatchObject({ w: 60 * 28 + 32, h: 60 * 28 + 32 + 28 });
  expect(flat.w).toBeLessThan(stitched.w);
});
