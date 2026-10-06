import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { shopApi } from "@/lib/shop-api";
import { cart, productPage } from "@/tests/fixtures";

import { CartProvider } from "./cart-context";
import { ProductPurchase } from "./ProductPurchase";

vi.mock("@/lib/shop-api", () => ({
  shopApi: { addToCart: vi.fn(), getCart: vi.fn(), customPrice: vi.fn() },
}));

const NBSP = "\u00a0";
// в тексте testing-library сводит неразрывные пробелы к обычным (в доступных именах — нет)
const rub = (n: string) => `${n} ₽`;

function renderPurchase(product = productPage()) {
  return render(
    <CartProvider>
      <ProductPurchase product={product} />
    </CartProvider>,
  );
}

describe("ProductPurchase — выбор веса, количества и «В корзину»", () => {
  beforeEach(() => {
    vi.mocked(shopApi.getCart).mockResolvedValue(cart({ count: 0, lines: [] }));
    vi.mocked(shopApi.addToCart).mockResolvedValue(cart({ count: 1 }));
  });

  it("варианты веса: выбран вариант по умолчанию, недоступный — неактивен", () => {
    renderPurchase();
    const group = screen.getByRole("radiogroup", { name: "Вес" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: `50${NBSP}г` })).toBeChecked();
    const big = screen.getByRole("radio", { name: /200\s+г.*нет в наличии/ });
    expect(big).toBeDisabled();
  });

  it("итог = цена варианта × количество; количество ограничено остатком", async () => {
    renderPurchase();
    expect(screen.getByTestId("purchase-total")).toHaveTextContent(rub("1 400"));
    await userEvent.click(screen.getByRole("radio", { name: `25${NBSP}г` }));
    expect(screen.getByTestId("purchase-total")).toHaveTextContent(rub("700"));
    // остаток 120 г → пачек по 25 г не больше 4
    const plus = screen.getByRole("button", { name: "Больше" });
    await userEvent.click(plus);
    await userEvent.click(plus);
    await userEvent.click(plus);
    expect(screen.getByTestId("purchase-qty")).toHaveTextContent("4");
    expect(plus).toBeDisabled();
    expect(screen.getByTestId("purchase-total")).toHaveTextContent(rub("2 800"));
  });

  it("кладёт выбранный вариант в корзину", async () => {
    renderPurchase();
    await userEvent.click(screen.getByRole("radio", { name: `100${NBSP}г` }));
    await userEvent.click(screen.getByRole("button", { name: "В корзину" }));
    expect(shopApi.addToCart).toHaveBeenCalledWith({
      product_id: "0192f000-0000-7000-8000-000000000001",
      kind: "preset",
      grams: 100,
      qty: 1,
    });
  });

  it("свой вес: цену и ограничения сообщает сервер", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(shopApi.customPrice).mockImplementation(async (_slug: string, grams: number) =>
      grams === 75
        ? { grams, price_kop: 213_800, old_price_kop: null, available: true, message: null }
        : { grams, price_kop: null, old_price_kop: null, available: false, message: "Вес должен быть кратен 5 г" },
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPurchase();
    await user.click(screen.getByRole("radio", { name: "Свой вес" }));
    const input = screen.getByLabelText("Свой вес, г");
    await user.clear(input);
    await user.type(input, "77");
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(await screen.findByText("Вес должен быть кратен 5 г")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "В корзину" })).toBeDisabled();

    await user.clear(input);
    await user.type(input, "75");
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(await screen.findByTestId("purchase-total")).toHaveTextContent(rub("2 138"));
    expect(shopApi.customPrice).toHaveBeenLastCalledWith("da-hun-pao", 75);
    await user.click(screen.getByRole("button", { name: "В корзину" }));
    expect(shopApi.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "custom", grams: 75, qty: 1 }),
    );
    vi.useRealTimers();
  });

  it("скидка видна у варианта и в итоге", () => {
    renderPurchase(
      productPage({
        weight_options: [
          { kind: "preset", grams: 50, label: "50 г", price_kop: 112_000, old_price_kop: 140_000, available: true },
        ],
        default_variant: { kind: "preset", grams: 50 },
      }),
    );
    expect(screen.getByTestId("purchase-total")).toHaveTextContent(rub("1 120"));
    expect(screen.getByTestId("purchase-old-total")).toHaveTextContent(rub("1 400"));
  });

  it("анонс ближайшего четверга", () => {
    renderPurchase(productPage({ upcoming_thursday: "−25% на этот чай в четверг, 8 октября" }));
    expect(screen.getByText("−25% на этот чай в четверг, 8 октября")).toBeInTheDocument();
  });

  it("штучный товар: без выбора веса, количество до остатка", async () => {
    renderPurchase(
      productPage({
        type: "unit",
        weight_options: [],
        custom_weight: null,
        default_variant: { kind: "unit", grams: 0 },
        price_kop: 150_000,
        max_qty: 2,
        available_grams: null,
      }),
    );
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    const plus = screen.getByRole("button", { name: "Больше" });
    await userEvent.click(plus);
    expect(plus).toBeDisabled();
    expect(screen.getByTestId("purchase-total")).toHaveTextContent(rub("3 000"));
    await userEvent.click(screen.getByRole("button", { name: "В корзину" }));
    expect(shopApi.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "unit", grams: 0, qty: 2 }),
    );
  });

  it("нет в наличии — вместо покупки сообщение", () => {
    renderPurchase(
      productPage({
        in_stock: false,
        available_grams: 0,
        weight_options: [
          { kind: "preset", grams: 50, label: "50 г", price_kop: 140_000, old_price_kop: null, available: false },
        ],
        custom_weight: null,
      }),
    );
    expect(screen.getByRole("button", { name: "Нет в наличии" })).toBeDisabled();
  });
});
