import { expect, test, type Page } from "@playwright/test";

import { expectNoHorizontalScroll, loginOwner } from "./helpers";

/**
 * Главные сценарии владельца в админке (ROADMAP, M6: «принять поставку, создать товар — с телефона»).
 * Идут на телефоне (375 px) и на ноутбуке (1440 px).
 */

async function stockOf(page: Page, query: string): Promise<number> {
  const response = await page.request.get(`/api/admin/lookup/products?q=${encodeURIComponent(query)}`);
  expect(response.ok()).toBe(true);
  const [product] = (await response.json()) as { stock: number }[];
  expect(product, `товар «${query}»`).toBeTruthy();
  return product!.stock;
}

test("принять поставку: товар → сколько пришло → проверка → остаток вырос", async ({ page }) => {
  await loginOwner(page);
  const before = await stockOf(page, "Лун Цзин");

  await page.goto("/admin/inventory");
  await page.getByRole("link", { name: "Принять поставку" }).first().click();
  await expect(page.getByRole("heading", { name: /Что пришло/ })).toBeVisible();
  await page.getByRole("button", { name: "Добавить товар" }).click();
  await page.getByPlaceholder("Название товара").fill("Лун");
  await page.getByRole("option", { name: /Лун Цзин/ }).click();
  await page.getByRole("button", { name: /Дальше/ }).click();

  await expect(page.getByRole("heading", { name: /Сколько пришло/ })).toBeVisible();
  await page.getByRole("textbox", { name: "Лун Цзин", exact: true }).fill("100");
  await page.getByRole("textbox", { name: "Поставщик или комментарий" }).fill("Сквозной тест");
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: /Дальше/ }).click();

  const summary = page.getByRole("list", { name: "Что изменится" });
  await expect(summary.getByText("+100 г")).toBeVisible();
  await page.getByRole("button", { name: "Провести поставку" }).click();

  await expect(page).toHaveURL(/\/admin\/inventory\?tab=history/);
  await expect.poll(() => stockOf(page, "Лун Цзин")).toBe(before + 100);
});

test("создать товар по шагам и показать на сайте", async ({ page }) => {
  const name = `Пробный улун ${Date.now().toString().slice(-6)}`;
  await loginOwner(page);

  await page.goto("/admin/products/new");
  await expect(page.getByRole("radio", { name: /Чай на развес/ })).toBeChecked();
  await page.getByRole("combobox", { name: "Категория" }).selectOption({ index: 1 });
  await page.getByRole("textbox", { name: /^Название/ }).fill(name);
  await page.getByRole("button", { name: "Далее" }).click();

  // черновик создан: адрес с номером товара переживает перезагрузку
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+\/edit\?step=2/);
  await page.reload();
  await expect(page.getByText("Шаг 2 из 7")).toBeVisible();
  await page.getByRole("textbox", { name: "Коротко о товаре" }).fill("Мягкий, с нотой мёда");
  await page.getByRole("button", { name: "Далее" }).click();

  await expect(page.getByText("Шаг 3 из 7")).toBeVisible(); // фото — можно позже
  await page.getByRole("button", { name: "Далее" }).click();

  await expect(page.getByRole("heading", { name: "Цена и граммовки" })).toBeVisible();
  await page.getByRole("textbox", { name: "Цена за 50 г", exact: true }).fill("600");
  await page.getByRole("textbox", { name: "Цена за 50 г", exact: true }).blur();
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Далее" }).click();

  for (const step of [5, 6]) {
    await expect(page.getByText(`Шаг ${step} из 7`)).toBeVisible();
    await page.getByRole("button", { name: "Далее" }).click();
  }

  await expect(page.getByText("Шаг 7 из 7")).toBeVisible();
  await page.getByRole("button", { name: "Показать на сайте" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+$/);

  // покупатель видит товар
  const href = await page.getByRole("link", { name: /Открыть на сайте/ }).first().getAttribute("href");
  expect(href).toMatch(/\/product\//);
  await page.goto(href!);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
});
