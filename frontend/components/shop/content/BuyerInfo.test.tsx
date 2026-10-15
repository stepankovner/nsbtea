import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { site } from "@/tests/fixtures";

import { ContactsDetails, DeliveryPaymentDetails } from "./BuyerInfo";

/** Банк проверяет на сайте реквизиты, условия доставки и оплаты (требования Точки к сайту). */
describe("ContactsDetails — страница «Контакты»", () => {
  it("контакты и реквизиты ИП", () => {
    render(<ContactsDetails site={site()} />);
    expect(screen.getByText("+7 900 000-00-00")).toBeInTheDocument();
    expect(screen.getByText("shop@nsbtea.ru")).toBeInTheDocument();
    const requisites = screen.getByRole("region", { name: "Реквизиты" });
    expect(within(requisites).getByText("ИП Булич Никита Сергеевич")).toBeInTheDocument();
    expect(within(requisites).getByText("330000000000")).toBeInTheDocument();
    expect(within(requisites).getByText("300000000000000")).toBeInTheDocument();
    expect(within(requisites).getByText("г. Владимир")).toBeInTheDocument();
  });

  it("пока реквизиты не заполнены — блока нет", () => {
    const s = site();
    render(<ContactsDetails site={{ ...s, store: { ...s.store, legal_name: "", inn: "", ogrnip: "", legal_address: "" } }} />);
    expect(screen.queryByRole("region", { name: "Реквизиты" })).not.toBeInTheDocument();
  });
});

describe("DeliveryPaymentDetails — страница «Доставка и оплата»", () => {
  it("способы доставки и цены — из настроек магазина", () => {
    const s = site();
    render(
      <DeliveryPaymentDetails
        site={{ ...s, delivery: { ...s.delivery, courier_price_kop: 30_000, courier_free_from_kop: 300_000 } }}
      />,
    );
    const delivery = screen.getByRole("region", { name: "Способы доставки" });
    expect(within(delivery).getByText("Самовывоз во Владимире")).toBeInTheDocument();
    expect(within(delivery).getByText(/ул\. Примерная, 1/)).toBeInTheDocument();
    expect(within(delivery).getByText("Курьер по Владимиру")).toBeInTheDocument();
    expect(within(delivery).getByText(/300 ₽.*бесплатно от 3 000 ₽/)).toBeInTheDocument();
    expect(within(delivery).getByText("СДЭК — по всей России")).toBeInTheDocument();
  });

  it("выключенный способ не показывается", () => {
    const s = site();
    render(<DeliveryPaymentDetails site={{ ...s, delivery: { ...s.delivery, cdek_enabled: false } }} />);
    expect(screen.queryByText(/СДЭК/)).not.toBeInTheDocument();
  });

  it("способы оплаты и карты, которые принимаем", () => {
    render(<DeliveryPaymentDetails site={site()} />);
    const payment = screen.getByRole("region", { name: "Оплата" });
    expect(payment).toHaveTextContent("МИР");
    expect(payment).toHaveTextContent("Visa");
    expect(payment).toHaveTextContent("Mastercard");
    expect(payment).toHaveTextContent("СБП");
    expect(payment).not.toHaveTextContent("При получении");
  });

  it("онлайн-оплата ещё не подключена — так и написано", () => {
    render(<DeliveryPaymentDetails site={site({ online_payment_available: false, allow_pay_on_delivery: true })} />);
    const payment = screen.getByRole("region", { name: "Оплата" });
    expect(payment).toHaveTextContent("Онлайн-оплата подключается");
    expect(payment).toHaveTextContent("При получении");
  });
});
