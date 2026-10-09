import AxeBuilder from "@axe-core/playwright";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const DARK_PAPER = "rgb(20, 20, 19)";
const LIGHT_PAPER = "rgb(255, 255, 255)";
const paper = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const pick = (page: Page, name: "Auto" | "Light" | "Dark") =>
  page.getByRole("group", { name: "Theme" }).getByRole("button", { name, exact: true }).click();

test("a dark device gets dark paper, and native controls go dark too", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/start-here");
  expect(await paper(page)).toBe(DARK_PAPER);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
});

test("a light device stays on white paper", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/start-here");
  expect(await paper(page)).toBe(LIGHT_PAPER);
});

test("the footer switch overrides the device, remembers it, and applies it before the page draws", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/start-here");
  await pick(page, "Dark");
  await expect(page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await paper(page)).toBe(DARK_PAPER);
  await page.reload({ waitUntil: "domcontentloaded" });
  // Set by the inline script during parsing, before React runs: no flash of white.
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  expect(await paper(page)).toBe(DARK_PAPER);
});

test("Light beats a dark device, and Auto hands back to the device", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/how-it-works");
  await pick(page, "Light");
  expect(await paper(page)).toBe(LIGHT_PAPER);
  await pick(page, "Auto");
  expect(await paper(page)).toBe(DARK_PAPER);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
});

test("Clerk's account window follows dark mode", async ({ page }) => {
  test.skip(!process.env.E2E_CLERK_USER_EMAIL, "needs the Clerk test user");
  await page.emulateMedia({ colorScheme: "dark" });
  await setupClerkTestingToken({ page });
  await page.goto("/start-here");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.reload();
  await page.getByRole("button", { name: /^account$/i }).filter({ visible: true }).first().click();
  const root = page.locator(".cl-userProfile-root");
  await expect(root).toBeVisible({ timeout: 15_000 });
  // The window's own panel takes the page's paper (Clerk reads --clerk-color-background from globals.css).
  await expect(root.locator(".cl-scrollBox").first()).toHaveCSS("background-color", DARK_PAPER);
});

const PAGES = ["/", "/?q=asthma", "/d/W01", "/d/N03", "/how-it-works", "/start-here", "/?q=asthma&open=W01"];
for (const path of PAGES) {
  test(`no serious accessibility violations in dark mode on ${path}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    if (path.includes("?q=")) await page.locator("li[data-code]").first().waitFor();
    expect(await paper(page)).toBe(DARK_PAPER);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
