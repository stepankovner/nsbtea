import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Schemas } from "@/lib/api/client";

import { DashboardView } from "./Dashboard";

const NBSP = " "; // testing-library сводит неразрывные пробелы в тексте к обычным

function data(overrides: Partial<Schemas["DashboardOut"]> = {}): Schemas["DashboardOut"] {
  return {
    attention: { new_orders: 2, assembling: 1, needs_attention: 1, awaiting_payment: 0 },
    new_orders: [
      { id: "o1", number: "NSB-10001", status: "paid", status_label: "Оплачен (новый)", name: "Аня", total_kop: 280_000, created_at: "2026-10-05T09:00:00Z" },
    ],
    revenue: { today_kop: 280_000, today_orders: 1, week_kop: 900_000, week_orders: 4, month_kop: 3_000_000, month_orders: 12 },
    low_stock: [{ product_id: "p1", name: "Бай Му Дань", stock_label: "30 г", level: "low", image_url: null }],
    thursdays: [
      { date: "2026-10-08", label: "8 октября", planned: false, products_count: 0 },
      { date: "2026-10-15", label: "15 октября", planned: true, products_count: 3 },
    ],
    new_applications: [{ id: "a1", name: "Кофейня", type_label: "Опт", created_at: "2026-10-05T08:00:00Z" }],
    new_applications_count: 1,
    launch_checklist: [
      { key: "telegram", title: "Подключите Telegram", hint: "Чтобы получать заказы", done: false, href: "/admin/profile" },
      { key: "products", title: "Добавьте товары на сайт", hint: "", done: true, href: "/admin/products/new" },
    ],
    ...overrides,
  };
}

describe("Сводка — первый экран админки", () => {
  it("что требует действия — крупными ссылками", () => {
    render(<DashboardView data={data()} userName="Никита" />);
    const attention = screen.getByRole("region", { name: "Требует действия" });
    expect(within(attention).getByRole("link", { name: /Новые заказы\s*2/ })).toHaveAttribute("href", "/admin/orders?status=paid");
    expect(within(attention).getByRole("link", { name: /Требуют внимания\s*1/ })).toHaveAttribute(
      "href",
      "/admin/orders?status=needs_attention",
    );
  });

  it("чек-лист запуска с отметками и ссылками", () => {
    render(<DashboardView data={data()} userName="Никита" />);
    const list = screen.getByRole("region", { name: /Подготовка к запуску/ });
    expect(within(list).getByRole("link", { name: /Подключите Telegram/ })).toHaveAttribute("href", "/admin/profile");
    expect(within(list).getByText("1 из 2")).toBeInTheDocument();
  });

  it("всё готово — чек-листа нет; выручку сотрудник не видит", () => {
    render(
      <DashboardView
        data={data({ launch_checklist: [{ key: "x", title: "Готово", hint: "", done: true, href: "/admin" }], revenue: null })}
        userName="Аня"
      />,
    );
    expect(screen.queryByRole("region", { name: /Подготовка к запуску/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Выручка/)).not.toBeInTheDocument();
  });

  it("выручка, малый остаток, четверги, заявки", () => {
    render(<DashboardView data={data()} userName="Никита" />);
    expect(screen.getByText(`2${NBSP}800 ₽`, { selector: "[data-testid=revenue-today]" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Бай Му Дань/ })).toHaveAttribute("href", "/admin/inventory?tab=reorder");
    expect(screen.getByText("8 октября").closest("li")).toHaveTextContent("не запланирован");
    expect(screen.getByRole("link", { name: /Кофейня/ })).toHaveAttribute("href", "/admin/applications/a1");
  });

  it("пустой магазин — подсказки вместо пустоты", () => {
    render(
      <DashboardView
        data={data({ new_orders: [], attention: { new_orders: 0, assembling: 0, needs_attention: 0, awaiting_payment: 0 }, low_stock: [], new_applications: [], new_applications_count: 0 })}
        userName="Никита"
      />,
    );
    expect(screen.getByText(/Как только кто-то оплатит — заказ появится здесь/)).toBeInTheDocument();
  });
});
