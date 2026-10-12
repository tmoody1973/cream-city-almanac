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

test("each figure says what it measures, and DYCU's own data warnings travel with its tables", async ({ page }) => {
  await page.goto("/n/harambee");
  const meaning = page.locator("[data-fact=poverty]").getByText("below the federal poverty line");
  expect((await meaning.boundingBox())?.width ?? 0).toBeGreaterThan(80);
  await page.getByText(/All \d+ of DYCU's tables/).click();
  await expect(page.getByText(/may be missing data/).first()).toBeVisible();
});

test("the fact sheet list finds your neighborhood from an address", async ({ page }) => {
  await page.goto("/n");
  await expect(page.getByRole("link", { name: "Harambee" })).toBeVisible();
  await page.getByLabel("Your address").fill("2400 W Center St");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page).toHaveURL(/\/n\/amani$/, { timeout: 20_000 }); // 2400 W Center St: City neighborhood Amani (dev check)
});

test("an address outside DYCU's areas says which City neighborhood it is in", async ({ page }) => {
  await page.goto("/n");
  await page.getByLabel("Your address").fill("2000 S Kinnickinnic Ave");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.locator("[data-place-message]")).toContainText(/neighborhood|Milwaukee County/, { timeout: 20_000 });
});

test("the address box has a visible label matching its name, and an answer area screen readers already know", async ({ page }) => {
  await page.goto("/n");
  await expect(page.getByText("Your address", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your address" })).toBeVisible();
  await expect(page.locator("form [role=status]")).toHaveCount(1);
});

test("the fact sheets are linked from the footer, How it works and the neighborhood spreadsheet's page", async ({ page }) => {
  for (const [from, name] of [["/", "Neighborhood fact sheets"], ["/how-it-works", "fact sheet you can print"], ["/d/N03", "Open the neighborhood fact sheets →"]] as const) {
    await page.goto(from);
    const link = page.getByRole("link", { name }).first();
    await expect(link).toHaveAttribute("href", "/n");
  }
});
