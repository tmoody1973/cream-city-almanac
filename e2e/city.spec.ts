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

test("a City sheet lists every file, and a replaced dataset points to its replacement", async ({ page }) => {
  await page.goto("/?q=" + encodeURIComponent("WIBR crime monthly"));
  const code = await page.locator("li[data-code]").filter({ hasText: /WIBR Crime \(Monthly\)/ }).first().getAttribute("data-code");
  await page.goto(`/d/${code}`);
  await page.getByText(/^\d+ files$/).click();
  for (const layer of ["Homicides", "Arson", "Assault"]) await expect(page.getByRole("link", { name: `${layer} · map layer` })).toBeVisible();
  await expect(page.locator("[data-replaced-by]").getByRole("link", { name: /NIBRS Crime Data/ })).toBeVisible();
});

test("a located City sheet maps its records and the filters go in the address", async ({ page }) => {
  test.skip(!(await page.request.get("https://data.milwaukee.gov/api/3/action/status_show").then((r) => r.ok()).catch(() => false)), "City API unreachable");
  await page.goto("/?q=" + encodeURIComponent("crime incidents police"));
  const code = await page.locator("li[data-code]").filter({ hasText: /NIBRS Crime Data/ }).first().getAttribute("data-code");
  await page.goto(`/d/${code}`);
  const where = page.locator("[data-sheet-where]");
  await expect(where.locator("[data-where-count]")).toContainText("records", { timeout: 30_000 });
  await expect(where.locator("[data-map-summary]")).toContainText("quarter-mile areas");
  await where.locator('[data-filter="what"]').selectOption({ label: "Robbery" });
  await where.locator('[data-filter="where"]').fill("Harambee");
  await expect(page).toHaveURL(/type=120.*area=Harambee|area=Harambee.*type=120/);
  await expect(where.locator("[data-where-count]")).toContainText("In Harambee", { timeout: 30_000 });
});

for (const scheme of ["light", "dark"] as const)
  test(`a City sheet has no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/?q=" + encodeURIComponent("crime incidents police"));
    const code = await page.locator("li[data-code]").filter({ hasText: /NIBRS Crime Data/ }).first().getAttribute("data-code");
    await page.goto(`/d/${code}`);
    await expect(page.locator("[data-where-count], [data-map-message]").first()).toBeVisible({ timeout: 30_000 }); // map tiles never go network-idle
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
