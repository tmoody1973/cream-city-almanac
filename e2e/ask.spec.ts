// The shared fixtures add the Vercel preview bypass in CI.
import { expect, test } from "./fixtures";

test("signed out, Ask offers sign-in and search stays public", async ({ page }, info) => {
  await page.goto(info.project.name === "phone" ? "/ask" : "/?ask=1");
  await expect(page.getByRole("button", { name: "Sign in to ask" })).toBeVisible();
  await page.goto("/d/N03");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("signed out, there is no ACCOUNT", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "ASK" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^account$/i })).toHaveCount(0);
});

test("the masthead ASK is a link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "ASK" }).first()).toHaveAttribute("href", "/ask");
});

test.describe("signed in", () => {
  test.skip(!process.env.E2E_CLERK_USER_EMAIL || !process.env.CLERK_SECRET_KEY, "needs a Clerk test user");

  test.beforeEach(async ({ page }, info) => {
    const { clerk, setupClerkTestingToken } = await import("@clerk/testing/playwright");
    await setupClerkTestingToken({ page });
    // The scripted test model (lib/ask/model.ts): no real AI calls, no cost, not counted against the account.
    // Only our route gets the header (sent everywhere it breaks Clerk's cross-origin requests); fallback() then lets
    // the fixtures' preview-bypass route add its header too.
    await page.route("**/api/copilotkit/**", (route) => route.fallback({ headers: { ...route.request().headers(), "x-ask-fake": "1" } }));
    // Sign in on the page under test, then reload: Clerk navigates on its own after signing in.
    const target = info.project.name === "phone" ? "/ask" : "/?ask=1";
    await page.goto(target);
    await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
    // Clerk may still be redirecting after sign-in; a canceled reload just means load the page fresh.
    await page.reload().catch(() => page.goto(target));
  });

  // The chat accepts a question once it has connected; retry Enter until the box empties (the question was sent).
  const ask = async (page: import("@playwright/test").Page, q: string) => {
    const box = page.getByPlaceholder("Ask about Milwaukee data");
    await box.fill(q);
    await expect(async () => {
      if ((await box.inputValue()) !== "") await box.press("Enter");
      await expect(box).toHaveValue("", { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  };

  test("a poverty question opens the Harambee table with the row marked (laptop) or excerpted (phone)", async ({ page }, info) => {
    await ask(page, "How many kids under 5 are in poverty in Harambee?");
    await expect(page.getByText("Here is what the data shows.")).toBeVisible({ timeout: 30_000 });
    if (info.project.name === "phone") {
      const card = page.locator("[data-card=number]");
      await expect(card.locator("[data-row-marked]")).toContainText("Under 5 years");
      await expect(card).toContainText("±");
      await expect(card.getByRole("link", { name: /Open the full table/ })).toHaveAttribute("href", /\/d\/N03\?place=harambee&year=\d{4}&topic=poverty-status-by-age&row=2/);
    } else {
      await expect(page.locator("#sheet-pane [data-row-marked]")).toContainText("Under 5 years", { timeout: 20_000 });
      await expect(page).toHaveURL(/ask=1.*open=N03.*row=2/);
      await expect(page.locator("svg[data-leader] path").first()).toBeAttached();
    }
  });

  test("an air question shows the live preview", async ({ page }) => {
    await ask(page, "What has the air been like?");
    await expect(page.locator("[data-card=preview]")).toContainText("Daily Air Quality", { timeout: 30_000 });
  });

  test("a report passage reads as lines, lists and tables, not one run of text", async ({ page }) => {
    await ask(page, "What did the Harambee report say?");
    const passage = page.locator("[data-card=passage]").first();
    await expect(passage).toBeVisible({ timeout: 30_000 });
    expect(await passage.locator("p, li, tr").count()).toBeGreaterThan(1);
    await expect(passage).not.toContainText("| --- |");
  });

  test("a figure in the model's words is marked unverified", async ({ page }) => {
    await ask(page, "unverified please");
    await expect(page.locator("mark[data-unverified]")).toContainText("608", { timeout: 30_000 });
  });

  test("when the model fails, Ask says it's unavailable and search still works", async ({ page }) => {
    await ask(page, "fail please");
    await expect(page.getByText("Ask is unavailable right now. Search still works.")).toBeVisible({ timeout: 30_000 });
  });

  test("closing and reopening Ask on a laptop keeps the conversation", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "laptop only");
    await ask(page, "unverified please");
    await expect(page.locator("mark[data-unverified]")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Close Ask" }).click();
    await expect(page.getByText("UPDATED THIS SEASON")).toBeVisible();
    await page.getByRole("link", { name: "Open Ask" }).click();
    await expect(page.locator("mark[data-unverified]")).toBeVisible();
  });

  test("on a phone, opening the full table keeps the chat (a new tab)", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "phone only");
    await ask(page, "How many kids under 5 are in poverty in Harambee?");
    await expect(page.locator("[data-card=number] a")).toHaveAttribute("target", "_blank", { timeout: 30_000 });
  });

  test("a good answer after a failure clears the unavailable line", async ({ page }) => {
    await ask(page, "fail please");
    await expect(page.getByText("Ask is unavailable right now. Search still works.")).toBeVisible({ timeout: 30_000 });
    await ask(page, "unverified please");
    await expect(page.locator("mark[data-unverified]")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Ask is unavailable right now. Search still works.")).toHaveCount(0);
  });

  test("closing Ask brings the list back on a laptop", async ({ page }, info) => {
    test.skip(info.project.name === "phone", "laptop only");
    await page.getByRole("link", { name: "Close Ask" }).click();
    await expect(page.getByText("UPDATED THIS SEASON")).toBeVisible();
  });

  test("ACCOUNT on every page opens Clerk's account window", async ({ page }) => {
    await page.goto("/start-here");
    await page.getByRole("button", { name: /^account$/i }).filter({ visible: true }).first().click();
    await expect(page.locator(".cl-userProfile-root")).toBeVisible({ timeout: 15_000 });
  });

  test("SIGN OUT on every page signs you out and keeps the page", async ({ page }) => {
    await page.goto("/start-here");
    await page.getByRole("button", { name: /^sign out$/i }).filter({ visible: true }).first().click();
    await expect(page.getByRole("button", { name: /^account$/i })).toHaveCount(0, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/start-here/);
  });

  test("shows today's count and a way to sign out", async ({ page }) => {
    await expect(page.getByText(/of \d+ questions left today/)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("copilot-input-overlay").getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("button", { name: "Sign in to ask" })).toBeVisible();
  });
});

test("a table address with row= outlines that row", async ({ page }) => {
  // row is the row's position in the table (labels repeat across sections in some tables); 2 is "Under 5 years".
  await page.goto("/d/N03?place=harambee&year=2024&topic=poverty-status-by-age&row=2");
  await expect(page.locator("[data-row-marked]")).toContainText("Under 5 years");
});
