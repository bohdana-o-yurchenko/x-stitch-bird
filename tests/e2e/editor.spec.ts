import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { cellPoint, editorState, fileAction, loadFixture, openEditor } from "./helpers";

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
  await fileAction(page, "Download pattern file (.json)");
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

test("switches to Ukrainian", async ({ page }) => {
  await page.getByLabel("Language").selectOption("uk");
  await expect(page).toHaveURL(/\/uk$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
});

test("the File menu opens above the chart, with submenus", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  const chooser = page.waitForEvent("filechooser");
  await fileAction(page, "Open file from computer…");
  await (await chooser).setFiles("tests/fixtures/1.oxs");
  await expect(page.locator("[data-entry]")).toHaveCount(12);
  await page.getByRole("button", { name: "File ▾" }).click();
  await page.getByRole("menuitem", { name: /^Export/ }).hover();
  await expect(page.getByRole("menuitem", { name: "Shopping list (CSV)" })).toBeInViewport();
});

test("shows what you are drawing with, including held tools", async ({ page }) => {
  const name = page.getByTestId("current-tool-name");
  await expect(name).toContainText("Draw");
  await page.keyboard.press("e");
  await expect(name).toContainText("Eraser");
  await page.keyboard.down("Alt");
  await expect(name).toContainText("Picker");
  await page.keyboard.up("Alt");
  await expect(name).toContainText("Eraser");
});

test("tooltips appear quickly and the native one is suppressed", async ({ page }) => {
  const draw = page.getByRole("button", { name: "Draw (P)" });
  await draw.hover();
  await expect(page.getByTestId("tooltip")).toHaveText("Draw (P)", { timeout: 900 });
  await page.mouse.move(5, 500);
  await expect(page.getByTestId("tooltip")).toHaveCount(0);
  await expect(draw).toHaveAttribute("title", "Draw (P)");
});

test("the side panel scrolls when its sections don't fit", async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 640 });
  await page.getByText("Fabric & size").click();
  const side = page.locator("aside");
  expect(await side.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.getByText("toward each thread").scrollIntoViewIfNeeded();
  await expect(page.getByText("toward each thread")).toBeInViewport();
});

test("brush size takes one click", async ({ page }) => {
  await page.getByRole("button", { name: "Brush 3×3" }).click();
  expect(await editorState<number>(page, "(ed) => ed.state.brush")).toBe(3);
});

test("the side panel hides and shows from the header button", async ({ page }) => {
  const toggle = page.getByTestId("panel-toggle");
  await toggle.click();
  await expect(page.locator("aside")).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(page.locator("aside")).toBeVisible();
});

test("the side panel can be resized and keeps its width", async ({ page }) => {
  const aside = page.locator("aside");
  const before = (await aside.boundingBox())!.width;
  const handle = (await page.getByTestId("side-resizer").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 200);
  await page.mouse.down();
  await page.mouse.move(handle.x - 120, handle.y + 200, { steps: 4 });
  await page.mouse.up();
  const after = (await aside.boundingBox())!.width;
  expect(after).toBeGreaterThan(before + 100);
  await page.reload();
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  expect((await aside.boundingBox())!.width).toBeCloseTo(after, 0);
});

test("the i button lists the keyboard shortcuts on hover", async ({ page }) => {
  await page.getByRole("button", { name: "Keyboard shortcuts" }).hover();
  const list = page.getByTestId("shortcuts");
  await expect(list).toBeVisible();
  await expect(list).toContainText("Fit to screen");
  await expect(list.getByText("⇧R")).toBeVisible();
});

test("the status bar shows the colour being drawn with; the view switch sits with the zoom", async ({ page }) => {
  await expect(page.getByTestId("status-entry")).toContainText("DMC 321");
  await page.keyboard.press("2");
  await expect(page.getByTestId("status-entry")).toContainText("DMC 498");
  await page.getByRole("group", { name: "Chart view" }).getByRole("button", { name: "Symbols" }).click();
  expect(await editorState<string>(page, "(ed) => ed.state.view")).toBe("symbols");
});

test("opens in Ukrainian by default", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/uk$/);
});

test("puts a reference image behind the chart and keeps it after a reload", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await fileAction(page, "Reference pictures", "Image behind the chart…");
  await (await chooser).setFiles("tests/fixtures/underlay.png");
  const panel = page.getByTestId("underlay-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByText(/Editing the image behind the chart/)).toBeVisible();
  const a = await cellPoint(page, 30, 30), b = await cellPoint(page, 33, 30);
  const before = await editorState<number>(page, "(ed) => ed.state.underlay.rect.x");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.up();
  expect(await editorState<number>(page, "(ed) => ed.state.underlay.rect.x")).toBeCloseTo(before + 3, 0);
  await panel.getByLabel("Behind stitches").check();
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.getByTestId("underlay-panel").getByLabel("Behind stitches")).toBeChecked();
  const download = page.waitForEvent("download");
  await fileAction(page, "Download pattern file (.json)");
  const doc = JSON.parse(readFileSync(await (await download).path(), "utf8"));
  expect(doc.underlay).toMatchObject({ behind: true, imageW: 40, imageH: 20 });
  // the alignment pad works while the image is behind the stitches
  const pad = page.getByTestId("underlay-pad");
  const w = doc.underlay.rect.w as number;
  await pad.getByRole("button", { name: "Width larger" }).click();
  expect(await editorState<number>(page, "(ed) => ed.state.underlay.rect.w")).toBeCloseTo(w + 0.5, 5);
});
