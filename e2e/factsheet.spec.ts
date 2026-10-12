import { expect, test } from "./fixtures";

test("a fact sheet sets each headline beside the city, prints, and fits the screen", async ({ page }) => {
  await page.goto("/n/harambee");
  await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Harambee");
  const poverty = page.locator("[data-fact=poverty]");
  await expect(poverty).toContainText("People in poverty");
  await expect(poverty.locator("[data-city]")).toContainText("%");
  await expect(poverty.locator("[data-verdict]")).toContainText(/than the city|about the same/);
  await expect(page.getByText("U.S. Census Bureau, American Community Survey 5-year estimates, City of Milwaukee")).toBeVisible();
  await expect(page.getByRole("button", { name: /print/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the year switcher picks another year, and an unknown name lists the areas", async ({ page }) => {
  await page.goto("/n/harambee?year=2023");
  await expect(page.locator("[data-period]")).toContainText("2019–2023");
  await page.goto("/n/nowhere");
  await expect(page.getByRole("link", { name: "Harambee" })).toBeVisible();
});
