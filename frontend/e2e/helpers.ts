import { expect, type Page } from "@playwright/test";

export const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "owner@nsbtea.ru";
export const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? "owner-password-123";

/**
 * Страница не шире экрана: на телефоне ничего не должно уезжать вбок.
 * Сравниваем с заданной шириной экрана, а не с window.innerWidth: в режиме телефона браузер
 * расширяет «окно» под слишком широкое содержимое, и innerWidth растёт вместе с ним.
 */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const screenWidth = page.viewportSize()?.width ?? 0;
  const contentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(contentWidth, "ширина страницы (горизонтальная прокрутка)").toBeLessThanOrEqual(screenWidth);
}

export const OWNER_STATE = "e2e/.auth/owner.json";

/** Сессия владельца уже есть (вход один раз — auth.setup.ts): открываем админку без входа. */
export async function loginOwner(page: Page): Promise<void> {
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("main")).toBeVisible();
}
