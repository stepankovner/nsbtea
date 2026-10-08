import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/lib/api/client";
import { notificationsApi } from "@/lib/admin/notifications";
import { renderWithAdmin } from "@/tests/admin";

import { NotificationsPage } from "./NotificationRecipients";

vi.mock("@/lib/admin/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/notifications")>();
  return { ...actual, notificationsApi: { list: vi.fn(), update: vi.fn(), remove: vi.fn(), link: vi.fn() } };
});

const EVENTS: Schemas["EventOption"][] = [
  { value: "new_order", label: "Новый оплаченный заказ" },
  { value: "low_stock", label: "Остаток ниже порога" },
  { value: "out_of_stock", label: "Товар закончился" },
  { value: "new_application", label: "Новая заявка" },
  { value: "order_attention", label: "Заказ требует внимания" },
  { value: "thursday_reminder", label: "Не запланирован четверг" },
  { value: "weekly_summary", label: "Сводка за неделю" },
];

function recipient(overrides: Partial<Schemas["RecipientOut"]> = {}): Schemas["RecipientOut"] {
  return { id: "r1", chat_id: 111, name: "Никита", events: EVENTS.map((e) => e.value), is_active: true, ...overrides };
}

const anya = recipient({ id: "r2", chat_id: 222, name: "Аня", events: ["new_order"] });

function data(recipients = [recipient(), anya]): Schemas["NotificationsOut"] {
  return { recipients, events: EVENTS, bot_username: "nsbtea_bot" };
}

describe("Уведомления в Telegram — получатели", () => {
  it("у каждого получателя — какие уведомления он получает, понятными словами", async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue(data());
    renderWithAdmin(<NotificationsPage />);

    const owner = await screen.findByRole("article", { name: "Никита" });
    expect(within(owner).getByRole("checkbox", { name: "Новый оплаченный заказ" })).toBeChecked();
    expect(within(owner).getByRole("checkbox", { name: "Сводка за неделю" })).toBeChecked();

    const a = screen.getByRole("article", { name: "Аня" });
    expect(within(a).getByRole("checkbox", { name: "Новый оплаченный заказ" })).toBeChecked();
    expect(within(a).getByRole("checkbox", { name: "Товар закончился" })).not.toBeChecked();
    // когда приходит сводка — объяснено рядом с галочкой
    expect(within(a).getAllByText(/понедельник/).length).toBeGreaterThan(0);
  });

  it("галочка сохраняется сразу", async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue(data());
    vi.mocked(notificationsApi.update).mockResolvedValue({ ...anya, events: ["new_order", "out_of_stock"] });
    renderWithAdmin(<NotificationsPage />);
    const a = await screen.findByRole("article", { name: "Аня" });
    await userEvent.click(within(a).getByRole("checkbox", { name: "Товар закончился" }));
    expect(notificationsApi.update).toHaveBeenCalledWith("r2", { events: ["new_order", "out_of_stock"] });
    expect(await within(a).findByRole("checkbox", { name: "Товар закончился" })).toBeChecked();
  });

  it("можно поставить на паузу, не удаляя", async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue(data());
    vi.mocked(notificationsApi.update).mockResolvedValue({ ...anya, is_active: false });
    renderWithAdmin(<NotificationsPage />);
    const a = await screen.findByRole("article", { name: "Аня" });
    const toggle = within(a).getByRole("switch", { name: "Присылать уведомления" });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(notificationsApi.update).toHaveBeenCalledWith("r2", { is_active: false });
    expect(await within(a).findByText("На паузе")).toBeInTheDocument();
  });

  it("переименовать получателя", async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue(data());
    vi.mocked(notificationsApi.update).mockResolvedValue({ ...anya, name: "Аня (помощник)" });
    renderWithAdmin(<NotificationsPage />);
    const a = await screen.findByRole("article", { name: "Аня" });
    await userEvent.click(within(a).getByRole("button", { name: "Переименовать" }));
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Название");
    await userEvent.clear(input);
    await userEvent.type(input, "Аня (помощник)");
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    expect(notificationsApi.update).toHaveBeenCalledWith("r2", { name: "Аня (помощник)" });
  });

  it("добавить получателя: код и ссылка на бота, по шагам — что сделать в Telegram", async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue(data());
    vi.mocked(notificationsApi.link).mockResolvedValue({
      code: "AB12CD",
      deep_link: "https://t.me/nsbtea_bot?start=AB12CD",
      expires_at: "2026-10-08T09:30:00Z",
    });
    renderWithAdmin(<NotificationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Добавить получателя" }));
    expect(notificationsApi.link).toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("link", { name: /Открыть Telegram/ })).toHaveAttribute("href", "https://t.me/nsbtea_bot?start=AB12CD");
    expect(within(dialog).getAllByText(/AB12CD/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/@nsbtea_bot/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/«Запустить»/)).toBeInTheDocument();
    expect(within(dialog).getByText(/до 12:30/)).toBeInTheDocument();
  });

  it("после привязки в Telegram новый получатель появляется — «Проверить»", async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue(data());
    vi.mocked(notificationsApi.link).mockResolvedValue({
      code: "AB12CD",
      deep_link: "https://t.me/nsbtea_bot?start=AB12CD",
      expires_at: "2026-10-08T09:30:00Z",
    });
    renderWithAdmin(<NotificationsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Добавить получателя" }));
    const dialog = await screen.findByRole("dialog");
    vi.mocked(notificationsApi.list).mockResolvedValue(data([recipient(), anya, recipient({ id: "r3", chat_id: 333, name: "Мама" })]));
    await userEvent.click(await within(dialog).findByRole("button", { name: "Проверить" }));
    expect(await within(dialog).findByText(/«Мама» добавлен/)).toBeInTheDocument();
  });

  it("удалить — только после подтверждения", async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue(data());
    vi.mocked(notificationsApi.remove).mockResolvedValue({ ok: true });
    renderWithAdmin(<NotificationsPage />);
    const a = await screen.findByRole("article", { name: "Аня" });
    await userEvent.click(within(a).getByRole("button", { name: "Удалить" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/перестанет получать уведомления/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Да, удалить" }));
    expect(notificationsApi.remove).toHaveBeenCalledWith("r2");
  });

  it("никого нет — объясняем, как подключить себя и других", async () => {
    vi.mocked(notificationsApi.list).mockResolvedValue(data([]));
    renderWithAdmin(<NotificationsPage />);
    expect(await screen.findByText("Пока никто не получает уведомления")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Мой профиль/ })).toHaveAttribute("href", "/admin/profile");
  });

  it("сотруднику раздел недоступен", async () => {
    renderWithAdmin(<NotificationsPage />, { owner: false, permissions: ["orders"] });
    expect(await screen.findByText("Этот раздел доступен только владельцу")).toBeInTheDocument();
    expect(notificationsApi.list).not.toHaveBeenCalled();
  });
});
