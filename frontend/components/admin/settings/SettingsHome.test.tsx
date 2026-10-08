import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { settingsApi } from "@/lib/admin/settings";
import { renderWithAdmin } from "@/tests/admin";

import { settingsMeta } from "./fixtures";
import { SettingsHome } from "./SettingsHome";

vi.mock("@/lib/admin/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/settings")>();
  return { ...actual, settingsApi: { all: vi.fn(), meta: vi.fn(), save: vi.fn() } };
});

describe("Настройки — список разделов", () => {
  it("каждый раздел — ссылка с понятным названием и описанием, что в нём настраивается", async () => {
    vi.mocked(settingsApi.meta).mockResolvedValue(settingsMeta());
    renderWithAdmin(<SettingsHome />);
    expect(await screen.findByRole("heading", { name: "Настройки" })).toBeInTheDocument();

    const store = await screen.findByRole("link", { name: /Магазин, реквизиты и контакты/ });
    expect(store).toHaveAttribute("href", "/admin/settings/store");
    expect(store).toHaveTextContent(/реквизиты ИП/);

    expect(screen.getByRole("link", { name: /Баллы и приветственная скидка/ })).toHaveAttribute("href", "/admin/settings/loyalty");
    expect(screen.getByRole("link", { name: /Чай недели \(акция четверга\)/ })).toHaveAttribute("href", "/admin/settings/thursday");
    expect(screen.getByRole("link", { name: /Доставка/ })).toHaveAttribute("href", "/admin/settings/delivery");
    expect(screen.getByRole("link", { name: /Оплата и чеки/ })).toHaveTextContent(/НДС/);
    expect(screen.getByRole("link", { name: /Каталог и остатки/ })).toHaveAttribute("href", "/admin/settings/catalog");
    expect(screen.getByRole("link", { name: /Поисковики и аналитика/ })).toHaveTextContent(/Метрик/);
  });

  it("рядом — сотрудники и получатели уведомлений в Telegram", async () => {
    vi.mocked(settingsApi.meta).mockResolvedValue(settingsMeta());
    renderWithAdmin(<SettingsHome />);
    expect(await screen.findByRole("link", { name: /Сотрудники/ })).toHaveAttribute("href", "/admin/staff");
    expect(screen.getByRole("link", { name: /Уведомления в Telegram/ })).toHaveAttribute("href", "/admin/notifications");
  });

  it("сотруднику раздел недоступен — объясняем, а не показываем пустой экран", async () => {
    renderWithAdmin(<SettingsHome />, { owner: false, permissions: ["orders", "inventory"] });
    expect(await screen.findByText("Этот раздел доступен только владельцу")).toBeInTheDocument();
    expect(settingsApi.meta).not.toHaveBeenCalled();
  });
});
