import { expect, type Page } from "@playwright/test";

export const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "owner@nsbtea.ru";
export const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? "owner-password-123";

/** Страница не шире экрана: на телефоне ничего не должно уезжать вбок. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "горизонтальная прокрутка страницы").toBeLessThanOrEqual(0);
}

export const OWNER_STATE = "e2e/.auth/owner.json";

/** Сессия владельца уже есть (вход один раз — auth.setup.ts): открываем админку без входа. */
export async function loginOwner(page: Page): Promise<void> {
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("main")).toBeVisible();
}
