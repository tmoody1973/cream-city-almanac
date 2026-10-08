import { expect, test } from "./fixtures";

test("a guide page opens as a guide, not a dataset", async ({ page }, info) => {
  await page.goto("/d/X02");
  if (info.project.name === "desktop") await expect(page).toHaveURL(/open=X02/);
  await expect(page.getByText("A guide page on DYCU's Hub, not a dataset.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open it on the Hub/ })).toHaveAttribute("href", /getdata-dycu\.hub\.arcgis\.com\/pages\//);
  await expect(page.getByRole("heading", { name: "WHAT IT MEASURES" })).toHaveCount(0);
});
