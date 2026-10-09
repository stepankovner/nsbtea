import { configure, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { customersApi } from "@/lib/admin/customers";
import { ApiError } from "@/lib/api/errors";
import { renderWithAdmin } from "@/tests/admin";

import { CustomerDetail } from "./CustomerDetail";
import { customerCard } from "./fixtures";

vi.mock("@/lib/admin/customers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/customers")>();
  return { ...actual, customersApi: { get: vi.fn(), updateNotes: vi.fn(), adjustPoints: vi.fn() } };
});

// Формы с поиском товаров под нагрузкой (весь набор тестов идёт параллельно) отвечают дольше
// обычной секунды — даём запас, чтобы тесты не падали случайно.
configure({ asyncUtilTimeout: 3_000 });
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CustomerDetail — карточка клиента", () => {
  it("контакты ссылками, сумма покупок, средний чек, заказы со ссылками", async () => {
    vi.mocked(customersApi.get).mockResolvedValue(customerCard());
    renderWithAdmin(<CustomerDetail id="c1" />);
    expect(await screen.findByRole("heading", { name: "Анна Смирнова", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+7 900 123-45-67" })).toHaveAttribute("href", "tel:+79001234567");
    expect(screen.getByRole("link", { name: "anya@example.ru" })).toHaveAttribute("href", "mailto:anya@example.ru");
    expect(screen.getByRole("link", { name: "@anya_tea" })).toHaveAttribute("href", "https://t.me/anya_tea");

    const stats = screen.getByRole("region", { name: "Покупки" });
    expect(within(stats).getByText(/12\s600\s₽/)).toBeInTheDocument();
    expect(within(stats).getByText(/4\s200\s₽/)).toBeInTheDocument();

    const orders = screen.getByRole("region", { name: "Заказы" });
    const order = within(orders).getByRole("link", { name: /NSB-10001/ });
    expect(order).toHaveAttribute("href", "/admin/orders/o1");
    expect(within(order).getByText("Выполнен")).toBeInTheDocument();
    expect(within(order).getByText(/3\s150\s₽/)).toBeInTheDocument();
  });

  it("баланс баллов и история операций", async () => {
    vi.mocked(customersApi.get).mockResolvedValue(customerCard());
    renderWithAdmin(<CustomerDetail id="c1" />);
    const points = await screen.findByRole("region", { name: "Баллы" });
    expect(within(points).getByTestId("points-balance")).toHaveTextContent("120");
    const history = within(points).getByRole("list", { name: "История баллов" });
    expect(within(history).getByText("Изменено магазином")).toBeInTheDocument();
    expect(within(history).getByText("Подарок на день рождения")).toBeInTheDocument();
    expect(within(history).getByText("+150")).toBeInTheDocument();
    expect(within(history).getByText("−30")).toBeInTheDocument();
  });

  it("начислить баллы: сумма и причина, подтверждение «было → станет»", async () => {
    const user = userEvent.setup();
    vi.mocked(customersApi.get).mockResolvedValue(customerCard());
    vi.mocked(customersApi.adjustPoints).mockResolvedValue(customerCard({ points_balance: 170 }));
    renderWithAdmin(<CustomerDetail id="c1" />);
    const points = await screen.findByRole("region", { name: "Баллы" });
    await user.type(within(points).getByLabelText(/^Сколько баллов/), "50");
    await user.type(within(points).getByLabelText(/^Причина/), "Компенсация за задержку");
    await user.click(within(points).getByRole("button", { name: "Начислить 50 баллов" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/120\s*→\s*170/)).toBeInTheDocument();
    expect(customersApi.adjustPoints).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Да, начислить" }));
    expect(customersApi.adjustPoints).toHaveBeenCalledWith("c1", { delta: 50, comment: "Компенсация за задержку" });
    expect(await within(points).findByTestId("points-balance")).toHaveTextContent("170");
  });

  it("списать баллы — со знаком минус", async () => {
    const user = userEvent.setup();
    vi.mocked(customersApi.get).mockResolvedValue(customerCard());
    vi.mocked(customersApi.adjustPoints).mockResolvedValue(customerCard({ points_balance: 100 }));
    renderWithAdmin(<CustomerDetail id="c1" />);
    const points = await screen.findByRole("region", { name: "Баллы" });
    await user.click(within(points).getByRole("radio", { name: "Списать" }));
    await user.type(within(points).getByLabelText(/^Сколько баллов/), "20");
    await user.type(within(points).getByLabelText(/^Причина/), "Ошибочное начисление");
    await user.click(within(points).getByRole("button", { name: "Списать 20 баллов" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/120\s*→\s*100/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Да, списать" }));
    expect(customersApi.adjustPoints).toHaveBeenCalledWith("c1", { delta: -20, comment: "Ошибочное начисление" });
  });

  it("без причины баллы не меняем", async () => {
    const user = userEvent.setup();
    vi.mocked(customersApi.get).mockResolvedValue(customerCard());
    renderWithAdmin(<CustomerDetail id="c1" />);
    const points = await screen.findByRole("region", { name: "Баллы" });
    await user.type(within(points).getByLabelText(/^Сколько баллов/), "50");
    expect(within(points).getByRole("button", { name: "Начислить 50 баллов" })).toBeDisabled();
    expect(within(points).getByText(/Напишите причину/)).toBeInTheDocument();
  });

  it("списать больше, чем на счёте, нельзя — предупреждаем заранее", async () => {
    const user = userEvent.setup();
    vi.mocked(customersApi.get).mockResolvedValue(customerCard());
    renderWithAdmin(<CustomerDetail id="c1" />);
    const points = await screen.findByRole("region", { name: "Баллы" });
    await user.click(within(points).getByRole("radio", { name: "Списать" }));
    await user.type(within(points).getByLabelText(/^Сколько баллов/), "500");
    await user.type(within(points).getByLabelText(/^Причина/), "Тест");
    expect(within(points).getByText(/На счёте только 120 баллов/)).toBeInTheDocument();
    expect(within(points).getByRole("button", { name: "Списать 500 баллов" })).toBeDisabled();
  });

  it("ошибка сервера — его текстом в окне подтверждения", async () => {
    const user = userEvent.setup();
    vi.mocked(customersApi.get).mockResolvedValue(customerCard());
    vi.mocked(customersApi.adjustPoints).mockRejectedValue(new ApiError(409, "Недостаточно баллов: на счёте 100, нужно 120", "not_enough_points"));
    renderWithAdmin(<CustomerDetail id="c1" />);
    const points = await screen.findByRole("region", { name: "Баллы" });
    await user.click(within(points).getByRole("radio", { name: "Списать" }));
    await user.type(within(points).getByLabelText(/^Сколько баллов/), "120");
    await user.type(within(points).getByLabelText(/^Причина/), "Списание");
    await user.click(within(points).getByRole("button", { name: "Списать 120 баллов" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Да, списать" }));
    expect(await within(dialog).findByText("Недостаточно баллов: на счёте 100, нужно 120")).toBeInTheDocument();
  });

  it("заметки владельца: подсказка с примером и сохранение", async () => {
    const user = userEvent.setup();
    vi.mocked(customersApi.get).mockResolvedValue(customerCard());
    vi.mocked(customersApi.updateNotes).mockResolvedValue(customerCard({ notes: "любит шу, брал на ДР жены" }));
    renderWithAdmin(<CustomerDetail id="c1" />);
    const notes = await screen.findByLabelText(/^Заметки о клиенте/);
    expect(notes).toHaveAttribute("placeholder", expect.stringContaining("любит шу, брал на ДР жены"));
    await user.type(notes, "любит шу, брал на ДР жены");
    await user.click(screen.getByRole("button", { name: "Сохранить заметку" }));
    expect(customersApi.updateNotes).toHaveBeenCalledWith("c1", "любит шу, брал на ДР жены");
  });

  it("у клиента нет заказов — так и пишем", async () => {
    vi.mocked(customersApi.get).mockResolvedValue(customerCard({ orders: [], orders_count: 0, total_spent_kop: 0, average_check_kop: 0 }));
    renderWithAdmin(<CustomerDetail id="c1" />);
    const orders = await screen.findByRole("region", { name: "Заказы" });
    expect(within(orders).getByText(/Заказов пока нет/)).toBeInTheDocument();
  });

  it("сотруднику баллы видны, но начислять и списывать может только владелец", async () => {
    vi.mocked(customersApi.get).mockResolvedValue(customerCard());
    renderWithAdmin(<CustomerDetail id="c1" />, { owner: false, permissions: ["customers"] });
    const points = await screen.findByRole("region", { name: "Баллы" });
    expect(within(points).getByTestId("points-balance")).toHaveTextContent("120");
    expect(within(points).getByRole("list", { name: "История баллов" })).toBeInTheDocument();
    expect(within(points).getByText("Начислять и списывать баллы может только владелец")).toBeInTheDocument();
    expect(within(points).queryByLabelText(/^Сколько баллов/)).not.toBeInTheDocument();
    expect(within(points).queryByRole("radio", { name: "Списать" })).not.toBeInTheDocument();
    expect(within(points).queryByRole("button", { name: /Начислить/ })).not.toBeInTheDocument();
    // заметки сотруднику доступны
    expect(screen.getByLabelText(/^Заметки о клиенте/)).toBeInTheDocument();
  });

  it("без права «Клиенты» экран закрыт", () => {
    vi.mocked(customersApi.get).mockResolvedValue(customerCard());
    renderWithAdmin(<CustomerDetail id="c1" />, { owner: false, permissions: ["orders"] });
    expect(screen.getByText(/Нет доступа/)).toBeInTheDocument();
    expect(customersApi.get).not.toHaveBeenCalled();
  });
});
