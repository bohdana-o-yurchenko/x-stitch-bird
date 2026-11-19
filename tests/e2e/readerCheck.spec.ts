import { expect, test } from "@playwright/test";
import { exportAction, openEditor } from "./helpers";

/* "Does your app read it?" (SPEC §15.51): the page, signed out, and the tip after the first .oxs export. */

test("the check page: a file per tab, the chart and the list pick each other, marks kept, results after the last", async ({ page }) => {
  await page.goto("/en/check?file=pk");
  await page.evaluate(() => localStorage.removeItem("stitchwork.readerChecks"));
  await page.reload();
  await expect(page.getByTestId("check-tab-pk")).toHaveAttribute("aria-selected", "true");
  // ☰ here is the pages' one: the check is in the editor's ☰ (and the top bar, signed in), not in this one
  await page.getByTestId("pages-menu").getByRole("button").click();
  await expect(page.getByRole("menuitem", { name: /^Privacy/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Does your app read it/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // each tab downloads its own file
  for (const [kind, name] of [["oxs", "ptashechka-check.oxs"], ["pdf", "ptashechka-check-chart.pdf"], ["pk", "ptashechka-check-pattern-keeper.pdf"]]) {
    await page.getByTestId(`check-tab-${kind}`).click();
    const download = page.waitForEvent("download");
    await page.getByTestId("check-download").click();
    expect((await download).suggestedFilename()).toBe(name);
  }
  // a number on the chart opens its item in the list, and back
  await page.getByTestId("check-area-7").click();
  await expect(page.getByTestId("check-item-7")).toHaveAttribute("aria-expanded", "true");
  await page.getByTestId("check-item-12").click();
  await expect(page.getByTestId("check-area-12")).toHaveAttribute("aria-pressed", "true");
  // marked with issues, with a note; "all good" moves on to the next one not marked
  await page.getByTestId("check-issue").click();
  await page.getByTestId("check-note").fill("one strand only");
  await page.getByTestId("check-app").fill("Pattern Keeper (Android)");
  await page.getByTestId("check-item-1").click();
  await page.getByTestId("check-ok").click();
  await expect(page.getByTestId("check-item-2")).toHaveAttribute("aria-expanded", "true");
  // kept in this browser
  await page.reload();
  await expect(page.getByTestId("check-app")).toHaveValue("Pattern Keeper (Android)");
  await expect(page.getByText("2 of 26 checked")).toBeVisible();
  // the rest all good: after the last one, the results
  await page.getByTestId("check-item-2").click();
  for (let n = 0; n < 24; n++) await page.getByTestId("check-ok").click();
  const results = page.getByTestId("check-results-dialog");
  await expect(results).toContainText("Pattern Keeper (Android): 25 of 26 fine.");
  // what the one with issues has in common with others: Anchor, and blends — each half failing
  await expect(results).toContainText(/Issues with (Anchor threads|blends): 1 of 2/);
  await expect(results).toContainText("blend 1 DMC 321 + 1 Anchor 403 — tracked — one strand only");
  await page.getByRole("button", { name: "Close" }).click();
  // cleared: the marks go, the app's name stays
  await page.getByTestId("check-clear").click();
  await page.getByRole("dialog").getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("0 of 26 checked")).toBeVisible();
  await expect(page.getByTestId("check-app")).toHaveValue("Pattern Keeper (Android)");
});

test("the first .oxs export: a tip on checking your app, once; ☰ leads to the check", async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => localStorage.removeItem("stitchwork.tipSeen.oxsCheck"));
  const save = async () => {
    const download = page.waitForEvent("download");
    await exportAction(page, "Open Cross Stitch file (.oxs)");
    await download;
  };
  await save();
  const guide = page.getByTestId("guide");
  await expect(guide).toContainText("Will your app read this .oxs?");
  await expect(page.getByRole("menuitem", { name: /^Does your app read it\?/ })).toBeVisible();
  const opened = page.context().waitForEvent("page");
  await guide.getByTestId("guide-link").click();
  await expect(await opened).toHaveURL(/\/en\/check\?file=oxs$/);
  await guide.getByRole("button", { name: "Got it" }).click();
  await expect(guide).toHaveCount(0);
  await save();
  await page.waitForTimeout(500);
  await expect(guide).toHaveCount(0);
});

/** Signed in, as far as the page can tell: the session and the account's checks answered here (`checks`: null — the account can't be reached). */
async function signedInWith(page: import("@playwright/test").Page, checks: { list: unknown[] | null; saved: unknown[] }) {
  await page.route("**/api/auth/get-session*", (r) => r.fulfill({ json: { session: { id: "s", userId: "u", expiresAt: new Date(Date.now() + 864e5).toISOString() }, user: { id: "u", email: "e2e@example.com", name: "", emailVerified: true } } }));
  await page.route("**/api/checks", (r) => (checks.list ? r.fulfill({ json: checks.list }) : r.fulfill({ status: 500, body: "" })));
  await page.route("**/api/checks/*", (r) => {
    if (r.request().method() === "PUT") checks.saved.push(r.request().postDataJSON());
    return r.fulfill({ status: 204 });
  });
}

test("signed in: the page is a tab of the top bar; the .oxs can be checked in several apps, kept in the account", async ({ page }) => {
  const checks = { list: [] as unknown[], saved: [] as unknown[] };
  await signedInWith(page, checks);
  await page.goto("/en/check?file=oxs");
  await expect(page.getByRole("link", { name: "App check" })).toHaveAttribute("aria-current", "page");
  // no "sign in to keep several" — and no suggestions on the app's name
  await expect(page.getByText(/Sign in.*to keep checks of several apps/)).toHaveCount(0);
  await expect(page.getByTestId("check-app")).not.toHaveAttribute("list");
  await page.getByTestId("check-app").fill("Хрестики");
  await page.getByTestId("check-item-1").click();
  await page.getByTestId("check-ok").click();
  await expect.poll(() => checks.saved.length).toBeGreaterThan(0);
  expect(checks.saved.at(-1)).toMatchObject({ kind: "oxs", app: "Хрестики", marks: { dmc310: { v: "ok" } } });
  // another app, alongside
  await page.getByTestId("check-new").click();
  await page.getByTestId("check-app").fill("Ruta Stitch");
  const runs = page.getByRole("list", { name: "Your checks" });
  await expect(runs.getByRole("listitem").filter({ hasText: "Хрестики" })).toContainText("1/72");
  await expect(runs.getByRole("listitem").filter({ hasText: "Ruta Stitch" })).toContainText("0/72");
  await expect(page.getByTestId("check-problem")).toHaveCount(0);
});

test("signed in, the account can't be reached: said so, marks kept in this browser — not asked to sign in", async ({ page }) => {
  await signedInWith(page, { list: null, saved: [] });
  await page.goto("/en/check?file=oxs");
  await expect(page.getByTestId("check-problem")).toContainText("can't be reached in your account");
  await expect(page.getByText(/Sign in.*to keep checks of several apps/)).toHaveCount(0);
  await page.getByTestId("check-item-2").click();
  await page.getByTestId("check-ok").click();
  await page.reload();
  await expect(page.getByText("1 of 72 checked")).toBeVisible();
});
