import { expect, test } from "./fixtures";

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "laptop layout only"));

const pane = (page: import("@playwright/test").Page) => page.locator("#sheet-pane");

test("the newest dataset opens in the right pane on arrival", async ({ page }) => {
  await page.goto("/");
  const first = await page.locator("li[data-code]").first().getAttribute("data-code");
  await expect(pane(page)).toContainText(first!);
  await expect(page.getByRole("complementary", { name: "Ask" })).toBeVisible();
});

test("clicking a row opens its sheet and puts it in the address", async ({ page }) => {
  await page.goto("/?q=asthma");
  await page.locator("li[data-code='W01'] button").click();
  await expect(pane(page).getByRole("heading", { level: 2, name: /Asthma Prevalence/ })).toBeVisible();
  await expect(page).toHaveURL(/open=W01/);
});

test("Back and refresh restore the selection", async ({ page }) => {
  await page.goto("/?q=asthma");
  await page.locator("li[data-code='W01'] button").click();
  await expect(page).toHaveURL(/open=W01/);
  const other = page.locator("li[data-code]:not([data-code='W01']) button").first();
  await other.click();
  await page.goBack();
  await expect(page).toHaveURL(/open=W01/);
  await expect(pane(page)).toContainText("W01");
  await page.reload();
  await expect(pane(page)).toContainText("W01");
});

test("a sheet address opens the two-pane view with that dataset selected", async ({ page }) => {
  await page.goto("/d/W01");
  await expect(page).toHaveURL(/\?open=W01$/);
  await expect(pane(page)).toContainText("W01");
  await expect(page.locator("li[data-code]").first()).toBeVisible();
});

test("searching opens the top result", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("SLUG:").fill("asthma");
  await expect(pane(page)).toContainText("W01");
});

test("an unknown code shows not-found in the pane and the list still works", async ({ page }) => {
  await page.goto("/?open=Z99");
  await expect(pane(page)).toContainText("No dataset with that code");
  await page.locator("li[data-code] button").first().click();
  await expect(pane(page)).not.toContainText("No dataset with that code");
});

test("Enter opens a row in the pane and moves focus there; Escape comes back", async ({ page }) => {
  await page.goto("/?q=asthma");
  const row = page.locator("li[data-code='W01'] button");
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#sheet-heading")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();
});

test("switching rows quickly never shows the wrong sheet's preview", async ({ page }) => {
  // Every Hub layer answers 3 s late, so W01's preview would arrive after the switch if anything let it through.
  await page.route(/FeatureServer\/\d+\/query/, async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  await page.goto("/?open=W01");
  await expect(pane(page).getByRole("heading", { level: 2, name: /Asthma/ })).toBeVisible();
  // Any rundown row that isn't W01: nothing about it mentions asthma, so asthma text in the pane can only be W01's late answer.
  const other = page.locator("li[data-code]:not([data-code='W01'])").first();
  const otherCode = await other.getAttribute("data-code");
  await other.locator("button").click();
  await page.waitForTimeout(4500);
  await expect(pane(page)).toContainText(otherCode!);
  await expect(pane(page)).not.toContainText(/asthma/i);
});

test("narrowing the window keeps the chosen row open", async ({ page }) => {
  await page.goto("/?q=asthma");
  await page.locator("li[data-code='W01'] button").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("li[data-code='W01'] button")).toHaveAttribute("aria-expanded", "true");
});

test("the pane's downloads are reachable even when the list is short", async ({ page }) => {
  // A nonsense query lists no rows, so the page itself is no taller than the window.
  await page.goto("/?q=zzqxv&open=W01");
  await expect(pane(page).getByRole("heading", { level: 2, name: /Asthma/ })).toBeVisible();
  const hub = pane(page).getByRole("link", { name: "View on Hub" });
  await hub.scrollIntoViewIfNeeded();
  const box = await hub.boundingBox();
  const vh = page.viewportSize()!.height;
  expect(box!.y + box!.height).toBeLessThanOrEqual(vh);
});

test("after a keyboard selection, typing a new search stays in the search box", async ({ page }) => {
  await page.goto("/?q=asthma");
  await page.locator("li[data-code='W01'] button").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#sheet-heading")).toBeFocused();
  const slug = page.getByLabel("SLUG:");
  await slug.click();
  await slug.selectText();
  // Type, pause long enough for results (and a new top result in the pane) to arrive, then keep typing.
  await page.keyboard.type("f");
  await expect(page).toHaveURL(/q=f$/);
  await page.waitForTimeout(2500);
  await page.keyboard.type("ood");
  await expect(slug).toHaveValue("food");
  await expect(slug).toBeFocused();
});

test("Enter, Escape, Enter on the same row returns to the sheet each time", async ({ page }) => {
  await page.goto("/?q=asthma");
  const row = page.locator("li[data-code='W01'] button");
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#sheet-heading")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#sheet-heading")).toBeFocused();
});

test("an auto-opened item is not marked as opened", async ({ page }) => {
  await page.goto("/");
  const first = await page.locator("li[data-code]").first().getAttribute("data-code");
  await expect(pane(page)).toContainText(first!);
  await page.waitForTimeout(500);
  expect((await page.evaluate(() => localStorage.getItem("cca:opened"))) ?? "").not.toContain(first!);
});

test("the not-found pane offers a way back", async ({ page }) => {
  await page.goto("/?open=Z99");
  await expect(pane(page)).toContainText("No dataset with that code");
  const first = await page.locator("li[data-code]").first().getAttribute("data-code");
  await pane(page).getByRole("button", { name: "Show the newest" }).click();
  await expect(pane(page)).toContainText(first!);
  await expect(page).not.toHaveURL(/open=/);
});

test.describe("before scripts run", () => {
  test.use({ javaScriptEnabled: false });
  test("the Ask rail sits in the right-hand strip", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const rail = await page.getByRole("complementary", { name: "Ask" }).boundingBox();
    expect(rail!.x).toBeGreaterThan(1300);
  });
});
