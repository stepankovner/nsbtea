import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { shopApi } from "@/lib/shop-api";
import { cart, productCard } from "@/tests/fixtures";

import { CartProvider } from "./cart-context";
import { CartToast } from "./CartToast";
import { TeaCard } from "./TeaCard";

vi.mock("@/lib/shop-api", () => ({ shopApi: { addToCart: vi.fn(), getCart: vi.fn() } }));

// testing-library сводит неразрывные пробелы в тексте к обычным (в доступных именах — нет)
const NBSP = " ";

function renderCard(product = productCard()) {
  return render(
    <CartProvider>
      <TeaCard product={product} />
      <CartToast />
    </CartProvider>,
  );
}

describe("TeaCard — плитка товара в каталоге", () => {
  beforeEach(() => {
    vi.mocked(shopApi.getCart).mockResolvedValue(cart({ count: 0, lines: [] }));
  });

  it("название ведёт на карточку, видны мета, иероглифы и цена за 50 г", () => {
    renderCard();
    const links = screen.getAllByRole("link", { name: /Да Хун Пао/ });
    expect(links[0]).toHaveAttribute("href", "/product/da-hun-pao");
    expect(screen.getByText("Улун · Уишань · 2024")).toBeInTheDocument();
    expect(screen.getByText("大红袍")).toBeInTheDocument();
    expect(screen.getByText(`1${NBSP}400${NBSP}₽`)).toBeInTheDocument();
    expect(screen.getByText(`/ 50${NBSP}г`)).toBeInTheDocument();
  });

  it("скидка: новая цена, зачёркнутая старая и плашка", () => {
    renderCard(
      productCard({
        price_kop: 112_000,
        old_price_kop: 140_000,
        badges: [{ kind: "thursday", label: "−20% до 8 октября" }],
      }),
    );
    expect(screen.getByText(`1${NBSP}120${NBSP}₽`)).toBeInTheDocument();
    expect(screen.getByText(`1${NBSP}400${NBSP}₽`).tagName).toBe("S");
    expect(screen.getByText("−20% до 8 октября")).toBeInTheDocument();
  });

  it("«В корзину» кладёт вариант по умолчанию и показывает подтверждение со ссылкой", async () => {
    vi.mocked(shopApi.addToCart).mockResolvedValue(cart({ count: 1 }));
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "В корзину" }));
    expect(shopApi.addToCart).toHaveBeenCalledWith({
      product_id: "0192f000-0000-7000-8000-000000000001",
      kind: "preset",
      grams: 50,
      qty: 1,
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(`Да Хун Пао, 50${NBSP}г — в корзине`);
    expect(within(status).getByRole("link", { name: "В корзину →" })).toHaveAttribute("href", "/cart");
  });

  it("ошибка сервера показывается словами", async () => {
    vi.mocked(shopApi.addToCart).mockRejectedValue(
      new ApiError(409, "Доступно не больше 30 г", "insufficient_stock"),
    );
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "В корзину" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Доступно не больше 30 г");
  });

  it("нет в наличии — кнопка неактивна", () => {
    renderCard(productCard({ in_stock: false, badges: [{ kind: "out", label: "Нет в наличии" }] }));
    expect(screen.getByRole("button", { name: "Нет в наличии" })).toBeDisabled();
  });

  it("штучный товар — цена без граммовки", () => {
    renderCard(
      productCard({
        type: "unit",
        name: "Гайвань",
        price_kop: 150_000,
        price_grams: null,
        price_per_gram_kop: null,
        default_variant: { kind: "unit", grams: 0 },
      }),
    );
    expect(screen.getByText(`1${NBSP}500${NBSP}₽`)).toBeInTheDocument();
    expect(screen.queryByText(/\/ 50/)).not.toBeInTheDocument();
  });

  it("с фото — картинка с описанием", () => {
    renderCard(
      productCard({
        image: {
          id: "0192f000-0000-7000-8000-0000000000f1",
          url: "/media/images/a/original.webp",
          srcset: { "320": "/media/images/a/320.webp", "640": "/media/images/a/640.webp" },
          width: 1200,
          height: 1500,
        },
      }),
    );
    const img = screen.getByRole("img", { name: "Да Хун Пао" });
    expect(img).toHaveAttribute("srcset", "/media/images/a/320.webp 320w, /media/images/a/640.webp 640w");
  });
});
