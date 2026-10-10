import { expect, test } from "./fixtures";

test("a bare / is the landing page; a campaign tag keeps it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A guide to Milwaukee's public data." })).toBeVisible();
  await page.goto("/?utm_source=linkedin");
  await expect(page).toHaveURL(/\/\?utm_source=linkedin$/);
  await expect(page.getByRole("heading", { name: "A guide to Milwaukee's public data." })).toBeVisible();
});

test("links from before the move land on the same search view", async ({ page }) => {
  // The redirect itself passes the address through unchanged...
  const hop = await page.request.get("/?q=homicide&open=P14", { maxRedirects: 0 });
  expect(hop.status()).toBe(307);
  expect(hop.headers().location).toBe("/search?q=homicide&open=P14");
  // ...then the search screen tidies the order of the parameters, so the page's own address is checked order-free.
  await page.goto("/?q=homicide&open=P14");
  await expect(page).toHaveURL(/\/search\?(?=.*q=homicide)(?=.*open=P14)/);
  await page.goto("/?ask=1&prompt=" + encodeURIComponent("Rent in Lincoln Park"));
  await expect(page).toHaveURL(/\/search\?ask=1&prompt=Rent/);
});

test("Back to the rundown goes to search, not the landing page", async ({ page }) => {
  await page.goto("/d/ZZ99");
  await page.getByRole("link", { name: /back to the rundown/i }).click();
  await expect(page).toHaveURL(/\/search$/);
});

test("the landing page explains the almanac, with live numbers and working links", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Find it. Understand it. Check where it came from.")).toBeVisible();
  for (const h of ["Find it", "Understand it", "Check where it came from", "The data", "Ask a question", "Who it's for"]) {
    await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
  }
  await expect(page.locator("[data-landing-count=dycu]")).toHaveText(/^\d+$/);
  await expect(page.locator("[data-landing-count=city]")).toHaveText(/^\d+$/);
  await expect(page.getByText("Unofficial. Not affiliated with Data You Can Use or the City of Milwaukee.")).toBeVisible();
  // Whole words only ("RAG" must not match "average" or "coverage").
  expect(await page.locator("main").innerText()).not.toMatch(/open data portal|data catalog|\bplatform\b|\bdashboard\b|\btool\b|\bRAG\b|AI-powered/i);
  await page.getByRole("link", { name: /start here/i }).first().click();
  await expect(page).toHaveURL(/\/start-here$/);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("the search entry still submits to /search", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: /topic/i }).fill("kids who can't afford food");
    await page.getByRole("searchbox", { name: /topic/i }).press("Enter");
    await expect(page).toHaveURL(/\/search\?q=kids/);
  });
});
