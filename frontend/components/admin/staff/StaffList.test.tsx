import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { staffApi } from "@/lib/admin/staff";
import { renderWithAdmin } from "@/tests/admin";

import { staff, staffList } from "./fixtures";
import { StaffPage } from "./StaffList";

vi.mock("@/lib/admin/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/staff")>();
  return {
    ...actual,
    staffApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), revoke: vi.fn(), renewInvite: vi.fn() },
  };
});

const INVITE_URL = "https://nsbtea.ru/admin/invite/tok3n-tok3n-tok3n";

const anya = staff();
const boris = staff({ id: "s2", name: "Борис", email: "boris@example.com", invite_pending: true, last_login_at: null });
const vera = staff({ id: "s3", name: "Вера", email: "vera@example.com", permissions: ["content", "promotions"], expires_at: "2020-01-01T20:59:59Z" });
const gleb = staff({ id: "s4", name: "Глеб", email: "gleb@example.com", revoked_at: "2026-10-01T09:00:00Z" });

function card(name: string) {
  return screen.findByRole("article", { name });
}

afterEach(() => {
  delete (navigator as { share?: unknown }).share;
});

describe("Сотрудники — временный доступ", () => {
  it("список: кто, какие разделы (как в меню), до какого числа и статус; владельца в списке нет", async () => {
    vi.mocked(staffApi.list).mockResolvedValue(staffList([anya, boris, vera, gleb]));
    renderWithAdmin(<StaffPage />);

    const a = await card("Аня");
    expect(within(a).getByText("anya@example.com")).toBeInTheDocument();
    expect(within(a).getByText("Заказы, Склад")).toBeInTheDocument();
    expect(within(a).getByText(/до 31 декабря 2099/)).toBeInTheDocument();
    expect(within(a).getByText("Активен")).toBeInTheDocument();

    expect(within(await card("Борис")).getByText("Приглашён")).toBeInTheDocument();
    const v = await card("Вера");
    expect(within(v).getByText("Доступ истёк")).toBeInTheDocument();
    expect(within(v).getByText("Акции, Сайт: страницы и события")).toBeInTheDocument();
    expect(within(await card("Глеб")).getByText("Доступ отозван")).toBeInTheDocument();

    expect(screen.queryByRole("article", { name: "Никита" })).not.toBeInTheDocument();
  });

  it("приглашение: по умолчанию «Заказы» и «Склад»; объясняем, чего сотруднику дать нельзя; потом — ссылка крупно", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
    vi.mocked(staffApi.list).mockResolvedValue(staffList([]));
    vi.mocked(staffApi.create).mockResolvedValue({ staff: boris, invite_url: INVITE_URL });
    renderWithAdmin(<StaffPage />);

    await user.click(await screen.findByRole("button", { name: "Пригласить сотрудника" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: "Заказы" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Склад" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Товары" })).not.toBeChecked();
    expect(within(dialog).getByText(/сотруднику их дать нельзя/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox", { name: /Настройки/ })).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Имя"), "Борис");
    await user.type(within(dialog).getByLabelText("Почта"), "boris@example.com");
    await user.click(within(dialog).getByRole("checkbox", { name: "Товары" }));
    fireEvent.change(within(dialog).getByLabelText("Доступ до"), { target: { value: "2099-12-31" } });
    await user.click(within(dialog).getByRole("button", { name: "Создать приглашение" }));

    expect(staffApi.create).toHaveBeenCalledWith({
      name: "Борис",
      email: "boris@example.com",
      permissions: ["orders", "products", "inventory"],
      expires_at: "2099-12-31T20:59:59.000Z",
    });

    const done = await screen.findByRole("dialog");
    expect(within(done).getByDisplayValue(INVITE_URL)).toBeInTheDocument();
    await user.click(within(done).getByRole("button", { name: "Скопировать" }));
    await expect(navigator.clipboard.readText()).resolves.toBe(INVITE_URL);
    await user.click(within(done).getByRole("button", { name: "Отправить" }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: INVITE_URL }));
  });

  it("без «Поделиться» в браузере кнопки «Отправить» нет — только «Скопировать»", async () => {
    vi.mocked(staffApi.list).mockResolvedValue(staffList([]));
    vi.mocked(staffApi.create).mockResolvedValue({ staff: boris, invite_url: INVITE_URL });
    renderWithAdmin(<StaffPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Пригласить сотрудника" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Имя"), "Борис");
    await userEvent.type(within(dialog).getByLabelText("Почта"), "boris@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Создать приглашение" }));
    const done = await screen.findByRole("dialog");
    expect(await within(done).findByRole("button", { name: "Скопировать" })).toBeInTheDocument();
    expect(within(done).queryByRole("button", { name: "Отправить" })).not.toBeInTheDocument();
  });

  it("почта уже занята — ошибка сервера у поля «Почта»", async () => {
    vi.mocked(staffApi.list).mockResolvedValue(staffList([]));
    vi.mocked(staffApi.create).mockRejectedValue(new ApiError(409, "Сотрудник с такой почтой уже есть", "conflict", { field: "email" }));
    renderWithAdmin(<StaffPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Пригласить сотрудника" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Имя"), "Аня");
    const email = within(dialog).getByLabelText("Почта");
    await userEvent.type(email, "anya@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Создать приглашение" }));
    expect(await within(dialog).findByText("Сотрудник с такой почтой уже есть")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
  });

  it("изменить разделы и срок доступа", async () => {
    vi.mocked(staffApi.list).mockResolvedValue(staffList([anya]));
    vi.mocked(staffApi.update).mockResolvedValue(staff({ permissions: ["inventory", "orders", "products"] }));
    renderWithAdmin(<StaffPage />);
    await userEvent.click(within(await card("Аня")).getByRole("button", { name: "Изменить доступ" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: "Заказы" })).toBeChecked();
    expect(within(dialog).getByLabelText("Доступ до")).toHaveValue("2099-12-31");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Товары" }));
    fireEvent.change(within(dialog).getByLabelText("Доступ до"), { target: { value: "2099-06-30" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    expect(staffApi.update).toHaveBeenCalledWith("s1", {
      permissions: ["orders", "products", "inventory"],
      expires_at: "2099-06-30T20:59:59.000Z",
    });
  });

  it("отозвать доступ — с подтверждением: сотрудник сразу выйдет со всех устройств", async () => {
    vi.mocked(staffApi.list).mockResolvedValue(staffList([anya]));
    vi.mocked(staffApi.revoke).mockResolvedValue(staff({ revoked_at: "2026-10-08T09:00:00Z" }));
    renderWithAdmin(<StaffPage />);
    await userEvent.click(within(await card("Аня")).getByRole("button", { name: "Отозвать доступ" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Сотрудник сразу выйдет со всех устройств/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Да, отозвать" }));
    expect(staffApi.revoke).toHaveBeenCalledWith("s1");
  });

  it("не принял приглашение — можно выдать новую ссылку", async () => {
    vi.mocked(staffApi.list).mockResolvedValue(staffList([boris]));
    vi.mocked(staffApi.renewInvite).mockResolvedValue({ staff: boris, invite_url: INVITE_URL });
    renderWithAdmin(<StaffPage />);
    const b = await card("Борис");
    await userEvent.click(within(b).getByRole("button", { name: "Новая ссылка-приглашение" }));
    expect(staffApi.renewInvite).toHaveBeenCalledWith("s2");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByDisplayValue(INVITE_URL)).toBeInTheDocument();
    expect(within(dialog).getByText(/Старая ссылка больше не работает/)).toBeInTheDocument();
  });

  it("принявшему приглашение новая ссылка не нужна", async () => {
    vi.mocked(staffApi.list).mockResolvedValue(staffList([anya]));
    renderWithAdmin(<StaffPage />);
    expect(within(await card("Аня")).queryByRole("button", { name: "Новая ссылка-приглашение" })).not.toBeInTheDocument();
  });

  it("отозванный доступ можно вернуть, указав новый срок", async () => {
    vi.mocked(staffApi.list).mockResolvedValue(staffList([gleb]));
    vi.mocked(staffApi.update).mockResolvedValue(staff({ id: "s4", name: "Глеб" }));
    renderWithAdmin(<StaffPage />);
    const g = await card("Глеб");
    expect(within(g).queryByRole("button", { name: "Отозвать доступ" })).not.toBeInTheDocument();
    await userEvent.click(within(g).getByRole("button", { name: "Вернуть доступ" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Доступ до"), { target: { value: "2099-01-31" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Вернуть доступ" }));
    expect(staffApi.update).toHaveBeenCalledWith("s4", {
      permissions: ["orders", "inventory"],
      expires_at: "2099-01-31T20:59:59.000Z",
      restore: true,
    });
  });

  it("действия сотрудника — ссылкой на журнал", async () => {
    vi.mocked(staffApi.list).mockResolvedValue(staffList([anya]));
    renderWithAdmin(<StaffPage />);
    expect(within(await card("Аня")).getByRole("link", { name: /в журнале/ })).toHaveAttribute("href", "/admin/audit?actor=s1");
  });

  it("сотрудников нет — объясняем, зачем это и что будет", async () => {
    vi.mocked(staffApi.list).mockResolvedValue(staffList([]));
    renderWithAdmin(<StaffPage />);
    expect(await screen.findByText("Пока нет сотрудников")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Пригласить сотрудника" })).toBeInTheDocument();
  });

  it("сотруднику раздел недоступен", async () => {
    renderWithAdmin(<StaffPage />, { owner: false, permissions: ["orders"] });
    expect(await screen.findByText("Этот раздел доступен только владельцу")).toBeInTheDocument();
    expect(staffApi.list).not.toHaveBeenCalled();
  });
});
