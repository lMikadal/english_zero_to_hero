import { expect, test } from "@playwright/test";

test("home page loads at 360px with the app name and no horizontal scroll", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "English Zero to Hero" })).toBeVisible();

  expect(page.viewportSize()?.width).toBe(360);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("theme choice on /settings persists across a reload", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "มืด" }).check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radio", { name: "มืด" })).toBeChecked();
});
