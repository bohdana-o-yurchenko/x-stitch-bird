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

test("feature tips: once after the first image behind the chart, and for the first photo window", async ({ page }) => {
  await page.evaluate(() => ["underlay", "reference"].forEach((t) => localStorage.removeItem(`stitchwork.tipSeen.${t}`)));
  const guide = page.getByTestId("guide");
  let chooser = page.waitForEvent("filechooser");
  await fileAction(page, "Reference pictures", "Image behind the chart…");
  await (await chooser).setFiles("tests/fixtures/underlay.png");
  await expect(guide).toHaveCount(0); // not over the straighten dialog
  await page.getByTestId("straighten").getByRole("button", { name: "Use as it is" }).click();
  await expect(guide).toContainText("Quick image editing");
  await guide.getByRole("button", { name: "Got it" }).click();
  chooser = page.waitForEvent("filechooser");
  await fileAction(page, "Reference pictures", "Photo in a floating window…");
  await (await chooser).setFiles("tests/fixtures/underlay.png");
  await expect(guide).toContainText("A photo in its own window");
  await guide.getByRole("button", { name: "Next" }).click();
  await expect(guide).toContainText("Mark what’s already done");
  await guide.getByRole("button", { name: "Got it" }).click();
  chooser = page.waitForEvent("filechooser");
  await fileAction(page, "Reference pictures", "Photo in a floating window…");
  await (await chooser).setFiles("tests/fixtures/underlay.png");
  await expect(page.getByTestId("reference-window")).toHaveCount(2);
  await expect(guide).toHaveCount(0);
});

test("“What’s new” opens once after an update, never for a brand-new user", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("stitchwork.seenVersion", "0.9.0"));
  await page.reload();
  const dialog = page.getByRole("dialog", { name: "What’s new in пташечка" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Version 1.0.0");
  await dialog.getByRole("button", { name: "Got it" }).click();
  await page.reload();
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await openEditor(page, "en", { firstVisit: true });
  await expect(page.getByTestId("guide")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press("Escape");
  await fileAction(page, "What’s new");
  await expect(dialog).toBeVisible();
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
  // it sits left of the zoom buttons, away from "fit to window", so the two aren't mixed up
  const toggleBox = (await toggle.boundingBox())!, zoomOut = (await page.getByRole("button", { name: "Zoom out" }).boundingBox())!, fit = (await page.getByRole("button", { name: "Fit", exact: false }).last().boundingBox())!;
  expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(zoomOut.x);
  expect(zoomOut.x).toBeLessThan(fit.x);
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
  // the photo's own west side stays put; its east side moves out
  expect(await editorState<number>(page, "(ed) => ed.state.underlay.rect.x")).toBeCloseTo(r.x, 6);
  expect(await editorState<number>(page, "(ed) => ed.state.underlay.rect.w")).toBeGreaterThan(w0);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await editorState<number>(page, "(ed) => ed.state.underlay.rect.w")).toBeCloseTo(w0, 6);
  // 10 px inside the frame's side still takes the side (the cursor says so), and the photo is stretched, not moved
  const f2 = await editorState<{ x: number; y: number; w: number; h: number }>(page, "(ed) => ed.underlay.frame()");
  await page.mouse.move(box.x + f2.x + f2.w / 2, box.y + f2.y + f2.h / 2);
  await expect(page.getByTestId("chart")).toHaveCSS("cursor", "move");
  await page.mouse.move(box.x + f2.x + f2.w - 10, box.y + f2.y + f2.h / 2 + 30);
  await expect(page.getByTestId("chart")).toHaveCSS("cursor", "ew-resize");
  expect(await editorState<string>(page, "(ed) => ed.state.underlayHot")).toBe("e");
  await page.mouse.down();
  await page.mouse.move(box.x + f2.x + f2.w + 20, box.y + f2.y + f2.h / 2 + 30, { steps: 3 });
  await page.mouse.up();
  expect(await editorState<number>(page, "(ed) => ed.state.underlay.rect.x")).toBeCloseTo(r.x, 6);
  expect(await editorState<number>(page, "(ed) => ed.state.underlay.rect.w")).toBeGreaterThan(w0);
  await page.keyboard.press("ControlOrMeta+z");
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

test("the theme is picked in the menu, applies at once and stays after a reload", async ({ page }) => {
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme");
  await page.getByRole("button", { name: /^Menu ▾$/ }).click();
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  // the chart around the fabric follows; floss colours are data and don't
  await expect.poll(() => editorState<string>(page, "(ed) => ed.theme.stageBackground")).toBe("#1a1b22");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: /^Menu ▾$/ }).click();
  await page.getByRole("radio", { name: "Royal blue" }).click();
  await expect(html).toHaveAttribute("data-theme", "royal");
});

test("switching the language keeps the theme, without reloading the page", async ({ page }) => {
  await page.getByRole("button", { name: /^Menu ▾$/ }).click();
  await page.getByRole("radio", { name: "Dark" }).click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => ((window as unknown as { stillHere: boolean }).stillHere = true));
  await page.getByRole("combobox", { name: "Language" }).selectOption("uk");
  await expect(page).toHaveURL(/\/uk$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => editorState<string>(page, "(ed) => ed.theme.stageBackground")).toBe("#1a1b22");
  expect(await page.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)).toBe(true);
  await page.getByRole("button", { name: /^Меню ▾$/ }).click();
  await expect(page.getByRole("radio", { name: "Темна" })).toHaveAttribute("aria-checked", "true");
});

test("key form icons stay visible: white floss on a contrasting tile, line styles in the dark theme", async ({ page }) => {
  // the middle pixel of a canvas, and one near its top-left corner
  const pixels = (canvas: import("@playwright/test").Locator) =>
    canvas.evaluate((c: HTMLCanvasElement) => {
      const g = c.getContext("2d")!, at = (x: number, y: number) => [...g.getImageData(Math.round(x), Math.round(y), 1, 1).data];
      return { mid: at(c.width / 2, c.height / 2), corner: at(c.width * 0.2, c.height * 0.2) };
    });
  await page.getByRole("button", { name: /^Menu ▾$/ }).click();
  await page.getByRole("radio", { name: "Dark" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  const form = page.getByTestId("key-form"), search = form.getByRole("textbox").first();
  await search.fill("B5200");
  await search.press("Enter");
  // half cross in white: a white diagonal on a darker tile, not white on the white fabric
  const half = await pixels(form.getByTestId("stitch-type").getByRole("radio").nth(1).locator("canvas"));
  expect(half.mid.slice(0, 3)).toEqual([255, 255, 255]);
  expect(half.corner[0]).toBeLessThan(160);
  // backstitch line styles are drawn in the theme's text colour: light on dark
  await form.getByRole("radio", { name: "Backstitch" }).click();
  const line = form.getByTestId("symbol-quick").locator("canvas").first();
  const drawn = await line.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 100) max = Math.max(max, d[i]!);
    return max;
  });
  expect(drawn).toBeGreaterThan(200);
});

test("the key form picks a symbol from the quick row or from All…, by group", async ({ page }) => {
  await page.locator("[data-entry]").first().dblclick();
  const form = page.getByTestId("key-form");
  await form.getByTestId("symbol-quick").locator("button").nth(1).click();
  await expect(form.getByTestId("symbol-quick").locator("button").first()).toHaveAttribute("aria-pressed", "true");
  await form.getByTestId("symbol-button").click();
  await page.getByRole("tab", { name: "Decorative" }).click();
  await page.locator("[data-symbol-pop] [data-sym='sym:club']").click();
  await expect(page.locator("[data-symbol-pop]")).toHaveCount(0);
  await expect(form.getByTestId("symbol-quick").locator("[data-sym='sym:club']")).toHaveAttribute("aria-pressed", "true");
  await expect(form.getByTestId("entry-type").getByRole("radio", { name: "Cross stitch" })).toHaveAttribute("aria-checked", "true");
});

test("exports a PDF for Pattern Keeper after explaining what it can't track", async ({ page }) => {
  await fileAction(page, "Export", "PDF for Pattern Keeper");
  // the demo has half crosses, a floss + bead entry, beads, backstitch
  await expect(page.getByTestId("pk-issues").locator("li")).toHaveText([/Half crosses: \d+/, /Floss \+ bead stitches: \d+/, /Beads: \d+/, /Backstitch lines: \d+/]);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Untitled-pattern-pattern-keeper.pdf");
  const pdf = readFileSync((await file.path())!).toString("latin1");
  expect(pdf.startsWith("%PDF-1.7")).toBe(true);
  expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  // only what Pattern Keeper reads: chart + thread list + notes
  expect(pdf.match(/\/Type \/Page /g)).toHaveLength(3);
  expect(pdf).not.toContain("/Subtype /Image");
  if (process.env.PK_PDF_OUT) await file.saveAs(process.env.PK_PDF_OUT);
});

test("exports a PDF chart to print: cover, symbols, symbols on colour, colour with backstitch, key", async ({ page }) => {
  const download = page.waitForEvent("download");
  await fileAction(page, "Export", "PDF chart to print");
  const file = await download;
  expect(file.suggestedFilename()).toBe("Untitled-pattern-chart.pdf");
  const pdf = readFileSync((await file.path())!).toString("latin1");
  expect(pdf.startsWith("%PDF-1.7")).toBe(true);
  // the 60 × 60 demo is 2 × 2 pages per chart: cover + symbol chart 4 + its key + 2 × 4 + key
  expect(pdf.match(/\/Type \/Page /g)).toHaveLength(15);
  expect(pdf).not.toContain("/Subtype /Image");
  if (process.env.CHART_PDF_OUT) await file.saveAs(process.env.CHART_PDF_OUT);
});

test("the selection bar can deselect without changing anything, and clears cells by name", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+a");
  const deselect = page.getByRole("button", { name: "Deselect" });
  await expect(deselect).toBeVisible();
  await deselect.click();
  await expect(deselect).toHaveCount(0);
  expect(await editorState<boolean>(page, "(ed) => !!ed.state.selection")).toBe(false);
  await expect(page.getByTestId("totals")).toContainText("91 full");
  expect(await editorState<boolean>(page, "(ed) => ed.state.canUndo")).toBe(false);
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Clear cells" }).click();
  await expect(page.getByTestId("totals")).toContainText("0 full");
});

test("a long key can be searched, sorted and grouped by type; a short one stays a plain list", async ({ page }) => {
  await expect(page.getByTestId("key-tools")).toHaveCount(0);
  await loadFixture(page, "1.json");
  const tools = page.getByTestId("key-tools");
  await expect(tools).toBeVisible();
  // grouped by type, in the order of the key form
  await expect(page.locator("[data-key-group]").first()).toHaveAttribute("data-key-group", "thread");
  const total = await page.locator("[data-entry]").count();
  await tools.getByRole("searchbox").fill("310");
  await expect(page.locator("[data-entry]").first()).toContainText("DMC 310");
  expect(await page.locator("[data-entry]").count()).toBeLessThan(total);
  await tools.getByRole("searchbox").fill("no such thread");
  await expect(page.getByText("Nothing in the key matches.")).toBeVisible();
  await tools.getByRole("searchbox").fill("");
  // collapsing a group hides its entries; ungrouping shows one plain list again
  await page.locator("[data-key-group=thread] button").first().click();
  expect(await page.locator("[data-entry]").count()).toBeLessThan(total);
  await tools.getByRole("button", { name: "Group by type" }).click();
  await expect(page.locator("[data-key-group]")).toHaveCount(0);
  await expect(page.locator("[data-entry]")).toHaveCount(total);
  await tools.getByRole("combobox").selectOption("number");
  await expect(page.locator("[data-entry]").first()).toContainText("DMC B5200");
});

test("a symbol can be drawn by hand from a few shapes, is kept in the file, and can't get too complex", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator("[data-entry]").first().dblclick();
  await page.getByTestId("symbol-draw").click();
  const drawer = page.getByTestId("symbol-drawer"), use = drawer.getByRole("button", { name: "Use this symbol" });
  await expect(use).toBeDisabled();
  const box = (await page.getByTestId("draw-area").boundingBox())!;
  const drag = async (a: [number, number], b: [number, number]) => {
    await page.mouse.move(box.x + 24 + a[0] * 20, box.y + 24 + a[1] * 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 24 + b[0] * 20, box.y + 24 + b[1] * 20, { steps: 3 });
    await page.mouse.up();
  };
  const shape = (name: string | RegExp) => drawer.getByRole("radio", { name, exact: typeof name === "string" }).click();
  const paint = (name: string) => drawer.getByRole("radiogroup", { name: "Paint" }).getByRole("radio", { name }).click();
  await paint("Outline");
  await drag([1, 1], [11, 11]);
  await shape("Triangle");
  await paint("Filled");
  await drawer.getByRole("radio", { name: "Pointing down" }).click();
  await drag([4, 4], [8, 8]);
  await shape(/^Arrow/);
  await drag([2, 11], [10, 11]);
  await drag([5, 5], [5, 5]); // a click draws nothing
  await expect(page.getByTestId("draw-count")).toHaveText("3 of 8 shapes");
  // lines and arrows can't be outlines, an arrow can't be cut out
  await expect(drawer.getByRole("radiogroup", { name: "Paint" }).getByRole("radio", { name: "Outline" })).toBeDisabled();
  await expect(drawer.getByRole("radiogroup", { name: "Paint" }).getByRole("radio", { name: "Cut out" })).toBeDisabled();
  // the guardrail: after eight shapes the grid takes no more
  for (let n = 0; n < 5; n++) await drag([n, 0], [n + 3, 3]);
  await expect(page.getByTestId("draw-count")).toContainText("8 shapes is the most");
  for (let n = 0; n < 5; n++) await drawer.getByRole("button", { name: "Remove last" }).click();
  await use.click();
  await expect(drawer).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes" }).click();
  const sym = "draw:o11bb;T4488d;a2bab";
  expect(await editorState<string>(page, "(ed) => ed.doc.key[1].sym")).toBe(sym);
  // it travels in the pattern file and comes back
  const download = page.waitForEvent("download");
  await fileAction(page, "Download pattern file (.xbird)");
  const doc = JSON.parse(readFileSync((await (await download).path())!, "utf8"));
  expect(doc.pal[0].sym).toBe(sym);
  await page.reload();
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  expect(await editorState<string>(page, "(ed) => ed.doc.key[1].sym")).toBe(sym);
});

test("a cut-out removes what is under it: filled circle, then a star cut out of it; examples teach it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator("[data-entry]").first().dblclick();
  await page.getByTestId("symbol-draw").click();
  const drawer = page.getByTestId("symbol-drawer");
  await expect(page.getByTestId("draw-tip")).toContainText("draw a Filled circle, then switch to Cut out");
  const box = (await page.getByTestId("draw-area").boundingBox())!;
  const drag = async (a: [number, number], b: [number, number]) => {
    await page.mouse.move(box.x + 24 + a[0] * 20, box.y + 24 + a[1] * 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 24 + b[0] * 20, box.y + 24 + b[1] * 20, { steps: 3 });
    await page.mouse.up();
  };
  const paint = (name: string) => drawer.getByRole("radiogroup", { name: "Paint" }).getByRole("radio", { name }).click();
  // a cut with nothing under it is outlined on the grid, but the symbol can't be used yet
  await paint("Cut out");
  await drawer.getByRole("radio", { name: "Star", exact: true }).click();
  await drag([2, 2], [10, 10]);
  await expect(page.getByTestId("draw-cuts")).toBeVisible();
  await expect(page.getByTestId("draw-count")).toContainText("needs something to cut");
  await expect(drawer.getByRole("button", { name: "Use this symbol" })).toBeDisabled();
  await drawer.getByRole("button", { name: "Clear" }).click();
  await paint("Filled");
  await drawer.getByRole("radio", { name: "Circle", exact: true }).click();
  await drag([0, 0], [12, 12]);
  await paint("Cut out");
  await drawer.getByRole("radio", { name: "Star", exact: true }).click();
  await drag([2, 2], [10, 10]);
  await drawer.getByRole("button", { name: "Use this symbol" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  expect(await editorState<string>(page, "(ed) => ed.doc.key[1].sym")).toBe("draw:O00cc;!P22aa");
  // an example loads a ready drawing to look at and change
  await page.locator("[data-entry]").first().dblclick();
  await page.getByTestId("symbol-draw").click();
  await page.locator("[data-example=squareHole]").click();
  await expect(page.getByTestId("draw-count")).toHaveText("2 of 8 shapes");
  await drawer.getByRole("button", { name: "Use this symbol" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  expect(await editorState<string>(page, "(ed) => ed.doc.key[1].sym")).toBe("draw:S00cc;!O3399");
});

test("which side-panel sections are open is remembered after a reload", async ({ page }) => {
  const section = (id: string) => page.locator(`[data-section=${id}]`);
  await expect(section("totals")).toHaveAttribute("open", "");
  await expect(section("fabric")).not.toHaveAttribute("open", "");
  await section("totals").locator("summary").click();
  await section("fabric").locator("summary").click();
  await expect(section("totals")).not.toHaveAttribute("open", "");
  // the browser reports a toggle a moment after the click
  await expect.poll(() => page.evaluate(() => localStorage.getItem("stitchwork.sections"))).toBe('{"totals":false,"fabric":true}');
  await page.reload();
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  await expect(section("totals")).not.toHaveAttribute("open", "");
  await expect(section("fabric")).toHaveAttribute("open", "");
});

test("chart checks are opt-in, run on demand, and their findings can be stepped through and ignored", async ({ page }) => {
  await page.evaluate(() => {
    const ed = (window as unknown as { __stitchwork: { doc: { w: number; layers: { stitches: Uint16Array } }; changed(): void } }).__stitchwork;
    ed.doc.layers.stitches[25 * ed.doc.w + 27] = 0; // a hole inside the heart
    ed.changed();
  });
  const panel = page.getByTestId("checks-panel");
  await panel.locator("summary").click();
  await expect(page.getByTestId("checks-run")).toBeDisabled();
  await panel.getByRole("checkbox", { name: "Empty cells" }).check();
  await page.getByTestId("checks-run").click();
  const results = page.getByTestId("checks-results");
  await expect(results.locator("[data-check-group=holes] li > button:first-child")).toHaveText(["Column 28, row 26"]);
  await page.getByRole("button", { name: "Next finding" }).click();
  await expect(page.getByTestId("checks-position")).toHaveText("1 / 1");
  // the choice is remembered; the results say when the chart changed
  await page.keyboard.press("p");
  const box = (await page.getByTestId("chart").boundingBox())!;
  await page.mouse.click(box.x + 60, box.y + 60);
  await expect(results.getByText("The chart has changed")).toBeVisible();
  await results.getByRole("button", { name: "Ignore for now" }).click();
  await expect(results.getByText("Nothing found.")).toBeVisible();
  // the section stays open and the chosen check stays chosen after a reload
  await page.reload();
  await expect(page.getByTestId("checks-panel").getByRole("checkbox", { name: "Empty cells" })).toBeChecked();
});

test("finds symbols in one 10 × 10 block of the photo behind the chart, and fills them on Accept", async ({ page }) => {
  // a 10 × 10 block printed at 30 px a cell: crosses and rings in the top row, the first of each already stitched
  const keys = await page.evaluate(async () => {
    type Ed = {
      commands: { run(id: string, a: unknown): Promise<void> };
      doc: { key: ({ t: string } | null)[]; layers: { stitches: Uint16Array } };
      underlay: { addFromFile(f: File): Promise<void>; update(patch: object): void; setBehind(b: boolean): void };
      closeDialog(): void;
      changed(): void;
    };
    const ed = (window as unknown as { __stitchwork: Ed }).__stitchwork;
    await ed.commands.run("file.create", { name: "Match", w: 20, h: 20, count: 14, keepKey: true });
    const [a = 0, b = 0] = ed.doc.key.flatMap((e, i) => (e?.t === "thread" ? [i] : []));
    const c = document.createElement("canvas");
    c.width = c.height = 300;
    const g = c.getContext("2d")!;
    g.fillStyle = "#f4f1ea";
    g.fillRect(0, 0, 300, 300);
    g.strokeStyle = "#222";
    g.lineWidth = 3;
    ["x", "o", "x", "o", "x", "", "o"].forEach((s, i) => {
      const x = i * 30 + 15, y = 15;
      g.beginPath();
      if (s === "x") { g.moveTo(x - 9, y - 9); g.lineTo(x + 9, y + 9); g.moveTo(x + 9, y - 9); g.lineTo(x - 9, y + 9); }
      if (s === "o") g.arc(x, y, 8, 0, Math.PI * 2);
      g.stroke();
    });
    const blob = await new Promise<Blob>((ok) => c.toBlob((x) => ok(x!), "image/png"));
    await ed.underlay.addFromFile(new File([blob], "chart.png", { type: "image/png" }));
    ed.closeDialog();
    ed.underlay.update({ rect: { x: 0, y: 0, w: 10, h: 10 } });
    ed.underlay.setBehind(true);
    ed.doc.layers.stitches[0] = a;
    ed.doc.layers.stitches[1] = b;
    ed.changed();
    return [a, b];
  });
  await expect.poll(() => editorState<boolean>(page, "(ed) => !!ed.state.underlayImage")).toBe(true);
  await page.keyboard.press("Shift+F");
  await expect(page.getByTestId("match-bar")).toContainText("Click the 10 × 10 block");
  const p = await cellPoint(page, 5, 5);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId("match-count")).toHaveText("4 symbols found");
  await page.getByTestId("match-accept").click();
  await expect(page.getByTestId("match-bar")).toHaveCount(0);
  const [a, b] = keys;
  expect(await editorState<number[]>(page, "(ed) => [...ed.doc.layers.stitches.slice(0, 8)]")).toEqual([a, b, a, b, a, 0, b, 0]);
  // what it learned is saved with the pattern
  expect(await editorState<number>(page, "(ed) => Object.keys(ed.doc.samples).length")).toBe(2);
});

test("a backstitch has its own line colour for the Symbols view and the print PDF: black, a vibrant one, or any", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  const form = page.getByTestId("key-form");
  await form.getByRole("radio", { name: "Backstitch" }).click();
  const ink = form.getByTestId("line-ink");
  await expect(ink.getByRole("combobox", { name: "Line colour" })).toHaveValue("black");
  await ink.getByRole("combobox", { name: "Line colour" }).selectOption({ label: "Red" });
  await form.getByRole("button", { name: "Add to key", exact: true }).click();
  const added = () => editorState<string | undefined>(page, "(ed) => ed.doc.key[ed.doc.key.length - 1].ink");
  expect(await added()).toBe("#E6194B");
  // your own colour, when editing
  const row = page.locator("[data-entry]").last();
  await row.hover();
  await row.getByRole("button", { name: "Edit entry" }).click();
  await form.getByTestId("line-ink").getByLabel("Your own colour").fill("#123456");
  await expect(form.getByTestId("line-ink").getByRole("combobox")).toHaveValue("own");
  await form.getByRole("button", { name: "Save changes" }).click();
  expect(await added()).toBe("#123456");
  // only backstitch has it
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  await expect(form.getByTestId("line-ink")).toHaveCount(0);
});
