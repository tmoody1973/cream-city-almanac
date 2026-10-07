import { test, type Page } from "@playwright/test";

// Marks appear after hydration reads storage and then load an image; capture only once all of that has landed.
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
}

const FIXED = new Date("2026-10-07T17:00:00Z");

test.describe("@capture", () => {
  test("hero at the comp's size", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    await page.setViewportSize({ width: 1024, height: 1536 });
    await page.goto("/");
    await settle(page);
    await page.screenshot({ path: ".impeccable/review/hero-repro.png" });
  });

  test("desktop and mobile full pages", async ({ page }) => {
    await page.clock.setFixedTime(FIXED);
    for (const [width, height, file] of [
      [1440, 900, "desktop.png"],
      [390, 844, "mobile.png"],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await settle(page);
      await page.screenshot({ path: `.impeccable/review/${file}`, fullPage: true });
    }
  });
});
