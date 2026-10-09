import { expect, test as setup } from "@playwright/test";

import { OWNER_EMAIL, OWNER_PASSWORD, OWNER_STATE } from "./helpers";

/** Вход владельца один раз на весь прогон: частые входы упираются в защиту от подбора пароля. */
setup("вход владельца", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Почта").fill(OWNER_EMAIL);
  await page.getByRole("textbox", { name: "Пароль" }).fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/admin") && !url.pathname.startsWith("/admin/login"));
  await expect(page.getByRole("main")).toBeVisible();
  await page.context().storageState({ path: OWNER_STATE });
});
