import { expect, test } from "./fixtures";

test("/about explains the almanac with its own working parts, address first", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "What's in the Almanac" })).toBeVisible();
  // Entry 1 is the action: the address box, labeled by name.
  await expect(page.getByRole("textbox", { name: "Your address" })).toBeVisible();
  await expect(page.getByText("Sent to the U.S. Census Bureau to find it; never kept.")).toBeVisible();
  // Entry 2 is a real fact-sheet row that opens its sheet; entry 3 a live City count or its link, never a made-up number.
  await expect(page.locator('a[href="/n/riverwest"]').first()).toContainText("%");
  const sample = page.locator("[data-about-sample]");
  await expect(sample).toHaveAttribute("data-about-sample", "done", { timeout: 30_000 });
  await expect(sample.locator("p", { hasText: /^\d[\d,]*$/ }).or(sample.getByRole("link", { name: /See the count/ })).first()).toBeVisible();
  for (const h of ["Your address", "Your neighborhood", "Ask in plain English", "Search", "How you know", "What you can ask", "For reporters", "For nonprofits", "Good to know"]) {
    await expect(page.getByRole("heading", { name: h, exact: true })).toBeVisible();
  }
  for (const tag of ["DYCU", "CITY", "CENSUS", "HCM", "AI"]) await expect(page.locator("dl abbr", { hasText: tag })).toHaveCount(1);
  expect(await page.locator("main").innerText()).not.toMatch(/\bplatform\b|\bdashboard\b|AI-powered|seamless|leverage/i);
});

test("/about's search entry submits to /search", async ({ page }) => {
  await page.goto("/about");
  await page.getByRole("searchbox", { name: "Topic" }).fill("asthma");
  await page.getByRole("searchbox", { name: "Topic" }).press("Enter");
  await expect(page).toHaveURL(/\/search\?q=asthma/);
});

test("/about is linked from every page's footer", async ({ page }) => {
  await page.goto("/start-here");
  await page.getByRole("contentinfo").getByRole("link", { name: "What's in the Almanac" }).click();
  await expect(page).toHaveURL(/\/about$/);
});
