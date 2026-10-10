import { expect, test } from "./fixtures";

test("a bare / is the landing page; a campaign tag keeps it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A guide to Milwaukee's public data.");
  await page.goto("/?utm_source=linkedin");
  await expect(page).toHaveURL(/\/\?utm_source=linkedin$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A guide to Milwaukee's public data.");
});

test("links from before the move land on the same search view", async ({ page }) => {
  // The redirect itself passes the address through unchanged...
  const hop = await page.request.get("/?q=homicide&open=P14", { maxRedirects: 0 });
  expect(hop.status()).toBe(307);
  expect(hop.headers().location).toBe("/search?q=homicide&open=P14");
  // ...then the search screen tidies the order of the parameters, so the page's own address is checked order-free.
  await page.goto("/?q=homicide&open=P14");
  await expect(page).toHaveURL(/\/search\?(?=.*q=homicide)(?=.*open=P14)/);
  await page.goto("/?ask=1&prompt=" + encodeURIComponent("Rent in Lincoln Park"));
  await expect(page).toHaveURL(/\/search\?ask=1&prompt=Rent/);
});

test("Back to the rundown goes to search, not the landing page", async ({ page }) => {
  await page.goto("/d/ZZ99");
  await page.getByRole("link", { name: /back to the rundown/i }).click();
  await expect(page).toHaveURL(/\/search$/);
});
