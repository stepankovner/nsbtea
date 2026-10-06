import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { shopApi } from "@/lib/shop-api";
import { cart, site } from "@/tests/fixtures";

import { CartProvider } from "./cart-context";
import { Header } from "./Header";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/" }));
vi.mock("@/lib/shop-api", () => ({ shopApi: { getCart: vi.fn(), suggest: vi.fn() } }));

function renderHeader(siteData = site(), count = 2) {
  vi.mocked(shopApi.getCart).mockResolvedValue(cart({ count }));
  return render(
    <CartProvider initialCart={cart({ count })}>
      <Header site={siteData} />
    </CartProvider>,
  );
}

describe("Header — шапка витрины", () => {
  it("разделы, «Чай недели» с процентом и корзина с числом товаров", () => {
    renderHeader();
    const nav = screen.getByRole("navigation", { name: "Разделы" });
    expect(within(nav).getByRole("link", { name: "Чай" })).toHaveAttribute("href", "/catalog");
    expect(within(nav).getByRole("link", { name: "Чай недели −20%" })).toHaveAttribute("href", "/#chai-nedeli");
    expect(within(nav).getByRole("link", { name: "Церемонии и сплавы" })).toHaveAttribute("href", "/events");
    expect(screen.getByRole("link", { name: "Корзина, товаров: 2" })).toHaveAttribute("href", "/cart");
  });

  it("без запланированного четверга пункта «Чай недели» нет", () => {
    const s = site();
    renderHeader({ ...s, thursday: { ...s.thursday, active: false } });
    expect(screen.queryByRole("link", { name: /Чай недели/ })).not.toBeInTheDocument();
  });

  it("меню на телефоне открывается кнопкой", async () => {
    renderHeader();
    const button = screen.getByRole("button", { name: "Меню" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: "Меню" })).toBeInTheDocument();
  });

  it("поиск ведёт в каталог с запросом", async () => {
    vi.mocked(shopApi.suggest).mockResolvedValue([]);
    renderHeader();
    await userEvent.click(screen.getByRole("button", { name: "Поиск" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Поиск по каталогу" }), "шу пуэр{Enter}");
    expect(push).toHaveBeenCalledWith("/catalog?q=%D1%88%D1%83+%D0%BF%D1%83%D1%8D%D1%80");
  });
});
