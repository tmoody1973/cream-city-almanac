import { expect, test } from "@playwright/test";

test("home renders the wordmark", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /cream city almanac/i })).toBeVisible();
  await expect(page).toHaveTitle("Cream City Almanac");
});
