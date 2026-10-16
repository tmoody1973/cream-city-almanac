import { expect, test } from "./fixtures";

test.use({ tours: true });

test("a first visit gets the front-page tour; skip keeps it away; ?tour=1 replays it", async ({ page }, info) => {
  await page.goto("/");
  const note = page.locator("[data-tour-tooltip]");
  await expect(note).toContainText("START WITH YOUR ADDRESS", { timeout: 15_000 });
  await expect(note).toContainText("1 OF");
  // Opening the tour must not scroll the masthead and headline off the screen.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("heading", { name: "Look up your Milwaukee neighborhood." })).toBeInViewport();
  await expect(page.locator('[data-tour="address"] input[data-tour-active]')).toHaveCount(1);
  // DESIGN.md: no shadow, no fade (review I1); the note is a named dialog whose words are read out (review I2).
  const floater = page.locator(".react-joyride__floater");
  await expect(floater).toHaveCSS("filter", "none");
  await expect(floater).toHaveCSS("transition-duration", "0s");
  await expect(page.getByRole("alertdialog", { name: "START WITH YOUR ADDRESS" })).toHaveAccessibleDescription(/Type where you live/);
  // The note sits outside the page, so it must carry the laptop type sizes itself (16px small text at most).
  const size = await note.locator("p").last().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(size).toBeLessThanOrEqual(info.project.name === "desktop" ? 16 : 26);
  await note.getByRole("button", { name: "Skip tour" }).click();
  await expect(note).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(1_500);
  await expect(page.locator("[data-tour-tooltip]")).toHaveCount(0);
  await page.goto("/?tour=1");
  await expect(page.locator("[data-tour-tooltip]")).toContainText("START WITH YOUR ADDRESS", { timeout: 15_000 });
});

test("Start here lists what you can ask, each opening Ask with the question", async ({ page }) => {
  await page.goto("/start-here");
  const rows = page.locator("[data-start-ask] li");
  await expect(rows).toHaveCount(7);
  await expect(rows.first()).toContainText("CITY RECORDS");
  await expect(rows.first().getByRole("link")).toHaveAttribute("href", /^\/ask\?prompt=How%20many%20robberies/);
  await expect(page.getByRole("link", { name: /TAKE THE TOUR/ })).toHaveAttribute("href", "/?tour=1");
});
