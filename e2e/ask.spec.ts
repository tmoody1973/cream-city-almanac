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
