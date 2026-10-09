import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

test("City datasets appear in search with the CITY tag, live feeds marked LIVE", async ({ page }) => {
  await page.goto("/?q=" + encodeURIComponent("crime incidents police"));
  const row = page.locator("li[data-code]").filter({ hasText: /NIBRS Crime Data/ }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByTitle("From the City of Milwaukee's open data")).toBeVisible();
  await expect(row.getByText("LIVE", { exact: true })).toBeVisible();
});

test("a City sheet shows live rows and the private-names note where it applies", async ({ page }) => {
  await page.goto("/?q=" + encodeURIComponent("master property file"));
  const code = await page.locator("li[data-code]").filter({ hasText: /Master Property/, hasNotText: /Visualizations/ }).first().getAttribute("data-code");
  await page.goto(`/d/${code}`);
  await expect(page.getByText("Names private individuals. Shown as the City publishes it.")).toBeVisible();
  await expect(page.locator("[data-city-preview] tbody tr").first()).toBeVisible({ timeout: 20_000 });
});

for (const scheme of ["light", "dark"] as const)
  test(`a City sheet has no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/?q=" + encodeURIComponent("crime incidents police"));
    const code = await page.locator("li[data-code]").filter({ hasText: /NIBRS Crime Data/ }).first().getAttribute("data-code");
    await page.goto(`/d/${code}`);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
