import { expect, test } from "./fixtures";

test("a dataset sheet explains, previews and offers downloads", async ({ page }) => {
  await page.goto("/d/W01");
  await expect(page.getByRole("heading", { level: 2, name: /Asthma Prevalence/ })).toBeVisible();
  await expect(page.getByRole("table", { name: /places and years/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "WHAT IT MEASURES" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "COLUMN GUIDE" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Column guide" }).getByText("DYCU").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "LIVE PREVIEW" })).toBeVisible();
  await expect(page.getByRole("table", { name: /first rows/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: "CSV" }).first()).toHaveAttribute("href", /\/csv/);
});

test("lowercase codes work and opening a sheet ticks it on the rundown", async ({ page }) => {
  await page.goto("/d/v02");
  await expect(page.getByRole("heading", { level: 2, name: /Daily Air Quality/ })).toBeVisible();
  await page.goto("/");
  await expect(page.locator("[data-code='V02']").getByText("opened before")).toBeAttached();
});

test("unknown code shows the not-found page", async ({ page }) => {
  const res = await page.goto("/d/Z99");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("No dataset with that code")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the rundown" })).toHaveAttribute("href", "/");
});

test("when the Hub is down the preview says so and offers a retry", async ({ page }) => {
  await page.route(/FeatureServer\/\d+\/query/, (route) => route.abort());
  await page.goto("/d/W01");
  await expect(page.getByText(/Preview unavailable/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("link", { name: "CSV" }).first()).toBeVisible();
});

test("a report family lists its neighborhood documents", async ({ page }) => {
  await page.goto("/d/N02");
  await expect(page.getByRole("heading", { name: "ALL VERSIONS" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Harambee/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "PDF" }).first()).toHaveAttribute("href", /arcgis\.com\/sharing\/rest\/content\/items\/\w+\/data/);
});

test("the live chart plots every year, even when layers spell the column differently", async ({ page }) => {
  await page.goto("/d/W01");
  const series = page.locator("figure svg > g");
  await expect(series).toHaveCount(3, { timeout: 20_000 });
  for (const g of await series.all()) await expect(g.locator("circle").first()).toBeAttached({ timeout: 20_000 });
});
