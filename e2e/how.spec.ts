import { expect, test } from "./fixtures";

const NOTES = ["every year & place DYCU publishes", "who wrote this", "live rows from DYCU's Hub", "download the real data"];
const SECTIONS = ["WHAT “NEIGHBORHOOD” MEANS HERE", "WHAT IT IS", "WHERE THE DATA COMES FROM", "EACH WEEK", "WHAT THE AI DOES", "HOW SEARCH WORKS", "HOW IT'S BUILT", "LIMITS AND CREDITS"];

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

test("it explains the two neighborhood maps and lists DYCU's areas with their tracts", async ({ page }) => {
  await page.goto("/how-it-works#neighborhoods");
  const section = page.locator("#neighborhoods");
  await expect(section).toContainText("190 official neighborhoods");
  await expect(section).toContainText("27 report areas");
  await expect(section).toContainText("at least 10% of the tract");
  await section.getByText("Which tracts make up each DYCU area").click();
  await expect(section.locator("[data-area='United Community']")).toContainText("47");
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
    "WHAT “NEIGHBORHOOD” MEANS HERE",
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

test("it explains the neighborhood spreadsheets, and its example lands on one", async ({ page }, info) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/Open the Neighborhood Portrait spreadsheets/)).toBeVisible();
  await expect(page.getByRole("link", { name: "N03 sheet" })).toHaveAttribute("href", "/d/N03");
  await expect(page.getByText(/Spreadsheet numbers appear as DYCU wrote them/)).toBeVisible();
  await page.getByRole("link", { name: "Lincoln Park employment status by sex" }).click();
  await expect(page.locator("li[data-code]").first()).toHaveAttribute("data-code", "N03");
  if (info.project.name === "desktop") {
    await expect(page.locator("section[aria-labelledby=portrait-heading] caption")).toHaveText("Lincoln Park, 2021: Employment Status by Sex");
  }
});

test("it says answers can be exported with their source and caveats", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/Ask's number cards can be exported as a CSV, as plain text or as an image/)).toBeVisible();
});

test("it explains how-long answers in plain words", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/The median is the middle case: half took less time/)).toBeVisible();
});

test("it links to the diagram of how Ask answers a question, and the diagram opens", async ({ page }) => {
  await page.goto("/how-it-works");
  const link = page.getByRole("link", { name: "the diagram of how Ask answers a question" });
  await expect(link).toHaveAttribute("href", "/how-ask-works.html");
  await page.goto("/how-ask-works.html");
  await expect(page).toHaveTitle(/How Cream City Almanac answers a question/);
  await expect(page.locator("svg text", { hasText: "Code does the math" }).first()).toBeVisible();
});
