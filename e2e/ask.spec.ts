import { expect, test } from "@playwright/test";

test("signed out, Ask offers sign-in and search stays public", async ({ page }, info) => {
  await page.goto(info.project.name === "phone" ? "/ask" : "/?ask=1");
  await expect(page.getByRole("button", { name: "Sign in to ask" })).toBeVisible();
  await page.goto("/d/N03");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
    // Sign in on the page under test, then reload: Clerk navigates on its own after signing in.
    await page.goto(info.project.name === "phone" ? "/ask" : "/?ask=1");
    await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
    await page.reload();
  });

  test("shows today's count and a way to sign out", async ({ page }) => {
    await expect(page.getByText(/of \d+ questions left today/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("button", { name: "Sign in to ask" })).toBeVisible();
  });
});
