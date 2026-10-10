import { expect, test } from "./fixtures";

const open = (page: import("@playwright/test").Page, project: string, query = "") =>
  page.goto(project === "desktop" ? `/search?open=N03${query ? `&${query}` : ""}` : `/d/N03${query ? `?${query}` : ""}`);
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
  await page.goto("/search?q=" + encodeURIComponent("Walker's Point race and ethnicity 2023"));
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

test("a search result opens its table even when N03 is already in the pane", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "laptop pane");
  await page.goto("/search?q=" + encodeURIComponent("Lincoln Park employment status by sex"));
  await expect(page.locator("li[data-code]").first()).toHaveAttribute("data-code", "N03");
  await page.locator("li[data-code='N03'] button").click();
  await expect(section(page).locator("caption")).toHaveText("Lincoln Park, 2021: Employment Status by Sex");
});

test("a shared link keeps its table on the other kind of screen", async ({ page }, info) => {
  const choice = "place=walkers-point&year=2023&topic=rent-paid";
  // A phone link opened on a laptop, and a laptop link opened on a phone.
  await page.goto(info.project.name === "desktop" ? `/d/N03?${choice}` : `/search?open=N03&${choice}`);
  // A client-side redirect: under parallel runs the dev server can take longer than the default 5s to serve it.
  await expect(page).toHaveURL(info.project.name === "desktop" ? /\/search\?open=N03&place=walkers-point/ : /\/d\/N03\?place=walkers-point/, { timeout: 15_000 });
  await expect(section(page).locator("caption")).toHaveText(/Walker's Point, 2023: Rent Paid/i);
});

test("grouped heads and section headings carry their table markup", async ({ page }, info) => {
  await open(page, info.project.name, "place=walkers-point&year=2023&topic=sex-and-age");
  await expect(section(page).locator("table colgroup")).toHaveCount(4);
  await open(page, info.project.name, "place=burnham-park-layton-park-silver-city&year=2021&topic=rent-paid");
  const table = section(page).locator("table");
  await expect(table.locator("th[scope=rowgroup]").first()).toBeVisible();
  expect(await table.evaluate((t) => [...t.querySelectorAll("th[scope=rowgroup]")].every((th) => th.parentElement === th.closest("tbody")!.rows[0]))).toBe(true);
});

test("changing the neighborhood keeps the year when the new one has it", async ({ page }, info) => {
  await open(page, info.project.name, "place=walkers-point&year=2023&topic=race-and-ethnicity");
  await expect(section(page).locator("caption")).toHaveText(/Walker's Point, 2023/i); // the address has been applied
  await section(page).getByLabel("Neighborhood").selectOption("burnham-park-layton-park-silver-city");
  await expect(section(page).locator("caption")).toHaveText(/, 2023: Race and Ethnicity$/i);
});
