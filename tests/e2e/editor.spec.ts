import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { cellPoint, editorState, fileAction, fixtureDataUrl, loadFixture, openEditor } from "./helpers";

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

test("adds a key entry through the form in the side panel", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  await page.getByPlaceholder("Search DMC number or name").fill("666");
  await page.locator("[data-id='dmc:666']").click();
  await expect(page.getByTestId("key-preview")).toContainText("DMC 666");
  await page.getByRole("button", { name: "Add to key", exact: true }).click();
  await expect(page.getByTestId("key-form")).toHaveCount(0);
  await expect(page.locator("[data-entry]")).toHaveCount(9);
});

test("the key form leaves the chart free: no modal, typed numbers fill the floss lines, no shortcuts fire", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  const form = page.getByTestId("key-form");
  await expect(page.locator("[aria-modal=true]")).toHaveCount(0);
  await form.getByRole("button", { name: "Blend" }).click();
  // typed into the search; Enter fills the highlighted line and moves on to the next
  for (const code of ["3865", "ecru"]) {
    await page.keyboard.type(code);
    await page.keyboard.press("Enter");
  }
  await expect(form.getByTestId("colour-line")).toHaveText([/3865/, /Ecru/]);
  expect(await editorState<string>(page, "(ed) => ed.state.tool")).toBe("pencil");
  await form.getByRole("button", { name: "Add to key", exact: true }).click();
  await expect(page.locator("[data-entry]")).toHaveCount(9);
  await expect(page.locator("[data-entry]").last()).toContainText("3865");
});

test("deleting a key entry always asks and names it, used on the chart or not", async ({ page }) => {
  const unused = page.locator("[data-entry]").last();
  await unused.hover();
  await unused.getByRole("button", { name: "Delete entry" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Delete DMC 3865 from the key?");
  await expect(dialog).toContainText("isn’t used on the chart");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("[data-entry]")).toHaveCount(8);
  const used = page.locator("[data-entry]").first();
  await used.hover();
  await used.getByRole("button", { name: "Delete entry" }).click();
  await expect(dialog).toContainText("on the chart 43 times");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator("[data-entry]")).toHaveCount(7);
});

test("the edit and delete buttons of a key entry show their own names", async ({ page }) => {
  const row = page.locator("[data-entry]").first();
  await row.hover();
  await row.getByRole("button", { name: "Edit entry" }).hover();
  await expect(page.getByTestId("tooltip")).toHaveText("Edit entry");
  await row.getByRole("button", { name: "Delete entry" }).hover();
  await expect(page.getByTestId("tooltip")).toHaveText("Delete entry");
});

test("shows the time spent on the pattern, read-only, in Pattern info and Versions", async ({ page }) => {
  await page.evaluate(() => void ((window as unknown as { __stitchwork: { doc: { spent: number } } }).__stitchwork.doc.spent = (2 * 60 + 5) * 60_000));
  await fileAction(page, "Pattern info");
  const time = page.getByTestId("time-spent");
  await expect(time).toContainText("Total time spent on this pattern");
  await expect(time).toContainText("2 h 5 min");
  await expect(time.locator("input")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await fileAction(page, "Versions");
  await expect(page.getByTestId("time-spent")).toContainText("2 h 5 min");
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

test("downloads a .xbird pattern file that loads back", async ({ page }) => {
  const download = page.waitForEvent("download");
  await fileAction(page, "Download pattern file (.xbird)");
  expect((await download).suggestedFilename()).toMatch(/\.xbird$/);
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
  await page.getByRole("button", { name: "Menu ▾" }).click();
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

test("straightens a photo by its 4 corners and keeps it after a reload", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await fileAction(page, "Reference pictures", "Image behind the chart…");
  await (await chooser).setFiles("tests/fixtures/underlay.png");
  const dialog = page.getByTestId("straighten");
  await expect(dialog).toBeVisible();
  // drag the top-left corner a little; the predicted grid follows
  const box = (await page.getByTestId("straighten-canvas").boundingBox())!;
  await dialog.getByLabel("columns").fill("20");
  await dialog.getByLabel("rows").fill("10");
  await dialog.getByLabel("column", { exact: true }).fill("5");
  await dialog.getByLabel("row", { exact: true }).fill("3");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await dialog.getByRole("button", { name: "Straighten" }).click();
  await expect(dialog).toHaveCount(0);
  const u = await editorState<{ rect: object; image: string; straighten: { cols: number; source: string } }>(page, "(ed) => ed.state.underlay");
  expect(u.rect).toEqual({ x: 4, y: 2, w: 20, h: 10 });
  expect(u.image).toMatch(/^img:/);
  expect(u.straighten.source).not.toBe(u.image);
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  await expect.poll(() => editorState<boolean>(page, "(ed) => !!ed.state.underlayImage")).toBe(true);
  expect(await editorState<object>(page, "(ed) => ed.state.underlay.rect")).toEqual({ x: 4, y: 2, w: 20, h: 10 });
});

test("moves pictures stored the old way (inline data URLs) into the image store", async ({ page }) => {
  const id = await editorState<string>(page, "(ed) => ed.doc.id");
  const png = fixtureDataUrl("underlay.png");
  await page.evaluate(async ([pid, src]) => {
    const db = await new Promise<IDBDatabase>((ok, ko) => { const r = indexedDB.open("stitchwork"); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
    await new Promise((ok) => {
      const tx = db.transaction("underlays", "readwrite");
      tx.objectStore("underlays").put({ src, imageW: 40, imageH: 20, crop: { x: 0, y: 0, w: 40, h: 20 }, rect: { x: 1, y: 1, w: 40, h: 20 }, opacity: 0.5, behind: true, visible: true, tool: "move" }, pid);
      tx.oncomplete = ok;
    });
    db.close();
  }, [id, png] as const);
  await page.reload();
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  await expect.poll(() => editorState<boolean>(page, "(ed) => !!ed.state.underlayImage")).toBe(true);
  expect(await editorState<string>(page, "(ed) => ed.state.underlay.image")).toMatch(/^img:/);
});

test("highlighting fades every entry except the selected one", async ({ page }) => {
  const toggle = page.getByTestId("highlight-toggle");
  await page.keyboard.press("v");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  expect(await editorState<boolean>(page, "(ed) => ed.state.highlight")).toBe(false);
});

test("deleting a saved pattern asks first", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+s");
  await fileAction(page, "Open saved pattern…");
  const trash = page.getByRole("button", { name: /^Delete “/ });
  await trash.click();
  const confirm = page.getByTestId("confirm-delete");
  await expect(confirm).toContainText("can’t be undone");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(trash).toBeVisible();
  await trash.click();
  await page.getByTestId("confirm-delete").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No saved patterns", { exact: false })).toBeVisible();
});

test("the quick-start guide opens on the first visit only, highlights what it explains, and reopens from the menu", async ({ page }) => {
  await openEditor(page, "uk", { firstVisit: true });
  const guide = page.getByTestId("guide");
  await expect(guide).toContainText("перенабір");
  await guide.getByRole("button", { name: "Далі" }).click();
  await expect(guide).toContainText("1. Нова схема");
  // the step opens the menu on the option it talks about
  await expect(page.getByRole("menuitem", { name: /^Порожня схема/ })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(guide).toContainText("2. Ключ");
  await expect(page.getByRole("menuitem", { name: /^Фото в плаваючому вікні/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  await expect(page.getByRole("menuitem")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  await expect(guide).toHaveCount(0);
  await fileAction(page, "Як зробити перенабір");
  await expect(guide).toBeVisible();
  for (let i = 0; i < 10; i++) await guide.getByRole("button", { name: /^(Далі|До вишивання)$/ }).click();
  await expect(guide).toHaveCount(0);
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
  await page.getByTestId("straighten").getByRole("button", { name: "Use as it is" }).click();
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
  await fileAction(page, "Download pattern file (.xbird)");
  const doc = JSON.parse(readFileSync(await (await download).path(), "utf8"));
  expect(doc.underlay).toMatchObject({ behind: true, imageW: 40, imageH: 20 });
  // the edit toggle by the zoom; zoomed in, the edit frame stretches the photo with one side pinned
  const toggle = page.getByTestId("underlay-edit");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const r = doc.underlay.rect as { x: number; y: number; w: number; h: number };
  await page.evaluate(([cx, cy]) => {
    const ed = (window as unknown as { __stitchwork: { viewport: { width: number; height: number }; store: { setState(s: object): void } } }).__stitchwork;
    const z = 40;
    ed.store.setState({ viewport: { zoom: z, offX: (ed.viewport.width + 26) / 2 - 26 - cx! * z, offY: (ed.viewport.height + 26) / 2 - 26 - cy! * z } });
  }, [r.x + r.w / 2, r.y + r.h / 2]);
  const frame = await editorState<{ x: number; y: number; w: number; h: number }>(page, "(ed) => ed.underlay.frame()");
  const box = (await page.getByTestId("chart").boundingBox())!;
  const w0 = await editorState<number>(page, "(ed) => ed.state.underlay.rect.w");
  await page.mouse.move(box.x + frame.x + frame.w, box.y + frame.y + frame.h / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + frame.x + frame.w + 40, box.y + frame.y + frame.h / 2, { steps: 4 });
  await page.mouse.up();
  expect(await editorState<number>(page, "(ed) => ed.state.underlay.rect.w")).toBeCloseTo(w0 * (frame.w + 40) / frame.w, 3);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await editorState<number>(page, "(ed) => ed.state.underlay.rect.w")).toBeCloseTo(w0, 6);
  // a slight turn with ] and the side panel's angle field; 0° resets
  await page.keyboard.press("]");
  await page.keyboard.press("]");
  await expect(page.getByTestId("underlay-rotation")).toHaveValue("0.4");
  await page.getByTestId("underlay-rotation").fill("-1.5");
  expect(await editorState<number>(page, "(ed) => ed.state.underlay.rotation")).toBeCloseTo(-1.5, 6);
  await page.getByRole("button", { name: "0°" }).click();
  expect(await editorState<number>(page, "(ed) => ed.state.underlay.rotation")).toBe(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
