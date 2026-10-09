import { expect, test } from "@playwright/test";

import { expectNoHorizontalScroll, loginOwner } from "./helpers";

/** Ни один основной экран не уезжает вбок на телефоне (375 px) и на ноутбуке (1440 px). */
const SHOP_PAGES = ["/", "/catalog", "/product/da-hun-pao", "/cart", "/events", "/account/login"];
const ADMIN_PAGES = [
  "/admin",
  "/admin/orders",
  "/admin/products",
  "/admin/products/new",
  "/admin/products/categories",
  "/admin/inventory",
  "/admin/inventory?tab=reorder",
  "/admin/inventory/supply",
  "/admin/inventory/count",
  "/admin/inventory/writeoff",
  "/admin/promotions",
  "/admin/promotions/new",
  "/admin/promotions/codes/new",
  "/admin/promotions/thursdays",
  "/admin/customers",
  "/admin/applications",
  "/admin/content",
  "/admin/content/pages",
  "/admin/content/home",
  "/admin/content/events",
  "/admin/content/events/new",
  "/admin/settings",
  "/admin/settings/store",
  "/admin/settings/delivery",
  "/admin/staff",
  "/admin/notifications",
  "/admin/audit",
  "/admin/more",
  "/admin/profile",
];

for (const path of SHOP_PAGES) {
  test(`витрина ${path}: открывается без ошибок и без горизонтальной прокрутки`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(path);
    expect(response?.status(), "код ответа").toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalScroll(page);
    expect(errors, "ошибки JavaScript").toEqual([]);
  });
}

test("админка: все разделы открываются без ошибок и без горизонтальной прокрутки", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  await loginOwner(page);
  for (const path of ADMIN_PAGES) {
    await page.goto(path);
    // в админке данные обновляются в фоне, «сеть затихла» не наступает — ждём заголовок экрана
    await expect(page.getByRole("main").getByRole("heading", { level: 1 }), path).toBeVisible();
    await expect(page.locator('[aria-busy="true"]'), path).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Попробовать ещё раз" }), path).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  }
  expect(errors, "ошибки JavaScript").toEqual([]);
});
