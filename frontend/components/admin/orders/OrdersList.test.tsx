import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ordersApi } from "@/lib/admin/orders";
import { renderWithAdmin } from "@/tests/admin";

import { OrdersList } from "./OrdersList";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => "/admin/orders",
}));
vi.mock("@/lib/admin/orders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/orders")>();
  return { ...actual, ordersApi: { list: vi.fn() } };
});

const listItem = {
  id: "o1",
  number: "NSB-10001",
  status: "paid",
  status_label: "Оплачен (новый)",
  created_at: "2026-10-05T09:00:00Z",
  name: "Аня",
  phone: "+79001234567",
  total_kop: 315_000,
  refunded_kop: 0,
  delivery_method: "cdek_pvz",
  delivery_label: "СДЭК — пункт выдачи",
  payment_method: "online",
  items_summary: "Да Хун Пао, 50 г × 2",
  needs_action: true,
};

function page(items = [listItem]) {
  return {
    items,
    total: items.length,
    page: 1,
    per_page: 30,
    counts: { active: 1, paid: 1, assembling: 0, shipped: 0, needs_attention: 0, awaiting_payment: 0, completed: 0, cancelled: 0 },
    statuses: [
      { value: "paid", label: "Новые" },
      { value: "assembling", label: "Собираются" },
    ],
  };
}

describe("OrdersList — список заказов", () => {
  it("строки заказов ведут в карточку; вкладки статусов с количеством", async () => {
    search = new URLSearchParams();
    vi.mocked(ordersApi.list).mockResolvedValue(page());
    renderWithAdmin(<OrdersList />);
    const row = await screen.findByRole("link", { name: /NSB-10001/ });
    expect(row).toHaveAttribute("href", "/admin/orders/o1");
    expect(within(row).getByText("Да Хун Пао, 50 г × 2")).toBeInTheDocument();
    expect(within(row).getByText("Оплачен (новый)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Новые\s*1/ })).toHaveAttribute("href", "/admin/orders?status=paid");
  });

  it("поиск по номеру или телефону меняет адрес страницы", async () => {
    search = new URLSearchParams();
    vi.mocked(ordersApi.list).mockResolvedValue(page());
    renderWithAdmin(<OrdersList />);
    await userEvent.type(await screen.findByRole("searchbox", { name: "Поиск заказов" }), "9001234567{Enter}");
    expect(replace).toHaveBeenCalledWith("/admin/orders?q=9001234567");
  });

  it("пусто — объясняем, что будет", async () => {
    search = new URLSearchParams();
    vi.mocked(ordersApi.list).mockResolvedValue(page([]));
    renderWithAdmin(<OrdersList />);
    expect(await screen.findByText(/Пока нет заказов/)).toBeInTheDocument();
  });

  it("фильтр из адреса уходит в запрос", async () => {
    search = new URLSearchParams("status=needs_attention");
    vi.mocked(ordersApi.list).mockResolvedValue(page([]));
    renderWithAdmin(<OrdersList />);
    await screen.findByText(/Ничего не нашлось|Пока нет заказов/);
    expect(ordersApi.list).toHaveBeenCalledWith(expect.objectContaining({ status: "needs_attention" }));
  });
});
