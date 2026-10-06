import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ordersApi } from "@/lib/admin/orders";
import { renderWithAdmin } from "@/tests/admin";

import { adminOrder } from "./fixtures";
import { OrderDetail } from "./OrderDetail";

vi.mock("@/lib/admin/orders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/orders")>();
  return {
    ...actual,
    ordersApi: { get: vi.fn(), setStatus: vi.fn(), patch: vi.fn(), cancel: vi.fn(), refund: vi.fn() },
  };
});

describe("OrderDetail — карточка заказа", () => {
  it("состав, клиент, доставка и деньги", async () => {
    vi.mocked(ordersApi.get).mockResolvedValue(adminOrder());
    renderWithAdmin(<OrderDetail id="o1" />);
    expect(await screen.findByRole("heading", { name: /NSB-10001/ })).toBeInTheDocument();
    expect(screen.getByText("Оплачен (новый)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+7 900 123-45-67" })).toHaveAttribute("href", "tel:+79001234567");
    expect(screen.getByText("Да Хун Пао")).toBeInTheDocument();
    expect(screen.getByText("Москва, ПВЗ MSK1: Тверская, 1")).toBeInTheDocument();
    expect(screen.getByText("Позвоните заранее")).toBeInTheDocument();
    expect(screen.getByTestId("order-total")).toHaveTextContent("3 150 ₽");
    expect(screen.getByRole("link", { name: /Аня/ })).toHaveAttribute("href", "/admin/customers/c1");
  });

  it("следующий шаг — одной крупной кнопкой", async () => {
    vi.mocked(ordersApi.get).mockResolvedValue(adminOrder());
    vi.mocked(ordersApi.setStatus).mockResolvedValue(
      adminOrder({ status: "assembling", status_label: "Собирается", next_steps: [] }),
    );
    renderWithAdmin(<OrderDetail id="o1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Начать сборку" }));
    expect(ordersApi.setStatus).toHaveBeenCalledWith("o1", { to: "assembling" });
    expect(await screen.findByText("Собирается")).toBeInTheDocument();
  });

  it("передача в СДЭК — сначала трек-номер", async () => {
    vi.mocked(ordersApi.get).mockResolvedValue(
      adminOrder({
        status: "assembling",
        status_label: "Собирается",
        next_steps: [{ to: "shipped", label: "Собран → Передать в доставку", needs_tracking: true }],
      }),
    );
    vi.mocked(ordersApi.setStatus).mockResolvedValue(adminOrder({ status: "shipped", status_label: "Передан в доставку", next_steps: [] }));
    renderWithAdmin(<OrderDetail id="o1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Собран → Передать в доставку" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Передать в доставку" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Трек-номер СДЭК"), "1234567890");
    await userEvent.click(confirm);
    expect(ordersApi.setStatus).toHaveBeenCalledWith("o1", { to: "shipped", tracking_number: "1234567890" });
  });

  it("отмена — с подтверждением и возвратом товара на склад", async () => {
    vi.mocked(ordersApi.get).mockResolvedValue(adminOrder());
    vi.mocked(ordersApi.cancel).mockResolvedValue(adminOrder({ status: "cancelled", status_label: "Отменён", next_steps: [], can_cancel: false }));
    renderWithAdmin(<OrderDetail id="o1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Отменить заказ" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/деньги не вернутся автоматически/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "Вернуть товары на склад" })).toBeChecked();
    await userEvent.type(within(dialog).getByLabelText("Причина (увидите только вы)"), "Клиент передумал");
    await userEvent.click(within(dialog).getByRole("button", { name: "Да, отменить" }));
    expect(ordersApi.cancel).toHaveBeenCalledWith("o1", { restock: true, reason: "Клиент передумал" });
  });

  it("возврат денег — только владельцу", async () => {
    vi.mocked(ordersApi.get).mockResolvedValue(adminOrder());
    const { unmount } = renderWithAdmin(<OrderDetail id="o1" />, { owner: false, permissions: ["orders"] });
    expect(await screen.findByRole("heading", { name: /NSB-10001/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Вернуть деньги" })).not.toBeInTheDocument();
    unmount();

    vi.mocked(ordersApi.refund).mockResolvedValue(adminOrder({ status: "refunded", status_label: "Возврат", can_refund: false }));
    renderWithAdmin(<OrderDetail id="o1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Вернуть деньги" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Вернуть 3 150 ₽" }));
    expect(ordersApi.refund).toHaveBeenCalledWith("o1", { restock: true, reason: null });
  });

  it("частичный возврат — суммой", async () => {
    vi.mocked(ordersApi.get).mockResolvedValue(adminOrder());
    vi.mocked(ordersApi.refund).mockResolvedValue(adminOrder({ refunded_kop: 50_000 }));
    renderWithAdmin(<OrderDetail id="o1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Вернуть деньги" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Часть суммы" }));
    await userEvent.type(within(dialog).getByLabelText("Сумма возврата"), "500");
    await userEvent.tab();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Вернуть товары на склад" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Вернуть 500 ₽" }));
    expect(ordersApi.refund).toHaveBeenCalledWith("o1", { amount_kop: 50_000, restock: false, reason: null });
  });

  it("внутренний комментарий сохраняется", async () => {
    vi.mocked(ordersApi.get).mockResolvedValue(adminOrder());
    vi.mocked(ordersApi.patch).mockResolvedValue(adminOrder({ internal_comment: "Положить пробник" }));
    renderWithAdmin(<OrderDetail id="o1" />);
    await userEvent.type(await screen.findByLabelText("Заметка для себя"), "Положить пробник");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить заметку" }));
    expect(ordersApi.patch).toHaveBeenCalledWith("o1", { internal_comment: "Положить пробник" });
  });

  it("печать упаковочного листа", async () => {
    vi.mocked(ordersApi.get).mockResolvedValue(adminOrder());
    render(<></>);
    renderWithAdmin(<OrderDetail id="o1" />);
    expect(await screen.findByRole("link", { name: /Упаковочный лист/ })).toHaveAttribute("href", "/admin/orders/o1/print");
  });
});
