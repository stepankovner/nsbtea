import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { shopApi } from "@/lib/shop-api";
import { cart, site } from "@/tests/fixtures";

import { CartProvider } from "../cart-context";
import { CheckoutForm } from "./CheckoutForm";

vi.mock("@/lib/shop-api", () => ({
  shopApi: {
    getCart: vi.fn(),
    quote: vi.fn(),
    cities: vi.fn(),
    offices: vi.fn(),
    checkout: vi.fn(),
  },
}));

const NBSP = " ";
const rub = (n: string) => `${n.replace(/ /g, NBSP)}${NBSP}₽`;
const assign = vi.fn();

function renderForm(options: { siteData?: ReturnType<typeof site>; customer?: { name: string; phone: string; email: string } | null } = {}) {
  const initial = cart();
  vi.mocked(shopApi.getCart).mockResolvedValue(initial);
  return render(
    <CartProvider initialCart={initial}>
      <CheckoutForm site={options.siteData ?? site()} customer={options.customer ?? null} navigate={assign} />
    </CartProvider>,
  );
}

async function fillContacts() {
  await userEvent.type(screen.getByLabelText("Имя"), "Никита");
  await userEvent.type(screen.getByLabelText("Телефон"), "8 900 123-45-67");
  await userEvent.type(screen.getByLabelText("Почта"), "nikita@nsbtea.ru");
}

async function acceptConsents() {
  await userEvent.click(screen.getByRole("checkbox", { name: /условия оферты/ }));
  await userEvent.click(screen.getByRole("checkbox", { name: /обработку персональных данных/ }));
}

describe("CheckoutForm — оформление на одной странице", () => {
  beforeEach(() => {
    assign.mockReset();
    vi.mocked(shopApi.quote).mockResolvedValue({ method: "pickup", price_kop: 0, free: true, period: null });
    vi.mocked(shopApi.checkout).mockResolvedValue({
      order_id: "0192f000-0000-7000-8000-0000000000c1",
      number: "NSB-10001",
      status: "awaiting_payment",
      payment_url: "https://pay.example/abc",
      total_kop: 280_000,
    });
  });

  it("способы получения из настроек магазина", () => {
    renderForm();
    const group = screen.getByRole("radiogroup", { name: "Получение" });
    const options = within(group).getAllByRole("radio").map((r) => r.getAttribute("aria-label") ?? r.textContent);
    expect(options).toHaveLength(4);
    expect(within(group).getByRole("radio", { name: /Самовывоз/ })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: /Курьер по Владимиру/ })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: /СДЭК — пункт выдачи/ })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: /СДЭК — до двери/ })).toBeInTheDocument();
  });

  it("выключенный способ не показывается", () => {
    const s = site();
    renderForm({ siteData: { ...s, delivery: { ...s.delivery, courier_enabled: false, pickup_enabled: false } } });
    expect(screen.queryByRole("radio", { name: /Самовывоз/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Курьер/ })).not.toBeInTheDocument();
  });

  it("пустая форма — ошибки у полей, заказ не создаётся", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: /Оплатить/ }));
    expect(screen.getByText("Укажите имя")).toBeInTheDocument();
    expect(screen.getByText("Нужен номер из 10–11 цифр")).toBeInTheDocument();
    expect(screen.getByText("Нужно принять условия оферты")).toBeInTheDocument();
    expect(screen.getByText("Нужно согласие на обработку персональных данных")).toBeInTheDocument();
    expect(shopApi.checkout).not.toHaveBeenCalled();
  });

  it("ссылки на оферту и политику", () => {
    renderForm();
    expect(screen.getByRole("link", { name: "условия оферты" })).toHaveAttribute("href", "/legal/offer");
    expect(screen.getByRole("link", { name: "обработку персональных данных" })).toHaveAttribute(
      "href",
      "/legal/privacy",
    );
  });

  it("самовывоз: заказ создаётся и покупатель уходит на оплату", async () => {
    renderForm();
    await fillContacts();
    await userEvent.click(screen.getByRole("radio", { name: /Самовывоз/ }));
    await acceptConsents();
    await userEvent.click(screen.getByRole("button", { name: `Оплатить ${rub("2 800")}` }));
    expect(shopApi.checkout).toHaveBeenCalledWith({
      name: "Никита",
      phone: "+79001234567",
      email: "nikita@nsbtea.ru",
      delivery: { method: "pickup" },
      comment: null,
      consent_offer: true,
      consent_pd: true,
      marketing_consent: false,
      payment_method: "online",
      expected_total_kop: 280_000,
    });
    expect(assign).toHaveBeenCalledWith("https://pay.example/abc");
  });

  it("данные вошедшего покупателя подставлены", () => {
    renderForm({ customer: { name: "Аня", phone: "+79001112233", email: "anya@example.ru" } });
    expect(screen.getByLabelText("Имя")).toHaveValue("Аня");
    expect(screen.getByLabelText("Почта")).toHaveValue("anya@example.ru");
  });

  it("курьер: адрес обязателен, стоимость считается сервером", async () => {
    renderForm();
    await fillContacts();
    await userEvent.click(screen.getByRole("radio", { name: /Курьер по Владимиру/ }));
    await acceptConsents();
    await userEvent.click(screen.getByRole("button", { name: /Оплатить/ }));
    expect(screen.getByText("Укажите адрес доставки")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Адрес во Владимире"), "ул. Мира, 1, кв. 2");
    await userEvent.type(screen.getByLabelText("Удобное время"), "после 18:00");
    await userEvent.click(screen.getByRole("button", { name: /Оплатить/ }));
    expect(shopApi.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery: { method: "courier", address: "ул. Мира, 1, кв. 2", courier_time: "после 18:00" },
      }),
    );
  });

  it("СДЭК до пункта выдачи: город → пункт → цена → итог с доставкой", async () => {
    vi.mocked(shopApi.cities).mockResolvedValue([{ code: 44, name: "Москва", region: null }]);
    vi.mocked(shopApi.offices).mockResolvedValue([
      { code: "MSK1", name: "На Тверской", address: "Москва, Тверская, 1", workTime: "Пн-Вс 10-22" },
    ]);
    vi.mocked(shopApi.quote).mockResolvedValue({ method: "cdek_pvz", price_kop: 35_000, free: false, period: "2–4 дн." });
    renderForm();
    await fillContacts();
    await userEvent.click(screen.getByRole("radio", { name: /СДЭК — пункт выдачи/ }));
    await userEvent.type(screen.getByLabelText("Город"), "Мос");
    await userEvent.click(await screen.findByRole("option", { name: /Москва/ }));
    expect(shopApi.offices).toHaveBeenCalledWith(44);
    await userEvent.click(await screen.findByRole("radio", { name: /На Тверской/ }));
    expect(shopApi.quote).toHaveBeenLastCalledWith({
      method: "cdek_pvz",
      city_code: 44,
      city_name: "Москва",
      pvz_code: "MSK1",
      pvz_address: "Москва, Тверская, 1",
    });
    expect(await screen.findByTestId("checkout-delivery")).toHaveTextContent(rub("350"));
    expect(screen.getByText("2–4 дн.")).toBeInTheDocument();
    await acceptConsents();
    await userEvent.click(screen.getByRole("button", { name: `Оплатить ${rub("3 150")}` }));
    expect(shopApi.checkout).toHaveBeenCalledWith(expect.objectContaining({ expected_total_kop: 315_000 }));
  });

  it("ошибка сервера при оформлении показывается, перехода нет", async () => {
    vi.mocked(shopApi.checkout).mockRejectedValue(
      new ApiError(409, "Цены изменились — проверьте корзину", "price_changed"),
    );
    renderForm();
    await fillContacts();
    await userEvent.click(screen.getByRole("radio", { name: /Самовывоз/ }));
    await acceptConsents();
    await userEvent.click(screen.getByRole("button", { name: /Оплатить/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Цены изменились — проверьте корзину");
    expect(assign).not.toHaveBeenCalled();
  });
});
