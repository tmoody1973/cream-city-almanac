import { expect, test } from "@playwright/test";

test("home shows today's rundown with live codes and the catalog line", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /cream city almanac/i })).toBeVisible();
  await expect(page.getByText("TODAY'S RUNDOWN")).toBeVisible();
  await expect(page.getByText(/Catalog as of \w{3} \d{1,2} · \d+ raw data · \d+ reports · \d+ visualizations/)).toBeVisible();
  await expect(page.getByLabel("SLUG:")).toHaveAttribute("placeholder", "What are you reporting on?");
  await expect(page.getByRole("heading", { name: "UPDATED THIS SEASON" })).toBeVisible();
  const rows = page.locator("li[data-code]");
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText("V02");
  await expect(page.getByText("updated since your last visit").first()).toBeAttached();
  await expect(page.getByRole("link", { name: "SEARCH" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Built on Data You Can Use's public data")).toBeVisible();
});

test("searching by meaning finds a dataset and opens it in place", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("SLUG:").fill("asthma");
  await expect(page).toHaveURL(/\?q=asthma/);
  const row = page.locator("[data-code='W01']");
  await expect(row).toBeVisible();
  await expect(page.getByText(/RUNDOWN · \d+ results/)).toBeVisible();
  await row.getByRole("button").click();
  await expect(row.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  await expect(row.getByRole("table", { name: /places and years/i })).toBeVisible();
  await expect(row.getByText("AI", { exact: true })).toBeVisible();
  await expect(row.getByRole("link", { name: "Open sheet" })).toHaveAttribute("href", "/d/W01");
  await expect(row.getByRole("link", { name: "CSV" })).toHaveAttribute("href", /\/csv/);
});

test("a suggestion tag runs a search and clearing returns to the rundown", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "food insecurity" }).click();
  await expect(page.locator("[data-code='F02']")).toBeVisible();
  await page.getByLabel("SLUG:").fill("");
  await expect(page.getByRole("heading", { name: "UPDATED THIS SEASON" })).toBeVisible();
});

test("a nonsense search explains that nothing matched", async ({ page }) => {
  await page.goto("/?q=zzqqxxjj");
  await expect(page.getByRole("status")).toContainText("No datasets matched");
});

test("a dropped connection ends in the failure notice, not endless loading", async ({ page, context }, info) => {
  // WebKit's emulated offline mode keeps an open WebSocket alive (search still answers, measured 2026-10-07),
  // so only Chromium can simulate the dropped connection.
  test.skip(info.project.name === "phone", "WebKit offline emulation does not drop open WebSockets");
  await page.goto("/");
  await expect(page.locator("li[data-code]").first()).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("SLUG:").fill("asthma");
  await expect(page.getByRole("status")).toContainText("Search failed", { timeout: 20_000 });
  await context.setOffline(false);
});
