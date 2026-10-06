import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/lib/api/client";
import { shopApi } from "@/lib/shop-api";

import { OrderResult } from "./OrderResult";

vi.mock("@/lib/shop-api", () => ({ shopApi: { orderStatus: vi.fn(), retryPayment: vi.fn() } }));

const NBSP = " ";

function status(overrides: Partial<Schemas["OrderStatusOut"]> = {}): Schemas["OrderStatusOut"] {
  return {
    order_id: "0192f000-0000-7000-8000-0000000000c1",
    number: "NSB-10001",
    status: "awaiting_payment",
    status_label: "Ожидает оплаты",
    paid: false,
    can_retry: true,
    reserved_until: "2026-10-05T09:30:00Z",
    total_kop: 315_000,
    delivery_kop: 35_000,
    delivery_label: "СДЭК — пункт выдачи",
    points_to_earn: 140,
    items: [{ name: "Да Хун Пао", variant_label: "50 г", qty: 2, total_kop: 280_000 }],
    ...overrides,
  };
}

describe("OrderResult — страница после оплаты", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("оплачен — благодарность, состав, баллы", async () => {
    vi.mocked(shopApi.orderStatus).mockResolvedValue(status({ status: "paid", status_label: "Оплачен", paid: true }));
    render(<OrderResult orderId="0192f000-0000-7000-8000-0000000000c1" navigate={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: /заказ оплачен/i })).toBeInTheDocument();
    expect(screen.getByText(/NSB-10001/)).toBeInTheDocument();
    expect(screen.getByText("Да Хун Пао")).toBeInTheDocument();
    expect(screen.getByText(`3${NBSP}150${NBSP}₽`)).toBeInTheDocument();
    expect(screen.getByText(/начислим 140 баллов/)).toBeInTheDocument();
  });

  it("вебхук ещё не пришёл — «Проверяем оплату…» и повторный запрос", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(shopApi.orderStatus)
      .mockResolvedValueOnce(status())
      .mockResolvedValue(status({ status: "paid", paid: true, status_label: "Оплачен" }));
    render(<OrderResult orderId="0192f000-0000-7000-8000-0000000000c1" navigate={vi.fn()} />);
    expect(await screen.findByText("Проверяем оплату…")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    expect(await screen.findByRole("heading", { name: /заказ оплачен/i })).toBeInTheDocument();
    expect(shopApi.orderStatus).toHaveBeenCalledTimes(2);
  });

  it("оплата не прошла — можно попробовать ещё раз", async () => {
    const navigate = vi.fn();
    vi.mocked(shopApi.orderStatus).mockResolvedValue(status());
    vi.mocked(shopApi.retryPayment).mockResolvedValue({ payment_url: "https://pay.example/again" });
    render(<OrderResult orderId="0192f000-0000-7000-8000-0000000000c1" failed navigate={navigate} />);
    expect(await screen.findByRole("heading", { name: "Оплата не прошла" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Попробовать ещё раз" }));
    expect(shopApi.retryPayment).toHaveBeenCalledWith("0192f000-0000-7000-8000-0000000000c1");
    expect(navigate).toHaveBeenCalledWith("https://pay.example/again");
  });

  it("заказ отменён — объяснение и ссылка в каталог", async () => {
    vi.mocked(shopApi.orderStatus).mockResolvedValue(
      status({ status: "cancelled", status_label: "Отменён", can_retry: false }),
    );
    render(<OrderResult orderId="0192f000-0000-7000-8000-0000000000c1" navigate={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Заказ отменён" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Вернуться в каталог" })).toHaveAttribute("href", "/catalog");
  });
});
