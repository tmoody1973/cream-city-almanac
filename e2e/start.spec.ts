import { expect, test } from "./fixtures";

test("a guide page opens as a guide, not a dataset", async ({ page }, info) => {
  await page.goto("/d/X02");
  if (info.project.name === "desktop") await expect(page).toHaveURL(/open=X02/);
  await expect(page.getByText("A guide page on DYCU's Hub, not a dataset.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open it on the Hub/ })).toHaveAttribute("href", /getdata-dycu\.hub\.arcgis\.com\/pages\//);
  await expect(page.getByRole("heading", { name: "WHAT IT MEASURES" })).toHaveCount(0);
});

test("Start here walks through three real examples", async ({ page }) => {
  await page.goto("/start-here");
  await expect(page).toHaveTitle(/Start here/);
  for (const who of ["A REPORTER", "A NONPROFIT", "A RESIDENT"]) await expect(page.getByRole("heading", { name: who })).toBeVisible();
  await expect(page.getByText(/^Harambee, \d{4}: Poverty Status by Age$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "DYCU'S OWN GUIDES" })).toBeVisible();
  for (const name of ["Getting Started", "About the Data", "Questions and Feedback"]) {
    await expect(page.getByRole("link", { name })).toHaveAttribute("href", /getdata-dycu\.hub\.arcgis\.com\/pages\//);
  }
});

test("the nonprofit excerpt matches the stored table", async ({ page }) => {
  await page.goto("/start-here");
  const caption = await page.getByText(/^Harambee, \d{4}: Poverty Status by Age$/).textContent();
  const year = caption!.match(/\d{4}/)![0];
  const excerptFirstRow = await page.locator("[data-example=nonprofit] tbody tr").first().textContent();
  await page.goto(`/d/N03?place=harambee&year=${year}&topic=poverty-status-by-age`);
  await expect(page.locator("section[aria-labelledby=portrait-heading] tbody tr").first()).toHaveText(excerptFirstRow!);
});

test("each Try it link lands where its steps say", async ({ page }, info) => {
  await page.goto("/start-here");
  await page.locator("[data-example=nonprofit]").getByRole("link", { name: /Try it/ }).click();
  // Laptops redirect into the two-pane view, which loads the sheet live: allow for a slow connection.
  await expect(page.locator("section[aria-labelledby=portrait-heading] caption")).toHaveText(/Harambee, \d{4}: Poverty Status by Age/i, { timeout: 15_000 });
  await page.goto("/start-here");
  await page.locator("[data-example=resident]").getByRole("link", { name: /Try it/ }).click();
  // A client-side redirect on laptops (/d/V02 → the two-pane view).
  await expect(page).toHaveURL(info.project.name === "desktop" ? /open=V02/ : /\/d\/V02/, { timeout: 15_000 });
});

test("the masthead, home band and footer lead to Start here", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Start here/ }).first()).toHaveAttribute("href", "/start-here");
  await expect(page.locator("footer").getByRole("link", { name: "Start here" })).toHaveAttribute("href", "/start-here");
  if (info.project.name === "desktop") {
    await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "START HERE" })).toHaveAttribute("href", "/start-here");
  }
});

test("no sideways scroll on Start here", async ({ page }, info) => {
  for (const width of info.project.name === "desktop" ? [1024, 1440] : [390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/start-here");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});

test("the resident's chart runs one mark per day, January to December", async ({ page }) => {
  await page.goto("/start-here");
  const chart = page.locator("[data-example=resident] figure");
  await expect(chart.locator("figcaption")).toHaveText(/^Each mark is one day, January to December\. A stronger mark means a higher reading \(.+\); every row shares one scale\.$/);
  await expect(chart.getByText("Jan 1")).toBeVisible();
  // One mark per day: a year's row holds about 365 of them, not a handful.
  expect(await chart.locator("g").first().locator("rect").count()).toBeGreaterThan(300);
});

test("the reporter's search finds both datasets", async ({ page }) => {
  await page.goto("/?q=" + encodeURIComponent("older housing and asthma rates"));
  await expect(page.locator("li[data-code]").first()).toBeVisible();
  const codes = await page.locator("li[data-code]").evaluateAll((els) => els.slice(0, 5).map((e) => e.getAttribute("data-code")));
  expect(codes).toEqual(expect.arrayContaining(["W01", "H05"]));
});

test("the resident chart's labels stay readable", async ({ page }) => {
  await page.goto("/start-here");
  const label = page.locator("[data-example=resident] figure text").first();
  await expect(label).toBeVisible();
  expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(11);
});

test("a guide page's phone preview links out and to Start here", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the inline preview is the phone's");
  await page.goto("/?q=" + encodeURIComponent("getting started"));
  await page.locator("li[data-code='X02'] button").click();
  const preview = page.locator("li[data-code='X02'] [id^=preview-]");
  await expect(preview.getByText("A guide page on DYCU's Hub, not a dataset.")).toBeVisible();
  await expect(preview.getByRole("link", { name: "Start here" })).toHaveAttribute("href", "/start-here");
});
