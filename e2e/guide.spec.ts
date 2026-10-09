import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

test("the guide shows a live sample answer and three roles of examples", async ({ page }) => {
  await page.goto("/ask/guide");
  await expect(page.getByRole("heading", { name: "HOW TO USE ASK", level: 2 })).toBeVisible();
  const card = page.locator("[data-card=number]");
  await expect(card).toContainText("Under 5 years");
  await expect(card.locator("[data-row-marked] td").first()).toHaveText(/\d/);
  for (const who of ["A JOURNALIST", "A NONPROFIT", "A CITIZEN"]) await expect(page.getByRole("heading", { name: who })).toBeVisible();
  await expect(page.locator("[data-role] a[href^='/ask?prompt=']")).toHaveCount(12);
  await expect(page.getByText(/made-up figure/)).toBeVisible();
});

test("an example opens Ask with its question waiting (signed out)", async ({ page }) => {
  await page.goto("/ask/guide");
  const link = page.locator("[data-role=citizen] a").first();
  const q = (await link.textContent())!.trim();
  await link.click();
  await expect(page.getByText(`Your question is waiting: “${q}”`).filter({ visible: true })).toBeVisible({ timeout: 15_000 });
});

for (const scheme of ["light", "dark"] as const)
  test(`no serious accessibility violations on the guide (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/ask/guide");
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

test("no sideways scroll on a phone", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  await page.goto("/ask/guide");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
