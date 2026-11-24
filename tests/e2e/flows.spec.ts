import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { cellPoint, dragCells, editorState, fileAction, fixture, gridPoint, loadFixture, openAppMenu, openEditor, pretendSignedIn, exportAction, saveFile } from "./helpers";

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
  // a new pattern starts with an empty key unless asked
  await expect(dialog.getByRole("radio", { name: "A blank key" })).toBeChecked();
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
  // signed out, it's the one working pattern: the untouched demo it replaced is gone, nothing else to open
  await page.getByRole("button", { name: /^Pattern ▾$/ }).click();
  await expect(page.getByRole("menuitem", { name: /^New/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Open…/ })).toHaveCount(0);
});

test("signed out, replacing a pattern with work in it asks first: download it, sign in, or replace it", async ({ page }) => {
  await page.keyboard.press("l");
  await dragCells(page, [1, 1], [4, 1]);
  await fileAction(page, "New", "Blank pattern…");
  await page.getByRole("dialog").getByLabel("Name").fill("Second");
  await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  const ask = page.getByTestId("keep-pattern");
  await expect(ask).toContainText("only in this browser");
  // "Sign in to keep it": the sign-in dialog, and the pattern stays
  await page.getByRole("button", { name: "Sign in to keep it" }).click();
  await expect(page.getByTestId("sign-in-email")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Pattern name" })).toHaveValue("Untitled pattern");
  // "Download it, then continue": the work file, then the new pattern
  await fileAction(page, "New", "Blank pattern…");
  await page.getByRole("dialog").getByLabel("Name").fill("Second");
  await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download it, then continue" }).click();
  expect((await file).suggestedFilename()).toMatch(/\.xbird$/);
  await expect(page.getByRole("textbox", { name: "Pattern name" })).toHaveValue("Second");
  // the old one left this browser; an untouched pattern is replaced without asking
  await fileAction(page, "New", "Blank pattern…");
  await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  await expect(ask).toHaveCount(0);
  await page.getByRole("button", { name: /^Pattern ▾$/ }).click();
  await expect(page.getByRole("menuitem", { name: /^Open…/ })).toHaveCount(0);
});

test("signed in, a file opened from the computer is kept, even when another pattern is opened straight after", async ({ page }) => {
  // signed in (this browser's copies are what's checked)
  await pretendSignedIn(page);
  await page.keyboard.press("ControlOrMeta+s");
  await loadFixture(page, "1.oxs");
  await expect(page.locator("[data-entry]")).toHaveCount(12);
  // straight away, another pattern (as the patterns page opens one); both are called "Untitled pattern": told apart
  // by size (the demo is 60 × 60, the file 72 × 72)
  const open = async (w: number) => {
    const id = await editorState<string>(page, `(ed) => ed.persistence.patterns.list().then((l) => l.find((p) => p.w === ${w}).id)`);
    await editorState(page, `(ed) => ed.commands.run("file.openSaved", ${JSON.stringify(id)})`);
  };
  await open(60);
  await expect(page.locator("[data-entry]")).toHaveCount(13);
  // the imported one is in the library, whole
  await open(72);
  await expect(page.locator("[data-entry]")).toHaveCount(12);
  await expect(page.getByTestId("totals")).toContainText("138 half");
});

test("a picture becomes a pattern with the chosen size and number of colours", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await fileAction(page, "New", "From a photo…");
  await (await chooser).setFiles(fixture("underlay.png"));
  const dialog = page.getByRole("dialog", { name: "Turn a picture into a pattern" });
  await dialog.getByLabel("Width (stitches)").fill("20");
  await dialog.getByLabel("Max colours").fill("4");
  await expect(dialog.getByText(/^W 20 × H 10 stitches/)).toBeVisible();
  await dialog.getByRole("button", { name: "Create pattern" }).click();
  await expect(page.getByText(/^Pattern created — \d colours/)).toBeVisible();
  expect(await editorState<string>(page, "(ed) => `${ed.doc.w}×${ed.doc.h}`")).toBe("20×10");
  const entries = await page.locator("[data-entry]").count();
  expect(entries).toBeGreaterThan(0);
  expect(entries).toBeLessThanOrEqual(4);
  // every cell is stitched with one of them
  expect(await fulls(page)).toBe(200);
});

test("signed in, New ▾ on the patterns page: the editor shows only once the new pattern is in — given up, back there (SPEC §15.37)", async ({ page, context }) => {
  // the session, as the account would answer it (the patterns page is for signed-in users only)
  await page.route("**/api/auth/get-session*", (r) => r.fulfill({ json: { session: { id: "s", userId: "u", expiresAt: new Date(Date.now() + 864e5).toISOString() }, user: { id: "u", email: "e2e@example.com", name: "", emailVerified: true } } }));
  await context.addCookies([{ name: "neon-auth.session_token", value: "x", domain: "localhost", path: "/" }]);
  const startNew = async (item: string, file: string) => {
    await page.goto("/en/patterns");
    const chooser = page.waitForEvent("filechooser");
    // nothing in the (pretend) account: the empty page's buttons — the same starts as New ▾
    await page.getByTestId("home-empty").getByRole("button", { name: item }).click();
    await (await chooser).setFiles(file);
    await expect(page).toHaveURL(/\/en\/editor$/);
  };
  // a photo: only its settings show, never the pattern worked on last; Cancel leads back
  await startNew("From a photo…", "tests/fixtures/underlay.png");
  await expect(page.getByTestId("editor-arriving")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create pattern" })).toBeVisible();
  await expect(page.getByTestId("chart")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/en\/patterns$/);
  // a file that can't be read: back, and said there
  await startNew("Open .xbird work file…", "tests/fixtures/underlay.png");
  await expect(page).toHaveURL(/\/en\/patterns$/);
  await expect(page.getByTestId("home-notice")).toContainText("Couldn’t read that file");
  // a PDF chart: read, then its steps — still no pattern behind them; cancelled, back
  await page.goto("/en/patterns");
  await page.getByTestId("home-empty").getByRole("button", { name: "From a PDF chart…" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a PDF…" }).click();
  await (await chooser).setFiles("tests/fixtures/other-app-chart.pdf");
  await expect(page.getByTestId("pdf-chart-summary")).toBeVisible();
  await expect(page.getByTestId("chart")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/en\/patterns$/);
  // made: the editor shows it
  await startNew("From a photo…", "tests/fixtures/underlay.png");
  await page.getByRole("button", { name: "Create pattern" }).click();
  await expect(page.getByTestId("chart")).toBeVisible();
  await expect(page.getByTestId("editor-arriving")).toHaveCount(0);
  expect(await editorState<string>(page, "(ed) => ed.doc.name")).toBe("Image pattern");
});

test("Floss: the whole catalogue with your own among it — Only mine, colour families, search; a colour's panel: other brands, shades, similar (SPEC §15.57)", async ({ page, context }) => {
  await page.route("**/api/auth/get-session*", (r) => r.fulfill({ json: { session: { id: "s", userId: "u", expiresAt: new Date(Date.now() + 864e5).toISOString() }, user: { id: "u", email: "e2e@example.com", name: "", emailVerified: true } } }));
  await page.route("**/api/threads", (r) => r.fulfill({ json: [{ id: "custom:mine", kind: "thread", brand: "DMC", code: "310-old", name: "Old black", hex: "#111111" }] }));
  await context.addCookies([{ name: "neon-auth.session_token", value: "x", domain: "localhost", path: "/" }]);
  // the demo pattern saved in this browser: one of "your patterns"
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(() => editorState<number>(page, "(ed) => ed.persistence.patterns.list().then((l) => l.length)")).toBeGreaterThan(0);
  await page.goto("/en/threads");
  const list = page.getByTestId("thread-list");
  // DMC, whole: hundreds of colours, yours among them with its dot
  await expect(page.getByRole("heading", { name: "DMC", exact: true })).toBeVisible();
  // a wide screen: the panel is always there, on the list's first colour, with nothing to close
  const panel = page.getByTestId("colour-panel");
  await expect(panel.getByRole("heading", { name: "DMC 01" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  expect(await list.locator("[data-colour]").count()).toBeGreaterThan(400);
  await expect(list.locator('[data-colour="custom:mine"]').getByTestId("own-mark")).toBeVisible();
  // only mine
  await page.getByTestId("only-mine").click();
  await expect(list.locator("[data-colour]")).toHaveCount(1);
  await page.getByTestId("only-mine").click();
  // the arrows move the pick
  await list.locator('[data-colour="dmc:01"]').click();
  await page.keyboard.press("ArrowRight");
  await expect(panel.getByRole("heading", { name: "DMC 02" })).toBeVisible();
  // in my patterns: just the demo's floss, DMC 798 among them
  await page.getByTestId("in-patterns").click();
  await expect(list.locator('[data-colour="dmc:798"]')).toBeVisible();
  expect(await list.locator("[data-colour]").count()).toBeLessThan(20);
  await page.getByTestId("in-patterns").click();
  // a colour family, then a search within it
  await page.locator("[data-family=blue]").click();
  const blues = await list.locator("[data-colour]").count();
  expect(blues).toBeGreaterThan(20);
  expect(blues).toBeLessThan(120);
  await page.locator("[data-family=blue]").click();
  await page.getByTestId("thread-search").fill("310");
  await list.locator('[data-colour="dmc:310"]').click();
  // its panel: Anchor 403 by the chart, its shades, similar DMC, the patterns (none here)
  await expect(panel.getByRole("heading", { name: "DMC 310" })).toBeVisible();
  await expect(panel.getByTestId("colour-other-brands")).toContainText("403");
  await expect(panel.getByTestId("colour-other-brands")).toContainText("chart");
  await expect(panel.getByTestId("colour-shades").getByRole("button", { name: "DMC 310", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(panel.getByTestId("colour-patterns")).toContainText("Not in any of your patterns yet.");
  // hop to Anchor 403
  await panel.getByTestId("colour-other-brands").getByRole("button", { name: /403/ }).click();
  await expect(panel.getByRole("heading", { name: "Anchor 403" })).toBeVisible();
  // a catalogue colour can be duplicated into one of your own
  await panel.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  // only the list scrolls — the page, the brands and the panel stay put
  await page.getByTestId("thread-search").fill("");
  const top = (id: string) => page.getByTestId(id).evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const before = [await top("thread-brands"), await top("colour-panel")];
  await page.getByTestId("thread-scroll").hover();
  await page.mouse.wheel(0, 800);
  await expect.poll(() => page.getByTestId("thread-scroll").evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect([await top("thread-brands"), await top("colour-panel")]).toEqual(before);
  expect(await page.evaluate(() => [...document.querySelectorAll("main")].map((m) => m.parentElement!.scrollTop))).toEqual([0]);
  // Beads: a brand's series one level under it
  await page.goto("/en/beads");
  await page.getByTestId("bead-series").getByRole("button", { name: /Antique Glass/ }).click();
  await expect(page.getByRole("heading", { name: /Mill Hill · Antique Glass/ })).toBeVisible();
  await expect(list.locator("[data-colour]")).toHaveCount(73);
});

test("Versions brings back the pattern as it was before a risky change", async ({ page }) => {
  const used = page.locator("[data-entry]").first();
  await used.hover();
  await used.getByRole("button", { name: "Delete entry" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator("[data-entry]")).toHaveCount(12);
  await page.getByTestId("rail-versions").click();
  const row = page.getByTestId("versions-panel").getByText(/Before deleting a key entry/);
  await expect(row).toBeVisible();
  await row.locator("..").getByRole("button", { name: "Restore" }).click();
  await expect(page.locator("[data-entry]")).toHaveCount(13);
  // one section at a time: Totals in Versions' place, to see the stitches are back
  await page.getByTestId("rail-totals").click();
  await expect(page.getByTestId("totals")).toContainText("451 full");
});

test("a selection is copied, pasted where the pointer is and placed; undo takes the copy away", async ({ page }) => {
  // the bird's head: 11 × 10 cells from column 18, row 20
  const heart = (x: number, y: number) => `Array.from({ length: 110 }, (_, i) => ed.doc.layers.stitches[(${y} + ((i / 11) | 0)) * 60 + ${x} + (i % 11)])`;
  await page.keyboard.press("s");
  await dragCells(page, [18, 20], [28, 29]);
  await expect(page.getByRole("button", { name: "Deselect" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+c");
  const target = await cellPoint(page, 10, 40);
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByText("Pasted — click or press Enter to place")).toBeVisible();
  await page.keyboard.press("Enter");
  const [source, copy] = await editorState<number[][]>(page, `(ed) => [${heart(18, 20)}, ${heart(10, 40)}]`);
  expect(copy).toEqual(source);
  expect(source!.filter(Boolean)).toHaveLength(89);
  await page.keyboard.press("ControlOrMeta+z");
  expect((await editorState<number[]>(page, `(ed) => ${heart(10, 40)}`)).filter(Boolean)).toHaveLength(0);
});

test("every kind of stitch: backstitch lines, French knots, partial stitches; the eraser takes one line away", async ({ page }) => {
  const segments = () => count(page, "ed.doc.layers.segments.length");
  const before = await segments();
  // the demo's backstitch entry: the pencil draws lines from corner to corner, Esc ends the chain
  await page.locator("[data-entry='12']").click();
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

test("special stitches aren't offered yet: a backstitch has no Placed as and no Draw your own (next release, BACKLOG 7)", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  const form = page.getByTestId("key-form");
  await form.getByRole("radio", { name: "Backstitch" }).click();
  await page.getByPlaceholder("Search DMC number or name").fill("321");
  await page.locator("[data-id='dmc:321']").click();
  await expect(form.getByTestId("key-preview")).toBeVisible();
  await expect(form.getByTestId("stamp-choice")).toHaveCount(0);
  await expect(form.getByTestId("stamp-draw")).toHaveCount(0);
});

// hidden in this release (OFFER_STAMPS in KeyEntryForm); comes back with special stitches
test.skip("stamps: a stitch of one's own drawn by hand, placed as one; Smyrna crosses not offered for now (ARCHITECTURE-REVIEW §3)", async ({ page }) => {
  const stamps = () => editorState<{ x: number; y: number; w: number; def: string }[]>(page, "(ed) => ed.doc.layers.stamps.map((s) => ({ x: s.x, y: s.y, w: s.w, def: s.def }))");
  await page.getByRole("button", { name: "+ Add to key" }).first().click();
  const form = page.getByTestId("key-form");
  await form.getByRole("radio", { name: "Backstitch" }).click();
  await page.getByPlaceholder("Search DMC number or name").fill("321");
  await page.locator("[data-id='dmc:321']").click();
  // the built-in Smyrna crosses are hidden until they're reworked
  await expect(form.getByTestId("stamp").getByRole("radio")).toHaveCount(1);
  await expect(form.getByTestId("stamp")).not.toContainText("Smyrna");
  // one's own: drawn in the form — a 1×1 tick — then placed
  await form.getByTestId("stamp-draw").click();
  const drawer = page.getByTestId("stamp-drawer");
  await drawer.getByTestId("stamp-w").selectOption("1");
  await drawer.getByTestId("stamp-h").selectOption("1");
  await drawer.getByTestId("stamp-name").fill("Tick");
  const area = (await drawer.getByTestId("stamp-area").boundingBox())!;
  // the block is centred in the area with 14 px around it: corner to corner
  await page.mouse.move(area.x + 14, area.y + 14);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width - 14, area.y + area.height - 14, { steps: 5 });
  await page.mouse.up();
  await expect(drawer.getByTestId("stamp-line")).toHaveCount(1);
  await drawer.getByTestId("stamp-use").click();
  await expect(form.getByTestId("key-preview")).toContainText("Tick");
  await form.getByRole("button", { name: "Add to key", exact: true }).click();
  await expect(form).toHaveCount(0);
  const d = await cellPoint(page, 3, 3);
  await page.mouse.click(d.x, d.y);
  expect(await stamps()).toHaveLength(1);
  expect((await stamps())[0]).toMatchObject({ x: 3, y: 3, w: 1 });
  expect((await stamps())[0]!.def).toMatch(/^own:/);
  await expect(page.getByTestId("totals")).toContainText("Special stitches: 1");
  // undo takes it away
  await page.keyboard.press("ControlOrMeta+z");
  expect(await stamps()).toHaveLength(0);
});

// someone else's design: on this computer only (tests/fixtures/private)
test("opens a Pattern Maker .xsd from New ▸ From an .oxs or .xsd file: its crosses and backstitch", async ({ page }) => {
  test.skip(!existsSync(fixture("private/pattern-maker-rabbits.xsd")), "no private sample");
  const chooser = page.waitForEvent("filechooser");
  await fileAction(page, "New", "From an .oxs or .xsd file…");
  await (await chooser).setFiles(fixture("private/pattern-maker-rabbits.xsd"));
  await expect(page.getByText(/^Loaded /)).toBeVisible();
  await expect(page.getByTestId("totals")).toContainText("3,276 full");
  await expect(page.getByTestId("totals")).toContainText("596 backstitch lines");
});

test("exports an .oxs that opens again with the same stitches, and a shopping list", async ({ page }) => {
  const oxs = page.waitForEvent("download");
  await saveFile(page, "oxs");
  const path = await (await oxs).path();
  expect(readFileSync(path, "utf8")).toContain("<chart>");
  const chooser = page.waitForEvent("filechooser");
  await fileAction(page, "Open .xbird work file…");
  await (await chooser).setFiles(path);
  await expect(page.getByText(/^Loaded /)).toBeVisible();
  await expect(page.getByTestId("totals")).toContainText("451 full");

  const csv = page.waitForEvent("download");
  await exportAction(page, "Shopping list (CSV)");
  const text = readFileSync(await (await csv).path(), "utf8");
  expect(text).toContain("939");
  expect(text).toContain("Kreinik");
  expect(text).toContain("Generated by пташечка");
});

test("exports a stitched preview: bigger cells than the flat one, with the footer line below", async ({ page }) => {
  const size = async (item: string) => {
    const png = page.waitForEvent("download");
    await exportAction(page, item.startsWith("Preview") ? "Preview images (PNG)" : "Chart images (PNG)", item);
    const d = await png, b = readFileSync(await d.path());
    return { name: d.suggestedFilename(), w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  };
  const flat = await size("Preview image — colour blocks (PNG)"), stitched = await size("Preview image — stitched (PNG)");
  expect(stitched.name).toMatch(/-stitched\.png$/);
  // 60 cells of 28 px with 16 px margins, and 28 px of footer
  expect(stitched).toMatchObject({ w: 60 * 28 + 32, h: 60 * 28 + 32 + 28 });
  expect(flat.w).toBeLessThan(stitched.w);
});

test("signed out the logo leads to the landing page; My patterns, Threads, Beads and Account lead back to the editor (SPEC §15.39, §15.53)", async ({ page }) => {
  await expect(page.getByTestId("to-home")).toHaveAttribute("href", "/en");
  for (const path of ["patterns", "threads", "beads", "account"]) {
    await page.goto(`/en/${path}`);
    await expect(page).toHaveURL(/\/en\/editor$/);
    await expect(page.getByTestId("chart")).toBeVisible();
  }
});

test("signed in, the account menu leads to My patterns, Floss, Beads and Account", async ({ page }) => {
  await pretendSignedIn(page);
  await page.getByRole("button", { name: /e2e@example\.com/ }).click();
  for (const name of ["My patterns", "Floss", "Beads", "Account"]) await expect(page.getByRole("menuitem", { name, exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Floss", exact: true }).click();
  // (only pretended signed in here: the page itself knows better, and gives way to the editor)
  await page.waitForURL(/\/en\/threads$/);
});

test("free software: ☰ ▸ Source code links to the source", async ({ page }) => {
  await openAppMenu(page);
  await expect(page.getByRole("menuitem", { name: /^Source code/ })).toContainText("AGPL-3.0");
});

test("Pattern ▸ Open… leads to the patterns page (SPEC §15.36)", async ({ page }) => {
  await pretendSignedIn(page);
  await page.keyboard.press("ControlOrMeta+s");
  await fileAction(page, "Open…");
  await page.waitForURL(/\/patterns$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
