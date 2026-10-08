import AxeBuilder from "@axe-core/playwright";
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const PAGES = ["/", "/?q=asthma", "/d/W01", "/d/N02", "/how-it-works", "/?q=asthma&open=W01"];

// networkidle doesn't wait for Convex's WebSocket search, so wait for real result rows on search pages.
async function settle(page: Page, path: string) {
  await page.waitForLoadState("networkidle");
  if (path.includes("?q=")) await page.locator("li[data-code]").first().waitFor();
}

for (const path of PAGES) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await settle(page, path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test(`no horizontal scroll on a phone at ${path}`, async ({ page }, info) => {
    test.skip(info.project.name !== "phone");
    await page.goto(path);
    await settle(page, path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("the search works from the keyboard alone", async ({ page }, info) => {
  await page.goto("/");
  // The search box comes right after the links above it in reading order (laptop site links, the How it works band).
  // Some browsers skip links when tabbing, so allow up to four stops before it.
  await page.keyboard.press("Tab");
  for (let i = 0; i < 4 && !(await page.getByLabel("SLUG:").evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(page.getByLabel("SLUG:")).toBeFocused();
  await page.keyboard.type("asthma");
  await expect(page.locator("[data-code='W01']")).toBeVisible();
  await page.locator("[data-code='W01'] button").focus();
  await page.keyboard.press("Enter");
  if (info.project.name === "desktop") {
    await expect(page.locator("#sheet-heading")).toBeFocused();
    return;
  }
  await expect(page.locator("[data-code='W01'] button")).toHaveAttribute("aria-expanded", "true");
});

test("an opened result has no serious accessibility issues and no sideways scroll on a phone", async ({ page }, info) => {
  await page.goto("/?q=asthma");
  await settle(page, "/?q=asthma");
  await page.locator("li[data-code] button").first().click();
  // Laptops open the result in the right pane; phones expand it in place.
  if (info.project.name === "desktop") await page.locator("#sheet-pane h2").waitFor();
  else await page.locator("[id^='preview-'] a", { hasText: "Open sheet" }).waitFor();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  if (info.project.name === "phone") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});

test("a year grid with many years scrolls inside its own box on a phone", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  await page.goto("/d/W01");
  const grid = page.getByRole("table", { name: /places and years/i });
  await grid.waitFor();
  // Live data tops out at 4 years today; a DYCU backfill (School Proficiency spans 2015–2025) would add many more.
  await grid.evaluate((table) => {
    for (const row of Array.from(table.querySelectorAll("tr"))) {
      for (let i = 0; i < 8; i++) {
        const cell = document.createElement(row.parentElement?.tagName === "THEAD" ? "th" : "td");
        cell.textContent = String(2030 + i);
        row.appendChild(cell);
      }
    }
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

for (const width of [1024, 1440]) {
  test(`no sideways scroll at ${width}px on the new pages`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/how-it-works", "/?q=asthma&open=W01"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
    }
  });
}
