import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/?q=asthma", "/d/W01", "/d/N02"];

for (const path of PAGES) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test(`no horizontal scroll on a phone at ${path}`, async ({ page }, info) => {
    test.skip(info.project.name !== "phone");
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("the search works from the keyboard alone", async ({ page }) => {
  await page.goto("/");
  // The search box is the first stop in the tab order.
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("SLUG:")).toBeFocused();
  await page.keyboard.type("asthma");
  await expect(page.locator("[data-code='W01']")).toBeVisible();
  await page.locator("[data-code='W01'] button").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-code='W01'] button")).toHaveAttribute("aria-expanded", "true");
});
