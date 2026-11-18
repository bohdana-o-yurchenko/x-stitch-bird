import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { cellPoint, editorState, fileAction, fixture, fixtureDataUrl, gridPoint, loadFixture, menuAction, openAppMenu, openEditor, exportAction, saveFile } from "./helpers";

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

test("the time spent: in Versions, and small in Totals; read-only. Pattern info's fields are saved as you leave them", async ({ page }) => {
  await page.evaluate(() => {
    const ed = (window as unknown as { __stitchwork: { doc: { spent: number }; changed(): void } }).__stitchwork;
    ed.doc.spent = (2 * 60 + 5) * 60_000;
    ed.changed();
  });
  await expect(page.getByTestId("totals").getByTestId("time-spent-small")).toContainText("Time spent: 2 h 5 min");
  await page.getByTestId("rail-versions").click();
  const time = page.getByTestId("versions-panel").getByTestId("time-spent");
  await expect(time).toContainText("Total time spent on this pattern");
  await expect(time).toContainText("2 h 5 min");
  await expect(time.locator("input")).toHaveCount(0);
  await page.getByTestId("rail-info").click();
  const info = page.getByTestId("info-panel");
  await expect(info.getByTestId("time-spent")).toHaveCount(0);
  await info.getByLabel("Author (designer)").fill("A. Designer");
  await info.getByLabel("Author (designer)").press("Enter");
  await expect.poll(() => editorState<string>(page, "(ed) => ed.doc.meta.designer")).toBe("A. Designer");
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
  await saveFile(page, "xbird");
  expect((await download).suggestedFilename()).toMatch(/\.xbird$/);
  const file = await (await download).path();
  const doc = JSON.parse(readFileSync(file, "utf8"));
  expect(doc).toMatchObject({ app: "stitchwork", v: 4, w: 60, h: 60 });
});

test("the work file and the .oxs ask first, saying which is which and where the PDFs are; export lives in Pattern ▾ (SPEC §15.45)", async ({ page }) => {
  await expect(page.getByRole("button", { name: /^Print & share$/ })).toHaveCount(0);
  let downloads = 0;
  page.on("download", () => downloads++);
  const dialog = page.getByRole("dialog");
  // the item asked for is the main button; Cancel saves nothing
  await fileAction(page, "Download work file (.xbird)");
  await expect(dialog.getByTestId("file-choice")).toContainText("Pattern ▾ → Export");
  await expect(dialog.getByTestId("file-choice")).toContainText("PDF for Pattern Keeper");
  await expect(dialog.locator("button[class*=primary]")).toHaveText("Save .xbird");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await exportAction(page, "Open Cross Stitch file (.oxs)");
  await expect(dialog.locator("button[class*=primary]")).toHaveText("Save .oxs");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(downloads).toBe(0);
  // the PDFs are a submenu away
  await menuAction(page, "pattern", "Export");
  await expect(page.getByRole("menuitem", { name: /^PDF chart to print/ })).toBeVisible();
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
  await openAppMenu(page);
  await page.getByTestId("language").getByRole("radio", { name: "Українська" }).click();
  await expect(page).toHaveURL(/\/uk$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
});

test("Pattern ▾ › Export opens above the chart, with submenus", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  const chooser = page.waitForEvent("filechooser");
  await fileAction(page, "Open work file…");
  await (await chooser).setFiles("tests/fixtures/1.oxs");
  await expect(page.locator("[data-entry]")).toHaveCount(12);
  await menuAction(page, "pattern", "Export");
  await page.getByRole("menuitem", { name: /^Chart images/ }).hover();
  await expect(page.getByRole("menuitem", { name: "Chart image — symbols only, for printing (PNG)" })).toBeInViewport();
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
  // shown after 0.6 s (the browser's own takes longer); on a busy machine the toolbar may still settle under the
  // pointer just after loading — then pointed at again
  await expect(async () => {
    await draw.hover();
    await expect(page.getByTestId("tooltip")).toHaveText("Draw (P)", { timeout: 1500 });
  }).toPass({ timeout: 8000 });
  await page.mouse.move(5, 500);
  await expect(page.getByTestId("tooltip")).toHaveCount(0);
  await expect(draw).toHaveAttribute("title", "Draw (P)");
});

test("on a short screen the open tool scrolls on its own, below the key", async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 640 });
  const note = page.locator("[data-section=totals]").getByText("toward each thread");
  await note.scrollIntoViewIfNeeded();
  await expect(note).toBeInViewport();
  // the key stays where it was
  await expect(page.locator("[data-entry]").first()).toBeInViewport();
});

test("straightens a photo by its 4 corners and keeps it after a reload", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("rail-references").click();
  await page.getByTestId("underlay-add").click();
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
  // a stitch: the demo becomes a pattern of its own, kept over a reload
  const cell = await cellPoint(page, 2, 2);
  await page.mouse.click(cell.x, cell.y);
  await page.waitForTimeout(800);
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
  // photo windows are added in References: the step points at its icon in the side panel's bar
  await expect(page.getByTestId("rail-references")).toBeVisible();
  await expect(page.getByRole("menuitem")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  await expect(page.getByRole("menuitem")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  await expect(guide).toHaveCount(0);
  await menuAction(page, "app", "Як зробити перенабір");
  await expect(guide).toBeVisible();
  for (let i = 0; i < 4; i++) await guide.getByRole("button", { name: "Далі" }).click();
  await expect(guide).toContainText("4. Автозаповнення");
  await expect(page.locator('[data-guide="tool-autofill"]')).toBeVisible();
  for (let i = 0; i < 7; i++) await guide.getByRole("button", { name: /^(Далі|До вишивання)$/ }).click();
  await expect(guide).toHaveCount(0);
});

test("feature tips: once after the first image behind the chart, and for the first photo window", async ({ page }) => {
  await page.evaluate(() => ["underlay", "reference"].forEach((t) => localStorage.removeItem(`stitchwork.tipSeen.${t}`)));
  const guide = page.getByTestId("guide");
  let chooser = page.waitForEvent("filechooser");
  await page.getByTestId("rail-references").click();
  await page.getByTestId("underlay-add").click();
  await (await chooser).setFiles("tests/fixtures/underlay.png");
  await expect(guide).toHaveCount(0); // not over the straighten dialog
  await page.getByTestId("straighten").getByRole("button", { name: "Use as it is" }).click();
  await expect(guide).toContainText("Quick image editing");
  await guide.getByRole("button", { name: "Got it" }).click();
  chooser = page.waitForEvent("filechooser");
  await page.getByTestId("ref-window-add").click();
  await (await chooser).setFiles("tests/fixtures/underlay.png");
  await expect(guide).toContainText("A photo, scan or PDF in its own window");
  await guide.getByRole("button", { name: "Next" }).click();
  await expect(guide).toContainText("Mark what’s already done");
  await guide.getByRole("button", { name: "Got it" }).click();
  chooser = page.waitForEvent("filechooser");
  await page.getByTestId("ref-window-add").click();
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
  await menuAction(page, "app", "What’s new");
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

test("the keyboard button left of ☰ lists every shortcut, under it; again or Esc closes it", async ({ page }) => {
  const button = page.getByTestId("shortcuts-button");
  await button.click();
  const list = page.getByTestId("shortcuts");
  await expect(list).toBeVisible();
  await expect(list).toContainText("Fit to screen");
  await expect(list.getByText("⇧R")).toBeVisible();
  expect((await list.boundingBox())!.y).toBeGreaterThan((await button.boundingBox())!.y);
  await button.click();
  await expect(list).toHaveCount(0);
  await button.click();
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
});

test("☰ ▸ Something went wrong? — where to write, what helps, the terms of use (SPEC §15.49)", async ({ page, context }) => {
  await page.getByRole("button", { name: /^(More|Ще)$/ }).click();
  const tab = context.waitForEvent("page");
  await page.getByRole("menuitem", { name: /^Something went wrong\?/ }).click();
  const support = await tab;
  await expect(support.getByTestId("support")).toContainText("bohdana.o.yurchenko@gmail.com");
  await expect(support.getByTestId("support")).toContainText("Many charts are protected by copyright");
  await expect(support.getByTestId("support-mail")).toHaveAttribute("href", /^mailto:bohdana\.o\.yurchenko@gmail\.com\?subject=/);
});

test("the installed app: each language's manifest opens in that language, with its icons; the page names it (SPEC §15.50)", async ({ page }) => {
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/en/manifest.webmanifest");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f4efe6");
  for (const locale of ["en", "uk"]) {
    const res = await page.request.get(`/${locale}/manifest.webmanifest`);
    expect(res.headers()["content-type"]).toContain("application/manifest+json");
    const m = (await res.json()) as { id: string; name: string; start_url: string; icons: { src: string }[] };
    expect([m.id, m.name, m.start_url]).toEqual(["/", "пташечка", `/${locale}`]);
    for (const icon of m.icons) expect((await page.request.get(icon.src)).headers()["content-type"]).toBe("image/png");
  }
});

test("☰ ▸ Install the app… on a laptop: what it gives, that it still needs the internet; Install shows the browser's prompt — none on a narrow screen (SPEC §15.50)", async ({ page }) => {
  const install = page.getByRole("menuitem", { name: /^Install the app…/ });
  const dialog = page.getByTestId("install-app");
  // Chrome before it offers its prompt: its own install button
  await openAppMenu(page);
  await install.click();
  await expect(dialog).toContainText("It still needs the internet to open.");
  await expect(dialog).toContainText("install button at the right end of the address bar");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  // the prompt offered (as Chrome does, once): Install shows it
  await page.evaluate(() => {
    const e = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => void ((window as unknown as { prompted: boolean }).prompted = true),
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(e);
  });
  await openAppMenu(page);
  await install.click();
  await expect(dialog).not.toContainText("address bar");
  await page.getByRole("button", { name: "Install", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true);
  await expect(dialog).toHaveCount(0);

  await page.setViewportSize({ width: 900, height: 900 });
  await openAppMenu(page);
  await expect(page.getByRole("menuitem", { name: /^Source code/ })).toBeVisible();
  await expect(install).toHaveCount(0);
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
  await page.getByTestId("rail-references").click();
  await page.getByTestId("underlay-add").click();
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
  await saveFile(page, "xbird");
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
  // the photo's top-left corner in view, the rest beyond: its side handles are out of reach, so the frame is there
  const u = await editorState<{ x: number; y: number }>(page, "(ed) => ed.state.underlay.rect");
  await page.evaluate(([x, y]) => (window as unknown as { __stitchwork: { store: { setState(s: object): void } } }).__stitchwork.store.setState({ viewport: { zoom: 40, offX: 40 - x! * 40, offY: 40 - y! * 40 } }), [u.x, u.y]);
  expect(await editorState(page, "(ed) => ed.underlay.frame()")).not.toBeNull();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("the theme is picked in the menu, applies at once and stays after a reload", async ({ page }) => {
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme");
  await openAppMenu(page);
  await page.getByRole("radio", { name: "550", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "550", exact: true })).toHaveAttribute("aria-checked", "true");
  // the chart around the fabric follows; floss colours are data and don't
  await expect.poll(() => editorState<string>(page, "(ed) => ed.theme.stageBackground")).toBe("#1a1b22");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await openAppMenu(page);
  await page.getByRole("radio", { name: "797", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "royal");
});

test("switching the language keeps the theme, without reloading the page", async ({ page }) => {
  await openAppMenu(page);
  await page.getByRole("radio", { name: "550", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => ((window as unknown as { stillHere: boolean }).stillHere = true));
  await openAppMenu(page);
  await page.getByTestId("language").getByRole("radio", { name: "Українська" }).click();
  await expect(page).toHaveURL(/\/uk$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => editorState<string>(page, "(ed) => ed.theme.stageBackground")).toBe("#1a1b22");
  expect(await page.evaluate(() => (window as unknown as { stillHere?: boolean }).stillHere)).toBe(true);
  await openAppMenu(page);
  await expect(page.getByRole("radio", { name: "550", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("key form icons stay visible: white floss on a contrasting tile, line styles in the dark theme", async ({ page }) => {
  // the middle pixel of a canvas, and one near its top-left corner
  const pixels = (canvas: import("@playwright/test").Locator) =>
    canvas.evaluate((c: HTMLCanvasElement) => {
      const g = c.getContext("2d")!, at = (x: number, y: number) => [...g.getImageData(Math.round(x), Math.round(y), 1, 1).data];
      return { mid: at(c.width / 2, c.height / 2), corner: at(c.width * 0.2, c.height * 0.2) };
    });
  await openAppMenu(page);
  await page.getByRole("radio", { name: "550", exact: true }).click();
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
  await exportAction(page, "PDF for Pattern Keeper");
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
  await exportAction(page, "PDF chart to print");
  const file = await download;
  expect(file.suggestedFilename()).toBe("Untitled-pattern-chart.pdf");
  const pdf = readFileSync((await file.path())!).toString("latin1");
  expect(pdf.startsWith("%PDF-1.7")).toBe(true);
  // the 60 × 60 demo is 2 × 2 pages per chart: cover + symbol chart 4 + its key + 2 × 4 + key
  expect(pdf.match(/\/Type \/Page /g)).toHaveLength(15);
  expect(pdf).not.toContain("/Subtype /Image");
  if (process.env.CHART_PDF_OUT) await file.saveAs(process.env.CHART_PDF_OUT);
});

test("New ▸ From a PDF chart… says first what it is; this app's PDF comes back as the same pattern, a new one; another PDF can't be read (SPEC §15.46)", async ({ page }) => {
  const download = page.waitForEvent("download");
  await exportAction(page, "PDF chart to print");
  const pdf = (await (await download).path())!;
  const content = "(ed) => JSON.stringify({ name: ed.doc.name, key: ed.doc.key, customs: ed.doc.customs, stitches: [...ed.doc.layers.stitches], beads: [...ed.doc.layers.beads], lines: ed.doc.layers.segments })";
  const before = await editorState<string>(page, content), id = await editorState<string>(page, "(ed) => ed.doc.id");
  const intro = page.getByTestId("pdf-pattern-intro");
  const pick = async (file: string) => {
    await fileAction(page, "New", "From a PDF chart…");
    await expect(intro).toContainText("not adding a PDF as a reference");
    await expect(intro).toContainText("A scanned PDF or one made from photos won’t work");
    await expect(intro).toContainText("Autofill");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Choose a PDF…" }).click();
    await (await chooser).setFiles(file);
  };
  await pick(pdf);
  await expect(page.getByText(/^Loaded /)).toBeVisible();
  expect(await editorState<string>(page, "(ed) => ed.doc.id")).not.toBe(id);
  expect(await editorState<string>(page, content)).toBe(before);
  // a PDF of pages without a pattern in it: said, with the way to trace it instead
  await pick(fixture("pages.pdf"));
  const unreadable = page.getByTestId("pdf-unreadable");
  await expect(unreadable).toContainText("“pages.pdf” has no chart this app can read");
  await expect(unreadable).toContainText("floating window");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(unreadable).toHaveCount(0);
});

/** New ▸ From a PDF chart…, the explanation passed, `name` from the fixtures picked. */
async function readPdfChart(page: Page, name: string) {
  await fileAction(page, "New", "From a PDF chart…");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a PDF…" }).click();
  await (await chooser).setFiles(fixture(name));
}
const readDoc = (page: Page) =>
  editorState<{ name: string; w: number; h: number; count: number; key: string[]; beads: number; lines: number; right: number }>(page,
    "(ed) => ({ name: ed.doc.name, w: ed.doc.w, h: ed.doc.h, count: ed.doc.count, key: ed.doc.key.filter(Boolean).map((e) => `${e.t}:${e.src}`).sort(), beads: [...ed.doc.layers.beads].filter(Boolean).length, lines: ed.doc.layers.segments.length, right: [...ed.doc.layers.stitches].filter((k, i) => k && i % ed.doc.w >= 28).length })");

test("New ▸ From a PDF chart… reads another app's chart: nothing to settle — \"Pattern read\", then the pattern with the PDF behind it, lined up (SPEC §15.47, §15.48)", async ({ page }) => {
  await readPdfChart(page, "other-app-chart.pdf");
  await expect(page.getByTestId("pdf-chart-summary")).toHaveText("Snowy Owl: W 30 × H 20 stitches, 3 colours, 2 backstitch lines.");
  // always kept: said, not asked
  await expect(page.getByTestId("pdf-chart-keep")).toBeChecked();
  await expect(page.getByTestId("pdf-chart-keep")).toBeDisabled();
  await page.getByRole("button", { name: "Open in the editor" }).click();
  await expect(page.getByText(/^Loaded /)).toBeVisible();
  const doc = await readDoc(page);
  expect(doc).toMatchObject({ name: "Snowy Owl", w: 30, h: 20, count: 16, key: ["back:dmc:321", "bead:bead:00557", "thread:dmc:310", "thread:dmc:3865"], lines: 2 });
  expect(doc.beads).toBeGreaterThan(0);
  // the first page behind the chart over columns 1–16, the second's place kept for when it's shown
  await expect.poll(() => editorState(page, "(ed) => ed.state.underlay && { behind: ed.state.underlay.behind, rect: ed.state.underlay.rect, page: ed.state.underlay.pdf.page, pages: ed.state.underlay.pdf.pages, second: ed.state.underlay.pdf.places['2'].rect }")).toEqual({ behind: true, rect: { x: 0, y: 0, w: 16, h: 20 }, page: 1, pages: 3, second: { x: 14, y: 0, w: 16, h: 20 } });
  await expect.poll(() => editorState(page, "(ed) => !!ed.state.underlayImage")).toBe(true);
  // and in a floating window, on the key's page
  await expect.poll(() => editorState(page, "(ed) => ed.state.references.map((r) => ({ name: r.name, page: r.pdf.page, pages: r.pdf.pages }))")).toEqual([{ name: "other-app-chart", page: 3, pages: 3 }]);
});

test("a chart with things to settle: the grids (not the size stated), faded cells, a thread not read — Open only once all is set (SPEC §15.48)", async ({ page }) => {
  await readPdfChart(page, "other-app-chart-messy.pdf");
  const dialog = page.getByRole("dialog"), next = dialog.getByRole("button", { name: "Next", exact: true });
  // the grids: the PDF says 31 × 20, the grids make 30 × 20; leaving out the second page makes 16 × 20
  await expect(page.getByTestId("pdf-chart-grids")).toContainText("The PDF says W 31 × H 20; the grids make W 30 × H 20.");
  const grids = page.getByTestId("pdf-chart-grids").getByRole("checkbox");
  await expect(grids).toHaveCount(2);
  await grids.nth(1).uncheck();
  await expect(page.getByTestId("pdf-chart-size")).toHaveText("Together they make W 16 × H 20 stitches.");
  await grids.nth(1).check();
  await next.click();
  // faded cells: stitched like the rest this time
  await expect(page.getByTestId("pdf-chart-faded")).toContainText("printed faded");
  await page.getByLabel("Stitch them like the rest").check();
  await next.click();
  // the key: the white thread wasn't read; Next waits for it. The PDF beside it, at that symbol's row of the key
  const key = page.getByTestId("pdf-chart-key");
  await expect(key.getByTestId("pdf-viewer-page")).toHaveValue("2");
  await expect(key.getByTestId("pdf-viewer-mark")).toBeVisible();
  await expect(key.getByTestId("pdf-viewer-zoom")).toHaveText("200%");
  await key.getByRole("tab", { name: "Chart" }).click();
  await expect(key.getByTestId("pdf-chart-preview")).toBeVisible();
  await key.getByRole("tab", { name: "PDF" }).click();
  await expect(key.getByTestId("pdf-chart-row")).toHaveCount(3);
  await expect(key.getByTestId("pdf-chart-row").filter({ hasText: "Not read" })).toContainText("Key: Kreinik 032 Pearl");
  await expect(next).toBeDisabled();
  await key.getByPlaceholder("Number or name").fill("3865");
  await page.keyboard.press("Enter");
  await expect(key.getByTestId("pdf-chart-row").filter({ hasText: "Not read" })).toHaveCount(0);
  await expect(key.getByTestId("pdf-chart-row").filter({ hasText: "Winter White" })).toHaveCount(1);
  // Back and on again keeps the choice
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByTestId("pdf-chart-faded")).toBeVisible();
  await next.click();
  await expect(next).toBeEnabled();
  await next.click();
  await dialog.getByRole("button", { name: "Open in the editor" }).click();
  await expect(page.getByText(/^Loaded /)).toBeVisible();
  const doc = await readDoc(page);
  expect(doc).toMatchObject({ w: 30, h: 20, key: ["back:dmc:321", "bead:bead:00557", "thread:dmc:310", "thread:dmc:3865"] });
  // the faded columns stitched
  expect(doc.right).toBeGreaterThan(0);
  await expect.poll(() => editorState(page, "(ed) => [!!ed.state.underlay, ed.state.references.length]")).toEqual([true, 1]);
});

test("New ▸ has a blank pattern, a photo, an .oxs and a PDF chart; My patterns' From a PDF chart… opens on the same explanation (SPEC §15.46)", async ({ page }) => {
  await fileAction(page, "New");
  await expect(page.getByRole("menuitem")).toContainText(["Blank pattern…", "From a photo…", "From an .oxs file…", "From a PDF chart…"]);
  await page.keyboard.press("Escape");
  // nothing worked on here yet (as from My patterns): an empty pattern behind it, not the demo's heart. The draft
  // cleared away from the editor (leaving, it would save one)
  await page.goto("/en/privacy");
  await page.evaluate(async () => {
    localStorage.removeItem("stitchwork.current");
    await new Promise((r) => { const q = indexedDB.deleteDatabase("stitchwork"); q.onsuccess = q.onerror = q.onblocked = r; });
  });
  await page.goto("/en?new=pdf");
  await expect(page.getByTestId("pdf-pattern-intro")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("pdf-pattern-intro")).toHaveCount(0);
  expect(new URL(page.url()).search).toBe("");
  expect(await editorState(page, "(ed) => ({ key: ed.doc.key.filter(Boolean).length, stitches: [...ed.doc.layers.stitches].filter(Boolean).length, beads: [...ed.doc.layers.beads].filter(Boolean).length, lines: ed.doc.layers.segments.length })")).toEqual({ key: 0, stitches: 0, beads: 0, lines: 0 });
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
  await saveFile(page, "xbird");
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

test("the side panel's bar: one section at a time below the key, folding under its header, its height set with the handle; remembered", async ({ page }) => {
  const head = (id: string) => page.getByTestId(`section-${id}`);
  // Totals is there to start with, unfolded
  await expect(head("totals")).toHaveAttribute("aria-expanded", "true");
  // another icon: its section takes Totals' place
  await page.getByTestId("rail-fabric").click();
  await expect(head("fabric")).toHaveAttribute("aria-expanded", "true");
  await expect(head("totals")).toHaveCount(0);
  await expect(page.getByTestId("rail-fabric")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("rail-totals")).toHaveAttribute("aria-pressed", "false");
  // the header folds it, and unfolds it
  await head("fabric").click();
  await expect(head("fabric")).toHaveAttribute("aria-expanded", "false");
  await head("fabric").click();
  await expect(head("fabric")).toHaveAttribute("aria-expanded", "true");
  // the handle sets the height; it's kept
  const handle = (await page.getByTestId("section-resizer").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 3);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 60, { steps: 4 });
  await page.mouse.up();
  const tall = await page.locator("[data-section=fabric]").evaluate((el) => el.parentElement!.getBoundingClientRect().height);
  await page.reload();
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  await expect(head("fabric")).toHaveAttribute("aria-expanded", "true");
  expect(await page.locator("[data-section=fabric]").evaluate((el) => el.parentElement!.getBoundingClientRect().height)).toBeCloseTo(tall, 0);
  // its icon again: no section, the key has the panel
  await page.getByTestId("rail-fabric").click();
  await expect(page.locator("[data-testid^=section-]")).toHaveCount(0);
});

test("chart checks are opt-in, run on demand, and their findings can be stepped through and ignored", async ({ page }) => {
  await page.evaluate(() => {
    const ed = (window as unknown as { __stitchwork: { doc: { w: number; layers: { stitches: Uint16Array } }; changed(): void } }).__stitchwork;
    ed.doc.layers.stitches[25 * ed.doc.w + 27] = 0; // a hole inside the heart
    ed.changed();
  });
  await page.getByTestId("rail-checks").click();
  const panel = page.getByTestId("checks-panel");
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

/** A 10 × 10 block printed at 30 px a cell: crosses and rings in the top row, the first of each already stitched. */
async function autofillPhoto(page: Page): Promise<[number, number]> {
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
  return keys as [number, number];
}

test("finds symbols in one 10 × 10 block of the photo behind the chart, and fills them on Accept", async ({ page }) => {
  const keys = await autofillPhoto(page);
  // Autofill sits in the toolbar (and Shift+F), in a group of its own before the drawing tools
  const toolbarButtons = await page.getByTestId("toolbar").getByRole("button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label") ?? ""));
  expect(toolbarButtons.findIndex((n) => n.startsWith("Autofill"))).toBeLessThan(toolbarButtons.findIndex((n) => n.startsWith("Draw")));
  await page.getByTestId("toolbar").getByRole("button", { name: /^Autofill/ }).click();
  // the chosen floss is shown as not in use
  await expect(page.getByTestId("status-entry")).toHaveAttribute("data-idle", "true");
  await expect(page.getByTestId("match-bar")).toContainText("click the 10 × 10 block");
  const p = await cellPoint(page, 5, 5);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId("match-count")).toHaveText("4 symbols found");
  // pointing at Decline brings up the tip, without a click
  await page.getByTestId("match-decline").hover();
  await expect(page.getByTestId("match-tip")).toContainText("Stitch a few more cells by hand");
  // the preview's own view: one click to symbols only, and remembered
  const viewBtn = page.getByTestId("match-view");
  await expect(viewBtn).toHaveAttribute("aria-pressed", "false");
  await viewBtn.click();
  await expect(viewBtn).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("stitchwork.autofillView"))).toBe("symbols");
  expect(await editorState<string>(page, "(ed) => ed.state.view")).toBe("both");
  // held down, the proposals step aside to show the photo
  const peek = (await page.getByTestId("match-peek").boundingBox())!;
  await page.mouse.move(peek.x + peek.width / 2, peek.y + peek.height / 2);
  await page.mouse.down();
  expect(await editorState<boolean>(page, "(ed) => ed.state.matchPeek")).toBe(true);
  await page.mouse.up();
  expect(await editorState<boolean>(page, "(ed) => ed.state.matchPeek")).toBe(false);
  // the block moved to the far right of the chart: the bar stays whole, clear of the side panel
  await page.evaluate(() => {
    const ed = (window as unknown as { __stitchwork: { viewport: { width: number }; state: { viewport: { zoom: number } }; store: { setState(s: object): void } } }).__stitchwork;
    const z = ed.state.viewport.zoom;
    ed.store.setState({ viewport: { zoom: z, offX: ed.viewport.width - 26 - 10 * z, offY: 60 } });
  });
  const chartBox = (await page.getByTestId("chart").boundingBox())!, barBox = (await page.getByTestId("match-bar").boundingBox())!;
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(chartBox.x + chartBox.width);
  expect(barBox.x).toBeGreaterThanOrEqual(chartBox.x);
  // holding Alt: the picker shows as the tool, Autofill steps aside
  await page.keyboard.down("Alt");
  await expect(page.getByTestId("match-bar")).toHaveCount(0);
  await expect(page.getByTestId("toolbar").getByRole("button", { name: /^Pick a key entry/ })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("Alt");
  await expect(page.getByTestId("match-bar")).toBeVisible();
  await page.getByTestId("match-accept").click();
  // on to the next block, still in Autofill
  await expect(page.getByTestId("match-count")).toHaveCount(0);
  await expect(page.getByTestId("match-bar")).toContainText("click the 10 × 10 block");
  const [a, b] = keys;
  expect(await editorState<number[]>(page, "(ed) => [...ed.doc.layers.stitches.slice(0, 8)]")).toEqual([a, b, a, b, a, 0, b, 0]);
  // editing the image pauses it, and the whole toolbar
  await page.keyboard.press("u");
  await expect(page.getByTestId("toolbar")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("match-bar")).toContainText("waits while you edit the image");
  await page.keyboard.press("u");
  await expect(page.getByTestId("toolbar")).toHaveAttribute("aria-disabled", "false");
  expect(await editorState<string>(page, "(ed) => ed.state.tool")).toBe("autofill");
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

test("floss + bead can be sewn between cells: on a grid point, placed like a French knot", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  const form = page.getByTestId("key-form");
  // a cross stitch has 3 ways, floss + bead a 4th
  await expect(form.getByTestId("stitch-type").getByRole("radio")).toHaveCount(3);
  await form.getByRole("radio", { name: "Floss + bead" }).click();
  await expect(form.getByTestId("stitch-type").getByRole("radio")).toHaveCount(4);
  await form.getByTestId("stitch-type").getByRole("radio", { name: /^Between cells/ }).click();
  await form.getByRole("button", { name: "Add to key", exact: true }).click();
  await expect(form).toHaveCount(0);
  const k = await editorState<number>(page, "(ed) => ed.state.activeEntry");
  expect(await editorState<string>(page, `(ed) => ed.doc.key[${k}].st`)).toBe("point");
  // the pencil puts it on the nearest grid point, as for a knot
  const before = await editorState<number>(page, "(ed) => ed.doc.layers.knots.length");
  const pt = await gridPoint(page, 5, 5);
  await page.mouse.click(pt.x, pt.y);
  expect(await editorState<object>(page, "(ed) => ed.doc.layers.knots.at(-1)")).toEqual({ x: 5, y: 5, k });
  expect(await editorState<number>(page, "(ed) => ed.doc.layers.knots.length")).toBe(before + 1);
  await expect(page.locator(`[data-entry='${k}']`)).toContainText(/between cells.*1\s*beads/);
});

test("a plain bead sits in its cell, or between cells like a French knot", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  const form = page.getByTestId("key-form");
  await form.getByRole("radio", { name: "Bead", exact: true }).click();
  const placement = form.getByTestId("bead-placement");
  await expect(placement.getByRole("radio")).toHaveCount(2);
  await expect(placement.getByRole("radio", { name: "In a cell" })).toHaveAttribute("aria-checked", "true");
  await placement.getByRole("radio", { name: /^Between cells/ }).click();
  await form.getByRole("button", { name: "Add to key", exact: true }).click();
  const k = await editorState<number>(page, "(ed) => ed.state.activeEntry");
  const pt = await gridPoint(page, 7, 7);
  await page.mouse.click(pt.x, pt.y);
  expect(await editorState<object>(page, "(ed) => ed.doc.layers.knots.at(-1)")).toEqual({ x: 7, y: 7, k });
  await expect(page.locator(`[data-entry='${k}']`)).toContainText(/between cells.*1\s*beads/);
});

test("the key list keeps its place across the key form, and shows a new entry when it was at the bottom", async ({ page }) => {
  // a long key, so the list scrolls
  await page.evaluate(() => {
    type Ed = { doc: { key: unknown[] }; state: { symbols: string[] }; changed(o: object): void };
    const ed = (window as unknown as { __stitchwork: Ed }).__stitchwork;
    const codes = ["150", "151", "152", "153", "154", "155", "156", "157", "158", "159", "160", "161", "162", "163", "164", "165", "166", "167", "168", "169", "170", "171"];
    codes.forEach((c, i) => ed.doc.key.push({ t: "thread", src: `dmc:${c}`, n: 2, st: "full", sym: ed.state.symbols[40 + i] }));
    ed.changed({ keys: true });
  });
  // the key gets the panel's height (the edited row then stays fully in view where the test puts it)
  await page.getByTestId("section-totals").click();
  const list = page.getByTestId("key-list");
  const scroll = () => list.evaluate((el) => ({ top: el.scrollTop }));
  // in the middle: editing an entry brings the list back to the same place
  await list.evaluate((el) => (el.scrollTop = 200));
  const row = page.locator("[data-entry='12']");
  await row.hover();
  await row.getByRole("button", { name: "Edit entry" }).click();
  await page.getByTestId("key-form").getByRole("button", { name: "Save changes" }).click();
  expect((await scroll()).top).toBe(200);
  // at the bottom: a new entry, and the list shows it
  await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  await page.getByPlaceholder("Search DMC number or name").fill("666");
  await page.locator("[data-id='dmc:666']").click();
  await page.getByTestId("key-form").getByRole("button", { name: "Add to key", exact: true }).click();
  // the new entry is in view, wherever its group puts it
  const added = page.locator(`[data-entry='${await editorState<number>(page, "(ed) => ed.state.activeEntry")}']`);
  await expect(added).toContainText("666");
  await expect(added).toBeInViewport({ ratio: 1 });
});

test("a photo window moves with two fingers and zooms with a pinch, like the chart, and never zooms the page", async ({ page }) => {
  await loadFixture(page, "1.json");
  const win = page.getByTestId("reference-window"), canvas = win.locator("canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const view = () => editorState<{ s: number; tx: number; ty: number }>(page, "(ed) => ed.state.references[0].view");
  const before = await view();
  // two fingers: a small-step wheel with no Ctrl — the photo moves, its zoom stays
  await page.mouse.wheel(12, 30);
  await expect.poll(async () => (await view()).ty).toBeCloseTo(before.ty - 30, 0);
  expect((await view()).s).toBe(before.s);
  // a pinch: Ctrl + wheel — the photo zooms, the page doesn't
  const moved = await view();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -8);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await view()).s).toBeGreaterThan(moved.s);
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  // still so after the window was minimised and opened again (its picture is drawn anew then)
  await win.getByTitle("Minimise").click();
  await win.getByTitle("Minimise").click();
  const again = await view(), b2 = (await win.locator("canvas").boundingBox())!;
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -8);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await view()).s).toBeGreaterThan(again.s);
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
});

test("a two-finger move on the chart stays a move, even when a pause bundles its steps into a big one", async ({ page }) => {
  const zoom = () => editorState<number>(page, "(ed) => ed.state.viewport.zoom");
  const before = await zoom();
  await page.evaluate(async () => {
    const c = document.querySelector("[data-testid=chart]")!, b = c.getBoundingClientRect();
    const send = (deltaY: number, deltaX = 0) => c.dispatchEvent(new WheelEvent("wheel", { deltaX, deltaY, clientX: b.left + 300, clientY: b.top + 300, bubbles: true, cancelable: true }));
    for (let i = 0; i < 5; i++) send(6.5, 0.5);
    // the page was busy for a moment: the browser hands over one big, whole step
    await new Promise((ok) => setTimeout(ok, 120));
    send(96);
    send(6.5);
  });
  expect(await zoom()).toBe(before);
});

test("two fingers sideways move the chart, never the browser back or forward", async ({ page }) => {
  for (const el of ["html", "body"]) expect(await page.locator(el).evaluate((e) => getComputedStyle(e).overscrollBehaviorX)).toBe("none");
  // and the chart takes the sideways gesture itself
  const handled = await page.evaluate(() => {
    const c = document.querySelector("[data-testid=chart]")!, b = c.getBoundingClientRect();
    const e = new WheelEvent("wheel", { deltaX: -40.5, deltaY: 0, clientX: b.left + 200, clientY: b.top + 200, bubbles: true, cancelable: true });
    c.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(handled).toBe(true);
});

test("Autofill's guides: what it needs the first time it's picked, and its buttons with the first results", async ({ page }) => {
  await page.evaluate(() => ["autofill", "autofillReview"].forEach((t) => localStorage.removeItem(`stitchwork.tipSeen.${t}`)));
  await autofillPhoto(page);
  const guide = page.getByTestId("guide");
  await page.keyboard.press("Shift+F");
  await expect(guide).toContainText("Autofill: before you start");
  await expect(guide).toContainText("only sees the symbols it has already learned");
  await expect(guide).toContainText("Make every key symbol look exactly like the paper chart’s");
  await guide.getByRole("button", { name: "Next" }).click();
  await expect(guide).toContainText("Line the block up first");
  await guide.getByRole("button", { name: "Next" }).click();
  await expect(guide).toContainText("Helpful, not perfect");
  await guide.getByRole("button", { name: "Got it" }).click();
  await expect(guide).toHaveCount(0);
  // the first results: the bar explained
  const p = await cellPoint(page, 5, 5);
  await page.mouse.click(p.x, p.y);
  await expect(guide).toContainText("What Autofill found");
  await guide.getByRole("button", { name: "Next" }).click();
  await expect(guide).toContainText("Look closer");
  await guide.getByRole("button", { name: "Got it" }).click();
  // once only
  await page.getByTestId("match-decline").click();
  await page.keyboard.press("p");
  await page.keyboard.press("Shift+F");
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId("match-count")).toBeVisible();
  await expect(guide).toHaveCount(0);
});

test("the first time an entry is added, a tip on symbols: draw your own, as on the paper chart — most useful with Autofill", async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem("stitchwork.tipSeen.keyEntry"));
  const guide = page.getByTestId("guide");
  // editing an entry doesn't bring it up
  const row = page.locator("[data-entry]").first();
  await row.hover();
  await row.getByRole("button", { name: "Edit entry" }).click();
  await expect(page.getByTestId("key-form")).toBeVisible();
  await expect(guide).toHaveCount(0);
  await page.getByTestId("key-form").getByRole("button", { name: "Cancel" }).click();
  // adding one does, with the symbol row and the draw button outlined
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  await expect(guide).toContainText("A symbol for every entry");
  await expect(guide).toContainText("works best when every symbol looks exactly like the one on the paper chart");
  await guide.getByRole("button", { name: "Got it" }).click();
  await expect(guide).toHaveCount(0);
  await page.getByTestId("key-form").getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  await expect(page.getByTestId("key-form")).toBeVisible();
  await expect(guide).toHaveCount(0);
});

test("☰ ▸ Toolbar hides the line, rectangle and fill tools and fractional stitches, and remembers it", async ({ page }) => {
  const toolbar = page.getByTestId("toolbar");
  await expect(toolbar.getByRole("button", { name: "Line (L)", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("group", { name: /^Partial stitches/ })).toBeVisible();
  await openAppMenu(page);
  const options = page.getByTestId("toolbar-options");
  await options.getByLabel("Hide line, rectangle and fill tools").check();
  await options.getByLabel("Hide fractional stitches").check();
  await page.keyboard.press("Escape");
  await expect(toolbar.getByRole("button", { name: "Line (L)", exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "Fill area (F)", exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole("group", { name: /^Partial stitches/ })).toHaveCount(0);
  // the tools themselves still work from the keyboard
  await page.keyboard.press("l");
  await expect(page.getByTestId("current-tool-name")).toContainText("Line");
  await page.reload();
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Line (L)", exact: true })).toHaveCount(0);
  await openAppMenu(page);
  await page.getByTestId("toolbar-options").getByLabel("Hide line, rectangle and fill tools").uncheck();
  await expect(toolbar.getByRole("button", { name: "Line (L)", exact: true })).toBeVisible();
});

test("thread brands: chosen for a new pattern, one tab each in the picker, your own threads added and changed there; a used brand stays", async ({ page }) => {
  await fileAction(page, "New", "Blank pattern…");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Change ▾" }).click();
  const threads = dialog.getByTestId("materials-threads");
  await threads.getByRole("button", { name: "+ New brand" }).click();
  await threads.getByPlaceholder("Brand name").fill("Kreinik");
  await threads.getByPlaceholder("Brand name").press("Enter");
  // two brands: "only one" doesn't apply
  await expect(threads.getByText(/^Only /)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  const tabs = page.getByTestId("brand-tabs");
  // every brand the app has, as a new pattern starts (SPEC §15.39), and the one added
  await expect(tabs.getByRole("tab")).toHaveText(["DMC", "Anchor", "Madeira", "Kreinik"]);
  await tabs.getByRole("tab", { name: "Kreinik" }).click();
  await expect(page.getByText("No Kreinik threads yet")).toBeVisible();
  // your own thread, in the brand of the tab
  await page.getByRole("button", { name: "+ Custom thread" }).click();
  const form = page.getByTestId("thread-form");
  await expect(form.getByLabel("Brand")).toHaveValue("Kreinik");
  await form.getByLabel("Code").fill("032");
  await form.getByLabel("Name").fill("Pearl");
  await form.getByRole("button", { name: "Add" }).click();
  await page.getByTestId("key-form").getByRole("button", { name: "Add to key", exact: true }).click();
  await expect(page.locator("[data-entry]")).toHaveCount(1);
  await expect(page.locator("[data-entry]")).toContainText("Kreinik 032");
  // changed from the picker: the key follows
  await page.locator("[data-entry]").getByRole("button", { name: /^Edit/ }).click();
  await page.locator("[data-id^='custom:']").hover();
  await page.getByRole("button", { name: "Change 032" }).click();
  await page.getByTestId("thread-form").getByLabel("Name").fill("Pearl gold");
  await page.getByTestId("thread-form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("key-form")).toContainText(/Kreinik 032\s*Pearl gold/);
  // Kreinik is used now: it can't be removed; DMC can
  await expect(tabs.getByRole("button", { name: /Kreinik is used by the key/ })).toBeDisabled();
  await tabs.getByRole("button", { name: "Remove DMC from this pattern" }).click();
  await expect(tabs.getByRole("tab")).toHaveText(["Anchor", "Madeira", "Kreinik"]);
  await page.getByTestId("key-form").getByRole("button", { name: "Close" }).click();
  await expect(page.locator("[data-entry]")).toContainText("Pearl gold");
});

test("bead brands: Mill Hill and Preciosa as tabs, a finish filter, your own bead brand gets its own tab", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  const form = page.getByTestId("key-form");
  await form.getByRole("radio", { name: "Bead", exact: true }).click();
  const tabs = page.getByTestId("brand-tabs");
  await expect(tabs.getByRole("tab")).toHaveText(["Mill Hill", "Preciosa"]);
  await tabs.getByRole("tab", { name: "Preciosa" }).click();
  await form.getByRole("combobox", { name: "All finishes" }).selectOption("Opaque - Matt");
  await expect(page.locator("[data-id='preciosa:13600/33139001']")).toBeVisible();
  await expect(page.locator("[data-id='preciosa:13600']")).toHaveCount(0);
  // a brand of your own, from + Brand: its tab, and the form for its first bead
  await tabs.getByRole("combobox", { name: "+ Brand" }).selectOption({ label: "New brand…" });
  await tabs.getByPlaceholder("Brand name").fill("Toho");
  await tabs.getByPlaceholder("Brand name").press("Enter");
  const tf = page.getByTestId("thread-form");
  await expect(tf.getByLabel("Brand")).toHaveValue("Toho");
  await tf.getByLabel("Code").fill("25");
  await tf.getByRole("button", { name: "Add" }).click();
  await expect(tabs.getByRole("tab")).toHaveText(["Mill Hill", "Preciosa", "Toho"]);
  await form.getByRole("button", { name: "Add to key", exact: true }).click();
  await expect(page.locator("[data-entry]").last()).toContainText("Toho 25");
});

test("threads & beads of a new pattern: one brand only — no brand tabs, your own threads go into it; beads off — no bead kinds; changed later in the side panel", async ({ page }) => {
  await fileAction(page, "New", "Blank pattern…");
  const dialog = page.getByRole("dialog");
  // a new pattern starts with every brand there is (SPEC §15.39); this one keeps to DMC
  await expect(dialog.getByTestId("materials-summary")).toHaveText("DMC, Anchor, Madeira · beads: Mill Hill, Preciosa");
  await dialog.getByRole("button", { name: "Change ▾" }).click();
  await dialog.getByTestId("materials-threads").getByLabel("Anchor").uncheck();
  await dialog.getByTestId("materials-threads").getByLabel("Madeira").uncheck();
  await dialog.getByLabel("Only DMC — no other thread brands in this pattern").check();
  await dialog.getByLabel("This pattern has beads").uncheck();
  await expect(dialog.getByTestId("materials-summary")).toHaveText("DMC only · no beads");
  await dialog.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  const form = page.getByTestId("key-form");
  await expect(page.getByTestId("brand-tabs")).toHaveCount(0);
  // no Floss + bead at all; Bead greyed out, saying where beads are turned on
  await expect(form.getByRole("radio", { name: /Floss \+ bead/ })).toHaveCount(0);
  const bead = form.getByRole("radio", { name: "Bead", exact: true });
  await expect(bead).toHaveAttribute("aria-disabled", "true");
  await expect(bead).toHaveAttribute("title", /turn them on in the side panel, Threads & beads/);
  // clicking it does nothing (forced: it's marked disabled)
  await bead.click({ force: true });
  await expect(form.getByRole("radio", { name: "Cross stitch" })).toBeChecked();
  await page.getByRole("button", { name: "+ Custom thread" }).click();
  await expect(page.getByTestId("fixed-brand")).toHaveText("DMC");
  await form.getByRole("button", { name: "Close" }).click();
  // the side panel: beads back on, a second thread brand — then the picker has tabs again
  await page.getByTestId("rail-materials").click();
  const panel = page.getByTestId("materials");
  await panel.getByLabel("This pattern has beads").check();
  await panel.getByTestId("materials-threads").getByLabel("Anchor").check();
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  await expect(page.getByTestId("brand-tabs").getByRole("tab")).toHaveText(["DMC", "Anchor"]);
  await expect(page.getByTestId("key-form").getByRole("radio", { name: /Floss \+ bead/ })).toBeVisible();
});

test("New ▸ start with this pattern's key and settings: its threads & beads and fabric come along; what the key uses stays; unticking puts the rest back", async ({ page }) => {
  // the demo has every brand (SPEC §15.39) and uses DMC and beads; this one leaves Madeira out
  await page.getByTestId("rail-materials").click();
  await page.getByTestId("materials").getByTestId("materials-threads").getByLabel("Madeira").uncheck();
  await fileAction(page, "New", "Blank pattern…");
  const dialog = page.getByRole("dialog"), threads = dialog.getByTestId("materials-threads");
  await dialog.getByRole("button", { name: "Change ▾" }).click();
  // a blank key: every brand, as a new pattern starts
  await expect(threads.getByLabel("Madeira")).toBeChecked();
  await dialog.getByRole("radio", { name: "This pattern's key & settings" }).click();
  await expect(threads.getByLabel("Madeira")).not.toBeChecked();
  await expect(threads.getByLabel("Anchor")).toBeChecked();
  await expect(threads.getByLabel("DMC")).toBeDisabled();
  await expect(dialog.getByLabel("This pattern has beads")).toBeDisabled();
  await expect(dialog.getByText(/The key's own brands and beads stay ticked/)).toBeVisible();
  // what the key doesn't use can still change
  await threads.getByLabel("Anchor").uncheck();
  await dialog.getByRole("radio", { name: "A blank key" }).click();
  await expect(threads.getByLabel("Madeira")).toBeChecked();
  await expect(dialog.getByLabel("This pattern has beads")).toBeEnabled();
});

test("a very large photo is kept as it is, after a word that the app may pause; “don’t ask again” is remembered", async ({ page }) => {
  const add = () =>
    page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 6200;
      c.height = 4000;
      c.getContext("2d")!.fillRect(0, 0, 10, 10);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
      const ed = (window as unknown as { __stitchwork: { underlay: { addFromFile(f: File): Promise<void> } } }).__stitchwork;
      void ed.underlay.addFromFile(new File([blob], "big.png", { type: "image/png" }));
    });
  await add();
  const ask = page.getByRole("dialog", { name: "A very large photo" });
  await expect(ask).toContainText("W 6200 × H 4000 px (25 megapixels)");
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(ask).toHaveCount(0);
  expect(await editorState(page, "(ed) => ed.state.underlay")).toBeNull();
  await add();
  await ask.getByTestId("large-photo-no-ask").click();
  await ask.getByRole("button", { name: "Use it" }).click();
  // stored at full size
  await expect.poll(() => editorState<number | undefined>(page, "(ed) => ed.state.underlay?.imageW")).toBe(6200);
  await page.getByTestId("straighten").getByRole("button", { name: "Use as it is" }).click();
  await add();
  await expect(page.getByTestId("straighten")).toBeVisible();
  await expect(ask).toHaveCount(0);
});

test("signed out, the first own thread: a tip on where it's kept, and what an account adds (SPEC §15.39)", async ({ page }) => {
  await page.evaluate(() => localStorage.removeItem("stitchwork.tipSeen.ownColours"));
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  await page.getByRole("button", { name: "+ Custom thread" }).click();
  const guide = page.getByTestId("guide");
  await expect(guide).toContainText("Threads and beads of your own");
  await expect(guide).toContainText("inside this pattern");
  await guide.getByRole("button", { name: "Got it" }).click();
  // once only
  await page.getByRole("button", { name: "+ Custom thread" }).click();
  await page.getByRole("button", { name: "+ Custom thread" }).click();
  await expect(guide).toHaveCount(0);
});

test("a PDF behind the chart: its pages one at a time, each where it was placed; a PDF window keeps each page's marks; both survive the work file (SPEC §15.41, §15.44)", async ({ page }) => {
  // behind the chart: several pages — every page shown to pick from, with a word that pages can be switched later
  let chooser = page.waitForEvent("filechooser");
  await page.getByTestId("rail-references").click();
  await page.getByTestId("underlay-add").click();
  await (await chooser).setFiles("tests/fixtures/pages.pdf");
  const pages = page.getByTestId("pdf-pages");
  await expect(pages.getByRole("option")).toHaveCount(3);
  await expect(pages.locator("img")).toHaveCount(3);
  await expect(page.getByTestId("pdf-page-hint")).toContainText("switch pages any time later");
  // put aside: nothing is added
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(pages).toBeHidden();
  expect(await editorState(page, "(ed) => ed.underlay.data")).toBeNull();
  chooser = page.waitForEvent("filechooser");
  await page.getByTestId("underlay-add").click();
  await (await chooser).setFiles("tests/fixtures/pages.pdf");
  await pages.getByRole("option", { name: "2" }).click();
  await page.getByRole("button", { name: "Line up page 2" }).click();
  await page.getByTestId("straighten").getByRole("button", { name: "Use as it is" }).click();
  const select = page.getByTestId("underlay-page");
  await expect(select.locator("option:checked")).toHaveText("Page 2 of 3");
  const underlay = () => editorState<{ page: number; rect: { x: number; y: number } } | null>(page, "(ed) => ed.underlay.data && { page: ed.underlay.data.pdf.page, rect: ed.underlay.data.rect }");
  // the page is drawn sharp: 4600 px on its long side
  expect(await editorState<number>(page, "(ed) => ed.underlay.data.imageH")).toBe(4600);
  await editorState(page, "(ed) => ed.commands.run('underlay.update', { rect: { ...ed.underlay.data.rect, x: 7, y: 5 } })");
  await select.selectOption("3");
  await expect.poll(async () => (await underlay())?.page).toBe(3);
  expect((await underlay())!.rect.x).not.toBe(7);
  await page.getByTestId("underlay-pages").getByRole("button", { name: "Previous page" }).click();
  await expect.poll(async () => (await underlay())?.page).toBe(2);
  expect((await underlay())!.rect).toMatchObject({ x: 7, y: 5 });

  // in a window: marks per page
  chooser = page.waitForEvent("filechooser");
  await page.getByTestId("ref-window-add").click();
  await (await chooser).setFiles("tests/fixtures/pages.pdf");
  await expect(page.getByTestId("pdf-page-hint")).toContainText("window’s bar");
  await page.getByRole("button", { name: "Show page 1" }).click();
  const win = page.getByTestId("reference-window");
  await expect(win.getByTestId("ref-pages")).toBeVisible();
  const box = (await win.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  const windowState = () => editorState<{ page: number; marks: string | null } | null>(page, "(ed) => ed.state.references[0] && { page: ed.state.references[0].pdf.page, marks: ed.state.references[0].marks }");
  await expect.poll(async () => (await windowState())?.marks).not.toBeNull();
  const firstMarks = (await windowState())!.marks;
  await win.getByRole("button", { name: "Next page" }).click();
  await expect.poll(async () => (await windowState())?.page).toBe(2);
  expect((await windowState())!.marks).toBeNull();
  await win.getByRole("button", { name: "Previous page" }).click();
  await expect.poll(async () => (await windowState())?.marks).toBe(firstMarks);

  // the work file carries the PDFs, their pages and placements
  const file = page.waitForEvent("download");
  await saveFile(page, "xbird");
  const path = await (await file).path();
  const saved = JSON.parse(readFileSync(path, "utf8")) as { underlay: { pdf: { src: string; page: number; pages: number } }; refs: { pdf: { src: string; pages: number } }[] };
  expect(saved.underlay.pdf).toMatchObject({ page: 2, pages: 3 });
  expect(saved.underlay.pdf.src).toMatch(/^data:application\/pdf/);
  expect(saved.refs[0]!.pdf).toMatchObject({ pages: 3 });
  chooser = page.waitForEvent("filechooser");
  await fileAction(page, "Open work file…");
  await (await chooser).setFiles(path);
  await expect(page.getByText(/^Loaded /)).toBeVisible();
  await expect(select.locator("option:checked")).toHaveText("Page 2 of 3");
  await expect(page.getByTestId("reference-window").getByTestId("ref-pages")).toBeVisible();
});
