import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { site } from "@/tests/fixtures";

import { Footer } from "./Footer";

describe("Footer — реквизиты и оплата на каждой странице", () => {
  it("название ИП, ИНН, ОГРНИП и адрес", () => {
    render(<Footer site={site()} />);
    const line = screen.getByText(/ИНН 330000000000/);
    expect(line).toHaveTextContent("ИП Булич Никита Сергеевич");
    expect(line).toHaveTextContent("ОГРНИП 300000000000000");
    expect(line).toHaveTextContent("г. Владимир");
  });

  it("какие карты принимаем", () => {
    render(<Footer site={site()} />);
    expect(screen.getByText(/Оплата: карты МИР, Visa, Mastercard и СБП/)).toBeInTheDocument();
  });

  it("пока онлайн-оплата не подключена — про карты не пишем", () => {
    render(<Footer site={site({ online_payment_available: false })} />);
    expect(screen.queryByText(/Оплата: карты/)).not.toBeInTheDocument();
  });
});
