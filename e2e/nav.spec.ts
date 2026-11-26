// Main navigation at 360px against the real app: from the home page tap each menu, check the URL, the page heading,
// the touch target size and that nothing scrolls sideways. The lesson player has no nav.
import { expect, test, type Page } from "@playwright/test";

const SLOW = { timeout: 30_000 }; // the dev server compiles pages on first use

const MENUS = [
  { label: "วันนี้", url: "/", heading: "English Zero to Hero" },
  { label: "ฝึกเพิ่ม", url: "/practice", heading: "ฝึกเพิ่ม" },
  { label: "พัฒนาการ", url: "/progress", heading: "พัฒนาการ" },
  { label: "ตั้งค่า", url: "/settings", heading: "ตั้งค่า" },
];

async function expectNoHorizontalScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontal scroll at ${where}`).toBeLessThanOrEqual(0);
}

test("tapping each menu in the nav bar opens its page; the current menu is marked", async ({ page }) => {
  expect(page.viewportSize()?.width).toBe(360);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "เมนูหลัก" });
  await expect(nav).toBeVisible(SLOW);

  for (const menu of [...MENUS.slice(1), MENUS[0]]) {
    await nav.getByRole("link", { name: menu.label }).tap();
    await expect(page).toHaveURL(new RegExp(`${menu.url === "/" ? "/$" : `${menu.url}$`}`), SLOW);
    await expect(page.getByRole("heading", { level: 1, name: menu.heading })).toBeVisible(SLOW);
    await expect(nav.locator("a[aria-current=page]")).toHaveCount(1);
    await expect(nav.getByRole("link", { name: menu.label })).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalScroll(page, menu.url);

    for (const link of await nav.getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box?.width, `${menu.url}: touch width`).toBeGreaterThanOrEqual(44);
      expect(box?.height, `${menu.url}: touch height`).toBeGreaterThanOrEqual(44);
    }
  }
});

test("the lesson player has no main nav", async ({ page }) => {
  await page.goto("/day/1");
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible(SLOW);
  await expect(page.getByRole("navigation", { name: "เมนูหลัก" })).toHaveCount(0);
});
