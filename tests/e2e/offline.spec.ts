import { expect, test, type Page } from "@playwright/test";
import { fileAction, fixture, openEditor } from "./helpers";

/*
 * The installed app without the internet (SPEC §15.53): installed from a browser tab, the service worker saves the
 * app ahead; then it opens offline — the editor, what it loads only when needed, the other pages — and whoever was
 * signed in stays signed in. A new version is offered with Reload.
 */

test.beforeEach(async ({ page }) => openEditor(page));

/** As the browser tells the page once the app is installed; resolves when the app is saved ahead. */
async function install(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.state ?? null), { timeout: 60_000 }).toBe("activated");
}

test("opens offline: the editor, pdf.js loaded only now, My patterns while signed in, the other language", async ({ page, context }) => {
  test.setTimeout(120_000);
  await install(page);
  // whoever was signed in here last, as the sign-in check leaves it
  await page.evaluate(() => localStorage.setItem("stitchwork.account", JSON.stringify({ id: "e2e", email: "e2e@example.com" })));
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  expect(await page.evaluate(() => fetch("/api/usage").then(() => "reached", () => "offline"))).toBe("offline");

  // still signed in; signing out waits for the internet
  await page.getByTestId("account").getByRole("button").click();
  await expect(page.getByRole("menuitem", { name: /^e2e@example\.com/ })).toContainText("Offline");
  await expect(page.getByRole("menuitem", { name: /^Sign out/ })).toBeDisabled();
  await page.keyboard.press("Escape");

  // the PDF chart reader (pdf.js and its worker) is loaded only when a PDF is opened
  await fileAction(page, "New", "From a PDF chart…");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a PDF…" }).click();
  await (await chooser).setFiles(fixture("pages.pdf"));
  await expect(page.getByTestId("pdf-unreadable")).toContainText("has no chart this app can read");
  await page.getByRole("button", { name: "Close" }).click();

  // My patterns: this browser's, said calmly — not sent back to the editor as if signed out
  await page.goto("/en/patterns");
  await expect(page.getByTestId("home-offline")).toContainText("You’re offline");
  await expect(page).toHaveURL(/\/en\/patterns$/);

  await page.goto("/uk/support");
  await expect(page.getByTestId("support")).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/uk$/);
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  await context.setOffline(false);
});

test("a new version: saved in the background, then Reload brings it", async ({ page }) => {
  test.setTimeout(120_000);
  await install(page);
  await page.reload();
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  // the next build, as the browser finds it (a worker under another address is a new version to it — the server
  // can't be given a new build here; what a new build changes in the worker is in serviceWorker.test.ts)
  await page.evaluate(async () => void (await navigator.serviceWorker.register("/sw.js?next", { scope: "/", updateViaCache: "none" })));
  const bar = page.getByTestId("app-update");
  await expect(bar).toContainText("A new version of пташечка is ready", { timeout: 60_000 });
  await bar.getByRole("button", { name: "Reload" }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.locator("[data-entry]").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(/\/sw\.js\?next$/);
});
