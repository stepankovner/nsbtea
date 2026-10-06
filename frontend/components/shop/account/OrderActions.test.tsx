import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { shopApi } from "@/lib/shop-api";

import { OrderActions } from "./OrderActions";

vi.mock("@/lib/shop-api", () => ({ shopApi: { repeatOrder: vi.fn(), retryPayment: vi.fn() } }));

describe("OrderActions — повтор заказа и оплата", () => {
  it("повтор: что добавлено и чего нет в наличии", async () => {
    vi.mocked(shopApi.repeatOrder).mockResolvedValue({ added: ["Да Хун Пао, 50 г"], unavailable: ["Лун Цзин, 100 г"] });
    render(<OrderActions orderId="o1" canPay={false} navigate={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Повторить заказ" }));
    expect(shopApi.repeatOrder).toHaveBeenCalledWith("o1");
    expect(await screen.findByText(/Положили в корзину: Да Хун Пао, 50 г/)).toBeInTheDocument();
    expect(screen.getByText(/Нет в наличии: Лун Цзин, 100 г/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти в корзину" })).toHaveAttribute("href", "/cart");
  });

  it("неоплаченный заказ можно оплатить", async () => {
    const navigate = vi.fn();
    vi.mocked(shopApi.retryPayment).mockResolvedValue({ payment_url: "https://pay.example/x" });
    render(<OrderActions orderId="o1" canPay navigate={navigate} />);
    await userEvent.click(screen.getByRole("button", { name: "Оплатить" }));
    expect(navigate).toHaveBeenCalledWith("https://pay.example/x");
  });
});
