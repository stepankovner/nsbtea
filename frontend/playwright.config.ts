import { defineConfig, devices } from "@playwright/test";

import { OWNER_STATE } from "./e2e/helpers";

/**
 * Сквозные тесты против запущенного сайта (Docker Compose или pnpm dev + backend).
 * Нужны: TOCHKA_MODE=fake (страница «оплаты»), `seed` + `demo-data`, владелец без Telegram.
 *   E2E_BASE_URL=https://localhost E2E_OWNER_EMAIL=… E2E_OWNER_PASSWORD=… pnpm e2e
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    ignoreHTTPSErrors: true,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "phone",
      dependencies: ["setup"],
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", viewport: { width: 375, height: 812 }, storageState: OWNER_STATE },
    },
    {
      name: "laptop",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: OWNER_STATE },
    },
  ],
});
