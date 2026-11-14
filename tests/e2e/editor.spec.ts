import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { cellPoint, editorState, loadFixture, openEditor } from "./helpers";

test.beforeEach(async ({ page }) => openEditor(page));

test("shows the demo pattern with its key and totals", async ({ page }) => {
  await expect(page.locator("[data-entry]")).toHaveCount(8);
  await expect(page.getByTestId("totals")).toContainText("91 full");
});

test("draws with the pencil and undoes with Ctrl/⌘+Z", async ({ page }) => {
  const a = await cellPoint(page, 2, 2), b = await cellPoint(page, 6, 2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => editorState<number>(page, "(ed) => ed.doc.layers.stitches.slice(122, 127).filter(Boolean).length")).toBe(5);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => editorState<number>(page, "(ed) => ed.doc.layers.stitches.slice(122, 127).filter(Boolean).length")).toBe(0);
});

test("adds a key entry through the dialog", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  await page.getByPlaceholder("Search DMC number or name").fill("666");
  await page.locator("[data-id='dmc:666']").click();
  await expect(page.getByTestId("key-preview")).toContainText("DMC 666");
  await page.getByRole("button", { name: "Add to key", exact: true }).click();
  await expect(page.locator("[data-entry]")).toHaveCount(9);
});

test("holding Alt picks an entry from the chart and returns to the previous tool", async ({ page }) => {
  await page.keyboard.press("e");
  const heart = await cellPoint(page, 29, 25);
  await page.keyboard.down("Alt");
  await page.mouse.click(heart.x, heart.y);
  await page.keyboard.up("Alt");
  expect(await editorState<number>(page, "(ed) => ed.state.activeEntry")).toBe(1);
  expect(await editorState<string>(page, "(ed) => ed.state.tool")).toBe("pencil");
});

test("downloads a JSON file that loads back", async ({ page }) => {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save to file" }).click();
  await page.getByText("Stitchwork file (.json)").click();
  const file = await (await download).path();
  const doc = JSON.parse(readFileSync(file, "utf8"));
  expect(doc).toMatchObject({ app: "stitchwork", v: 4, w: 60, h: 60 });
});

test("loads a .json with a reference window that survives a reload", async ({ page }) => {
  await loadFixture(page, "1.json");
  await expect(page.locator("[data-entry]")).toHaveCount(23);
  await expect(page.getByTestId("reference-window")).toHaveCount(1);
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.locator("[data-entry]")).toHaveCount(23);
  await expect(page.getByTestId("reference-window")).toHaveCount(1);
});

test("loads an .oxs file", async ({ page }) => {
  await loadFixture(page, "1.oxs");
  await expect(page.locator("[data-entry]")).toHaveCount(12);
  await expect(page.getByTestId("totals")).toContainText("138 half");
});

test("marks a cell ambiguous with A without touching the chart", async ({ page }) => {
  await expect(page.getByText(/ambiguous/)).toHaveCount(0);
  const c = await cellPoint(page, 3, 3);
  await page.mouse.move(c.x, c.y);
  await page.keyboard.press("a");
  await expect(page.getByText("⚑ 1 ambiguous")).toBeVisible();
  expect(await editorState<number>(page, "(ed) => ed.doc.layers.stitches[3 * 60 + 3]")).toBe(0);
});

test("flips the chart and undoes it in one step", async ({ page }) => {
  const before = await editorState<number>(page, "(ed) => ed.doc.layers.stitches.indexOf(1)");
  await page.getByRole("button", { name: "Transform ▾" }).click();
  await page.getByRole("menuitem", { name: "Flip horizontal" }).click();
  await expect.poll(() => editorState<number>(page, "(ed) => ed.doc.layers.stitches.indexOf(1)")).not.toBe(before);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => editorState<number>(page, "(ed) => ed.doc.layers.stitches.indexOf(1)")).toBe(before);
});

test("runs chart checks", async ({ page }) => {
  await page.getByRole("button", { name: "Check…" }).click();
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(page.getByTestId("checks")).toContainText("of");
});

test("switches to Ukrainian", async ({ page }) => {
  await page.getByLabel("Language").selectOption("uk");
  await expect(page).toHaveURL(/\/uk$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
});

test("the File menu on narrow screens opens above the chart and works", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.getByRole("button", { name: "File ▾" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Load file" }).click();
  await (await chooser).setFiles("tests/fixtures/1.oxs");
  await expect(page.locator("[data-entry]")).toHaveCount(12);
  await page.getByRole("button", { name: "Export ▾" }).click();
  await expect(page.getByRole("menuitem", { name: "Shopping list (CSV)" })).toBeInViewport();
});
