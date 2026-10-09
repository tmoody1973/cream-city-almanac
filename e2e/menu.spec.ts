import AxeBuilder from "@axe-core/playwright";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const menuButton = (page: Page) => page.getByRole("button", { name: "MENU", exact: true });
const menu = (page: Page) => page.getByRole("dialog", { name: "Menu" });

test.describe("phone menu", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "phone", "phones only"));

  for (const [path, current] of [["/", "SEARCH"], ["/start-here", "START HERE"], ["/how-it-works", "HOW IT WORKS"], ["/d/W01", null], ["/ask", "ASK"]] as const)
    test(`MENU on ${path} opens every page, marking the current one`, async ({ page }) => {
      await page.goto(path);
      await menuButton(page).click();
      const m = menu(page);
      await expect(m).toBeVisible();
      for (const name of ["SEARCH", "ASK", "START HERE", "HOW IT WORKS"]) await expect(m.getByRole("link", { name, exact: true })).toBeVisible();
      await expect(m.getByRole("group", { name: "Theme" })).toBeVisible();
      if (current) await expect(m.getByRole("link", { name: current, exact: true })).toHaveAttribute("aria-current", "page");
      else await expect(m.locator("[aria-current=page]")).toHaveCount(0);
    });

  test("Escape and CLOSE close it, and focus goes back to MENU", async ({ page }) => {
    await page.goto("/start-here");
    await menuButton(page).click();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(menu(page)).toBeHidden();
    await expect(menuButton(page)).toBeFocused();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await menuButton(page).click();
    await menu(page).getByRole("button", { name: /close/i }).click();
    await expect(menu(page)).toBeHidden();
  });

  test("a link in the menu goes there and the menu is gone", async ({ page }) => {
    await page.goto("/");
    await menuButton(page).click();
    await menu(page).getByRole("link", { name: "HOW IT WORKS", exact: true }).click();
    await expect(page).toHaveURL(/\/how-it-works/);
    await expect(menu(page)).toBeHidden();
  });

  test("the home page keeps today's date under MENU", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header").getByText(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.*\d{4}/)).toBeVisible();
  });

  test("no serious accessibility violations with the menu open, light and dark", async ({ page }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/start-here");
      await menuButton(page).click();
      await expect(menu(page)).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${scheme} ${v.id}: ${v.nodes.length}`)).toEqual([]);
    }
  });

  test("signed in, ACCOUNT in the menu opens Clerk's window in front", async ({ page }) => {
    test.skip(!process.env.E2E_CLERK_USER_EMAIL, "needs the Clerk test user");
    await setupClerkTestingToken({ page });
    await page.goto("/start-here");
    await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
    await page.reload();
    await menuButton(page).click();
    await expect(menu(page).getByRole("button", { name: "SIGN OUT", exact: true })).toBeVisible();
    await menu(page).getByRole("button", { name: "ACCOUNT", exact: true }).click();
    await expect(menu(page)).toBeHidden();
    await expect(page.locator(".cl-userProfile-root")).toBeVisible({ timeout: 15_000 });
  });

  test("signed out, SIGN IN in the menu opens Clerk's sign-in in front", async ({ page }) => {
    await page.goto("/start-here");
    await menuButton(page).click();
    await menu(page).getByRole("button", { name: "SIGN IN", exact: true }).click();
    await expect(menu(page)).toBeHidden();
    await expect(page.locator(".cl-signIn-root")).toBeVisible({ timeout: 15_000 });
  });
});

test("the wordmark links home", async ({ page }) => {
  await page.goto("/start-here");
  await page.getByRole("link", { name: "Cream City Almanac" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("laptops have no MENU", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await page.goto("/start-here");
  await expect(menuButton(page)).toBeHidden();
});
