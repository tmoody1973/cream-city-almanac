import { expect, test } from "@playwright/test";

test("home shows today's rundown with live codes and the catalog line", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /cream city almanac/i })).toBeVisible();
  await expect(page.getByText("TODAY'S RUNDOWN")).toBeVisible();
  await expect(page.getByText(/Catalog as of \w{3} \d{1,2} · 46 datasets · 180 neighborhood reports/)).toBeVisible();
  await expect(page.getByLabel("SLUG:")).toHaveAttribute("placeholder", "What are you reporting on?");
  await expect(page.getByRole("heading", { name: "UPDATED THIS SEASON" })).toBeVisible();
  const rows = page.locator("li[data-code]");
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText("V02");
  await expect(page.getByText("updated since your last visit").first()).toBeAttached();
  await expect(page.getByRole("link", { name: "SEARCH" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Built on Data You Can Use's public data")).toBeVisible();
});
