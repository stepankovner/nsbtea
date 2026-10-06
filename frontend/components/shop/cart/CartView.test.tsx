import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { shopApi } from "@/lib/shop-api";
import { cart, cartLine } from "@/tests/fixtures";

import { CartProvider } from "../cart-context";
import { CartView } from "./CartView";

vi.mock("@/lib/shop-api", () => ({
  shopApi: {
    getCart: vi.fn(),
    updateLine: vi.fn(),
    removeLine: vi.fn(),
    applyPromo: vi.fn(),
    removePromo: vi.fn(),
    setPoints: vi.fn(),
  },
}));

// testing-library сводит неразрывные пробелы в тексте к обычным (в доступных именах — нет)
const NBSP = " ";
const rub = (n: string) => `${n.replace(/ /g, NBSP)}${NBSP}₽`;

function renderCart(initial = cart(), loggedIn = false) {
  vi.mocked(shopApi.getCart).mockResolvedValue(initial);
  return render(
    <CartProvider initialCart={initial}>
      <CartView loggedIn={loggedIn} />
    </CartProvider>,
  );
}

describe("CartView — корзина", () => {
  beforeEach(() => {
    vi.mocked(shopApi.updateLine).mockResolvedValue(cart());
    vi.mocked(shopApi.removeLine).mockResolvedValue(cart({ lines: [], count: 0 }));
  });

  it("пустая корзина", () => {
    renderCart(cart({ lines: [], count: 0, items_total_kop: 0 }));
    expect(screen.getByText("Пока пусто.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти в каталог" })).toHaveAttribute("href", "/catalog");
  });

  it("строка: название, вариант, сумма; количество меняется на сервере", async () => {
    renderCart(cart({ lines: [cartLine({ qty: 1, max_qty: 3, line_total_kop: 140_000, total_kop: 140_000 })] }));
    expect(screen.getByRole("link", { name: "Да Хун Пао" })).toHaveAttribute("href", "/product/da-hun-pao");
    expect(screen.getByText(`50${NBSP}г`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Больше: Да Хун Пао" }));
    expect(shopApi.updateLine).toHaveBeenCalledWith("0192f000-0000-7000-8000-0000000000a1", { qty: 2 });
  });

  it("нельзя добавить больше остатка, можно убрать строку", async () => {
    renderCart();
    expect(screen.getByRole("button", { name: "Больше: Да Хун Пао" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Убрать: Да Хун Пао" }));
    expect(shopApi.removeLine).toHaveBeenCalledWith("0192f000-0000-7000-8000-0000000000a1");
    expect(await screen.findByText("Пока пусто.")).toBeInTheDocument();
  });

  it("проблема со строкой и общая проблема видны покупателю", () => {
    renderCart(
      cart({
        lines: [cartLine({ problem: "Осталось только 50 г" })],
        problems: ["Уменьшите количество, чтобы оформить заказ"],
      }),
    );
    expect(screen.getByText("Осталось только 50 г")).toBeInTheDocument();
    expect(screen.getByText("Уменьшите количество, чтобы оформить заказ")).toBeInTheDocument();
  });

  it("товарная скидка в строке и пояснения по скидкам", () => {
    renderCart(
      cart({
        lines: [cartLine({ product_discount_kop: 56_000, total_kop: 224_000, promotion_label: "Чай недели −20%" })],
        product_discount_kop: 56_000,
        items_after_discounts_kop: 224_000,
        total_without_delivery_kop: 224_000,
        notes: ["Промокод не действует на товары со скидкой"],
      }),
    );
    expect(screen.getByText("Чай недели −20%")).toBeInTheDocument();
    expect(screen.getByText("Промокод не действует на товары со скидкой")).toBeInTheDocument();
    expect(screen.getByTestId("summary-product-discount")).toHaveTextContent(`−${rub("560")}`);
    expect(screen.getByTestId("summary-total")).toHaveTextContent(rub("2 240"));
  });

  it("промокод: применение и сообщение, почему не сработал", async () => {
    vi.mocked(shopApi.applyPromo).mockResolvedValue(
      cart({ promo_code: { code: "CHAI10", applied: false, message: "Минимальная сумма заказа — 3 000 ₽" } }),
    );
    renderCart();
    await userEvent.type(screen.getByLabelText("Промокод"), "chai10");
    await userEvent.click(screen.getByRole("button", { name: "Применить" }));
    expect(shopApi.applyPromo).toHaveBeenCalledWith("chai10");
    expect(await screen.findByText("Минимальная сумма заказа — 3 000 ₽")).toBeInTheDocument();
  });

  it("применённая скидка на заказ видна в итогах", () => {
    renderCart(
      cart({
        promo_code: { code: "CHAI10", applied: true, message: null },
        order_discount_kop: 28_000,
        order_discount_label: "Промокод CHAI10",
        total_without_delivery_kop: 252_000,
      }),
    );
    expect(screen.getByText("Промокод CHAI10")).toBeInTheDocument();
    expect(screen.getByTestId("summary-order-discount")).toHaveTextContent(`−${rub("280")}`);
    expect(screen.getByRole("button", { name: "Убрать промокод" })).toBeInTheDocument();
  });

  it("баллы: гостю — приглашение войти, покупателю — списание", async () => {
    const { unmount } = renderCart();
    expect(screen.getByText(/Войдите, чтобы списать баллы/)).toBeInTheDocument();
    expect(screen.getByText(`Будет начислено 140 баллов`)).toBeInTheDocument();
    unmount();

    vi.mocked(shopApi.setPoints).mockResolvedValue(
      cart({ points: { enabled: true, balance: 500, max_spend: 500, requested: 500, applied: 500 } }),
    );
    renderCart(cart({ points: { enabled: true, balance: 500, max_spend: 1_400, requested: 0, applied: 0 } }), true);
    expect(screen.getByText("На счёте 500 баллов")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Списать максимум" }));
    expect(shopApi.setPoints).toHaveBeenCalledWith({ max: true });
  });

  it("приветственная скидка — подсказка до входа", () => {
    renderCart(cart({ welcome: { percent: 10, applied: false, tentative: true } }));
    expect(screen.getByText(/−10% на первый заказ/)).toBeInTheDocument();
  });
});
