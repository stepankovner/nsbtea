import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],
    css: false,
    restoreMocks: true,
    // формы админки вводят много текста через userEvent — под нагрузкой (CI, параллельные
    // прогоны) 5 секунд по умолчанию не всегда хватает
    testTimeout: 15_000,
  },
});
