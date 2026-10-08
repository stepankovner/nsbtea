import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { shopApi } from "@/lib/shop-api";
import { cart, productCard } from "@/tests/fixtures";

import { AddToCartButton } from "./AddToCartButton";
import { CartProvider } from "./cart-context";

vi.mock("@/lib/shop-api", () => ({ shopApi: { addToCart: vi.fn(), getCart: vi.fn() } }));

describe("AddToCartButton — «В корзину» на крупных карточках главной", () => {
  beforeEach(() => {
    vi.mocked(shopApi.getCart).mockResolvedValue(cart({ count: 0, lines: [] }));
  });

  it("в доступном имени есть название товара — кнопки на странице различимы", async () => {
    vi.mocked(shopApi.addToCart).mockResolvedValue(cart({ count: 1 }));
    render(
      <CartProvider>
        <AddToCartButton product={productCard()} />
      </CartProvider>,
    );
    const button = screen.getByRole("button", { name: "В корзину: Да Хун Пао" });
    expect(button).toHaveTextContent("В корзину");
    await userEvent.click(button);
    expect(shopApi.addToCart).toHaveBeenCalledWith(expect.objectContaining({ grams: 50, qty: 1 }));
  });

  it("нет в наличии — неактивна и тоже с названием", () => {
    render(
      <CartProvider>
        <AddToCartButton product={productCard({ in_stock: false })} />
      </CartProvider>,
    );
    expect(screen.getByRole("button", { name: "Нет в наличии: Да Хун Пао" })).toBeDisabled();
  });
});
