import { expect, test } from "@playwright/test";

import { expectNoHorizontalScroll, loginOwner } from "./helpers";

/** Ни один основной экран не уезжает вбок на телефоне (375 px) и на ноутбуке (1440 px). */
const SHOP_PAGES = ["/", "/catalog", "/product/da-hun-pao", "/cart", "/events", "/account/login"];
const ADMIN_PAGES = ["/admin", "/admin/orders", "/admin/more", "/admin/profile"];

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

test("админка: основные экраны без горизонтальной прокрутки", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await loginOwner(page);
  for (const path of ADMIN_PAGES) {
    await page.goto(path);
    // в админке данные обновляются в фоне, «сеть затихла» не наступает — ждём заголовок экрана
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
  expect(errors, "ошибки JavaScript").toEqual([]);
});
