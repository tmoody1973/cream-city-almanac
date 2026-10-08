import { expect, test } from "./fixtures";

const open = (page: import("@playwright/test").Page, project: string, query = "") =>
  page.goto(project === "desktop" ? `/?open=N03${query ? `&${query}` : ""}` : `/d/N03${query ? `?${query}` : ""}`);
const section = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "What's in each spreadsheet" });

test("shows a neighborhood's table with margins of error, and puts it in the address", async ({ page }, info) => {
  await open(page, info.project.name);
  const s = section(page);
  await s.getByLabel("Neighborhood").selectOption({ label: "Walker's Point" });
  await s.getByLabel("Year").selectOption({ label: "2023" });
  await s.getByRole("button", { name: /Race and Ethnicity/ }).click();
  const table = s.getByRole("table", { name: /Walker's Point, 2023: Race and Ethnicity/ });
  await expect(table).toContainText("7,668");
  await expect(table).toContainText("±790");
  await expect(page).toHaveURL(/place=walkers-point/);
  await expect(page).toHaveURL(/year=2023/);
  await expect(page).toHaveURL(/topic=race-and-ethnicity/);
  await expect(s.getByRole("link", { name: "B03002" })).toHaveAttribute("href", "https://data.census.gov/table?q=B03002");
});

test("DYCU's file problems are shown above the table", async ({ page }, info) => {
  await open(page, info.project.name, "place=walkers-point&year=2023&topic=sex-and-age");
  await expect(section(page).getByText("The Total columns are 0 for every row in DYCU's file")).toBeVisible();
});

test("a topic missing from the 2021 layout says so", async ({ page }, info) => {
  await open(page, info.project.name, "place=burnham-park-layton-park-silver-city&year=2021");
  await expect(section(page).getByText(/Commute Method and Time.*not in this year's file/)).toBeVisible();
});

test("an unknown address falls back to the newest file", async ({ page }, info) => {
  await open(page, info.project.name, "place=nowhere&year=1999&topic=zzz");
  await expect(section(page).getByRole("table").first()).toBeVisible();
});

test("the address restores the table after a reload", async ({ page }, info) => {
  await open(page, info.project.name, "place=walkers-point&year=2023&topic=rent-paid");
  await page.reload();
  await expect(section(page).getByRole("table", { name: /Walker's Point, 2023: Rent Paid/ })).toBeVisible();
});

test("switching neighborhoods quickly shows only the last choice", async ({ page }, info) => {
  await open(page, info.project.name);
  const pick = section(page).getByLabel("Neighborhood");
  await pick.selectOption({ label: "Walker's Point" });
  await pick.selectOption({ index: 0 });
  const label = await pick.locator("option").first().textContent();
  await expect(section(page).getByRole("table").first()).toHaveAccessibleName(new RegExp(`^${label!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, `));
});

test("a neighborhood search opens that table", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "laptop pane");
  await page.goto("/?q=" + encodeURIComponent("Walker's Point race and ethnicity 2023"));
  await page.locator("li[data-code='N03'] button").click();
  await expect(page).toHaveURL(/open=N03/);
  await expect(page).toHaveURL(/topic=race-and-ethnicity/);
});

test("on a phone, choosing a topic brings its table into view", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the list sits above the table only on narrow screens");
  await page.goto("/d/N03?place=walkers-point&year=2023&topic=household-income");
  await page.waitForLoadState("networkidle"); // a tap before hydration is replayed before the table's ref attaches
  const s = section(page);
  const first = s.getByRole("button", { name: /Race and Ethnicity/ });
  await first.evaluate((b) => b.scrollIntoView({ block: "start" }));
  await first.click();
  await expect(s.getByText("Walker's Point, 2023: Race and Ethnicity")).toBeVisible();
  // WebKit's intersection check reports 0 for a <caption>, so measure where the caption landed.
  const half = page.viewportSize()!.height / 2;
  await expect.poll(() => s.locator("caption").evaluate((c) => c.getBoundingClientRect().top)).toBeLessThan(half);
});
