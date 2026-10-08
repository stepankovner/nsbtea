import { expect, test } from "@playwright/test";

import { expectNoHorizontalScroll, loginOwner } from "./helpers";

/**
 * Главный сценарий магазина: покупатель выбирает чай и граммовку, оформляет самовывоз, платит —
 * владелец видит оплаченный заказ в админке и начинает сборку.
 */
test("покупка чая: каталог → карточка → корзина → оплата → заказ в админке", async ({ page }) => {
  const stamp = Date.now().toString().slice(-6);

  await page.goto("/catalog");
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: /Да Хун Пао/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: /Да Хун Пао/ })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole("radiogroup", { name: "Вес" }).getByRole("radio", { name: /^50\s+г/ }).click();
  await page.getByRole("button", { name: "В корзину", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "в корзине" })).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByRole("link", { name: "Да Хун Пао" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByLabel("Имя").fill(`Покупатель ${stamp}`);
  await page.getByLabel("Телефон").fill(`8 900 ${stamp.slice(0, 3)}-${stamp.slice(3, 5)}-${stamp.slice(4, 6)}`);
  await page.getByLabel("Почта").fill(`buyer-${stamp}@example.ru`);
  await page.getByRole("radiogroup", { name: "Получение" }).getByRole("radio", { name: /Самовывоз/ }).click();
  await page.getByRole("checkbox", { name: /условия оферты/ }).check();
  await page.getByRole("checkbox", { name: /обработку персональных данных/ }).check();
  await page.getByRole("button", { name: /Оплатить/ }).click();

  // страница-заглушка оплаты (TOCHKA_MODE=fake) → возврат на сайт
  await page.getByTestId("fake-pay").click();
  await expect(page.getByRole("heading", { name: "Спасибо, заказ оплачен" })).toBeVisible({ timeout: 30_000 });
  const orderNumber = (await page.getByText(/NSB-\d+/).first().textContent())?.match(/NSB-\d+/)?.[0];
  expect(orderNumber, "номер заказа на странице результата").toBeTruthy();

  await loginOwner(page);
  await page.goto("/admin/orders?status=paid");
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: new RegExp(orderNumber!) }).first().click();
  await expect(page.getByRole("heading", { name: new RegExp(orderNumber!) })).toBeVisible();
  await expect(page.getByText("Да Хун Пао").first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole("button", { name: "Начать сборку" }).click();
  await expect(page.getByRole("button", { name: "Собран → Готов к выдаче" })).toBeVisible();
});
