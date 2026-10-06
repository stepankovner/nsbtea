import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { adminSearch } from "@/lib/admin/search";

import { AdminSearch } from "./AdminSearch";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/admin/search", () => ({ adminSearch: vi.fn() }));

describe("AdminSearch — поиск по товарам, заказам и клиентам", () => {
  it("находит и открывает заказ", async () => {
    vi.mocked(adminSearch).mockResolvedValue({
      orders: [{ id: "o1", number: "NSB-10001", name: "Аня", status_label: "Оплачен", total_kop: 280_000 }],
      products: [{ id: "p1", name: "Да Хун Пао", status: "published", image_url: null }],
      customers: [{ id: "c1", name: "Аня", email: "anya@example.ru", phone: "+79001234567" }],
    });
    render(<AdminSearch />);
    await userEvent.click(screen.getByRole("button", { name: /Поиск/ }));
    await userEvent.type(screen.getByPlaceholderText(/Номер заказа, телефон/), "10001");
    expect(await screen.findByText("NSB-10001")).toBeInTheDocument();
    expect(screen.getByText("Да Хун Пао")).toBeInTheDocument();
    expect(screen.getByText("anya@example.ru")).toBeInTheDocument();
    await userEvent.click(screen.getByText("NSB-10001"));
    expect(push).toHaveBeenCalledWith("/admin/orders/o1");
  });

  it("ничего не нашлось — так и пишем", async () => {
    vi.mocked(adminSearch).mockResolvedValue({ orders: [], products: [], customers: [] });
    render(<AdminSearch />);
    await userEvent.click(screen.getByRole("button", { name: /Поиск/ }));
    await userEvent.type(screen.getByPlaceholderText(/Номер заказа, телефон/), "зззз");
    expect(await screen.findByText("Ничего не нашлось")).toBeInTheDocument();
  });
});
