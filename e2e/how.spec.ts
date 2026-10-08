import { expect, test } from "./fixtures";

const NOTES = ["every year & place DYCU publishes", "who wrote this", "live rows from DYCU's Hub", "download the real data"];
const SECTIONS = ["WHAT IT IS", "WHERE THE DATA COMES FROM", "EACH WEEK", "WHAT THE AI DOES", "HOW SEARCH WORKS", "HOW IT'S BUILT", "LIMITS AND CREDITS"];

test("How it works explains the product with live numbers", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page).toHaveTitle(/How it works/);
  await expect(page.getByRole("heading", { level: 2, name: /how to read a dataset in 60 seconds/i })).toBeVisible();
  await expect(page.getByText(/\d+ raw data · \d+ reports · \d+ visualizations/).first()).toBeVisible();
  await expect(page.getByRole("figure", { name: /how to read W01/i })).toBeVisible();
  for (const note of NOTES) await expect(page.getByText(note).first()).toBeVisible();
  for (const name of SECTIONS) await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText(/read the \d+ report PDFs/i)).toBeVisible();
  await expect(page.getByText(/unofficial, phone-first way to find, understand and download/i)).toBeVisible();
});

test("its links go where they say", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByRole("link", { name: "the decision log" })).toHaveAttribute(
    "href",
    "https://github.com/tmoody1973/cream-city-almanac/tree/main/docs/decisions",
  );
  await expect(page.getByRole("link", { name: "Tarik Moody" })).toHaveAttribute("href", "https://github.com/tmoody1973");
  await expect(page.getByRole("link", { name: "hub@datayoucanuse.org" })).toHaveAttribute("href", "mailto:hub@datayoucanuse.org");
  await page.getByRole("link", { name: "kids who can't afford food" }).click();
  await expect(page.locator("li[data-code='F02']")).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("the explanation still reads", async ({ page }) => {
    await page.goto("/how-it-works");
    await expect(page.getByRole("heading", { level: 2, name: /how to read a dataset/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "EACH WEEK" })).toBeVisible();
  });
});

test("sections follow the approved comps' order, the same on every screen", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.locator("section h3")).toHaveText([
    "EACH WEEK",
    "WHAT THE AI DOES",
    "HOW SEARCH WORKS",
    "WHAT IT IS",
    "WHERE THE DATA COMES FROM",
    "HOW IT'S BUILT",
    "LIMITS AND CREDITS",
  ]);
});

test("the search-check count comes from the question list", async ({ page }) => {
  const { QUESTIONS } = await import("../convex/lib/evalQuestions");
  await page.goto("/how-it-works");
  await expect(page.getByText(`grades search on ${QUESTIONS.length} reporter-style questions`)).toBeVisible();
});
