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

test("the fact sheet list shows an address's fact sheet, district, ward and polling place", async ({ page }) => {
  await page.goto("/n");
  await expect(page.getByRole("link", { name: "Harambee" })).toBeVisible();
  await page.getByLabel("Your address").fill("2400 W Center St");
  await page.getByRole("button", { name: "Find" }).click();
  const panel = page.locator("[data-place-message]");
  await expect(panel.getByRole("link", { name: "Open Amani's fact sheet →" })).toHaveAttribute("href", "/n/amani", { timeout: 20_000 }); // City's Amani (dev check)
  await expect(panel).toContainText(/Aldermanic District \d+ · Alder: /);
  await expect(panel).toContainText(/Ward \d+ · Votes at /);
  await expect(panel.locator("[data-polling-note]")).toContainText(/as of [A-Z][a-z]{2} \d{1,2}, \d{4}/);
  await expect(panel.getByRole("link", { name: "myvote.wi.gov" })).toHaveAttribute("href", "https://myvote.wi.gov");
  await expect(panel).toContainText("Investment areas:");
  await expect(panel).toContainText("Development districts:");
});

test("an address outside DYCU's areas says which City neighborhood it is in", async ({ page }) => {
  await page.goto("/n");
  await page.getByLabel("Your address").fill("2000 S Kinnickinnic Ave");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.locator("[data-place-message]").getByRole("link", { name: /^Open .+'s fact sheet →$/ })).toHaveAttribute("href", /^\/n\/[a-z0-9-]+$/, { timeout: 20_000 });
  // The suggestion opens Ask with a question it can answer for any City neighborhood (a City-records count), never census tracts.
  const link = page.locator("[data-place-message]").getByRole("link", { name: /^Try “How many robberies in .+ this year\?” →$/ });
  await expect(link).toHaveAttribute("href", /^\/ask\?prompt=How%20many%20robberies%20in%20/);
  await expect(page.locator("[data-place-message]")).not.toContainText("tracts");
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

test("a search that names a fact-sheet neighborhood leads with its sheet", async ({ page }) => {
  await page.goto("/search?q=riverwest%20crime");
  const lead = page.locator("[data-fact-lead] > a");
  await expect(lead).toContainText("Riverwest", { timeout: 15_000 });
  await expect(lead).toHaveAttribute("href", "/n/riverwest");
  // A block that reads as a result, not a footnote: a FACT SHEET label and the name at row-title size.
  await expect(page.locator("[data-fact-lead]")).toContainText(/fact sheet/i);
  const size = await page.locator("[data-fact-lead-name]").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(size).toBeGreaterThanOrEqual(22);
  await page.goto("/search?q=robbery");
  await expect(page.locator("[data-fact-lead]")).toHaveCount(0);
});

test("a City neighborhood inside a DYCU area points to that area's sheet too", async ({ page }) => {
  await page.goto("/search?q=arlington%20heights");
  await expect(page.locator("[data-fact-lead-name]")).toHaveText("Arlington Heights", { timeout: 15_000 });
  const within = page.locator("[data-fact-within] a");
  await expect(within).toHaveText("United Community");
  await expect(within).toHaveAttribute("href", "/n/united-community");
  await expect(page.locator("[data-fact-within]")).toContainText(/census tracts/);
});

test("a City neighborhood DYCU doesn't profile opens a sheet built from census tracts", async ({ page }) => {
  await page.goto("/n/bay-view");
  await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Bay View");
  await expect(page.locator("[data-period]")).toContainText("built from census tracts");
  await expect(page.locator("[data-period] abbr")).toHaveText("CENSUS");
  await expect(page.locator("tbody tr[data-fact]")).toHaveCount(8);
  await expect(page.getByText(/^Built from \d+ census tracts?, each counted by the share of its land in Bay View\./)).toBeVisible();
  await expect(page.getByRole("link", { name: /^20\d\d$/ })).toHaveCount(0); // no year switcher
});

test("the fact sheet list adds every City neighborhood", async ({ page }) => {
  await page.goto("/n");
  await expect(page.getByRole("heading", { name: "Every City neighborhood" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bay View", exact: true })).toHaveAttribute("href", "/n/bay-view");
});
