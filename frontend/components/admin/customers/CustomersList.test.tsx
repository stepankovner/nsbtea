import { configure, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { customersApi } from "@/lib/admin/customers";
import { renderWithAdmin } from "@/tests/admin";

import { CustomersList } from "./CustomersList";
import { customerRow } from "./fixtures";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => "/admin/customers",
}));
vi.mock("@/lib/admin/customers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/customers")>();
  return { ...actual, customersApi: { list: vi.fn() } };
});

// Формы с поиском товаров под нагрузкой (весь набор тестов идёт параллельно) отвечают дольше
// обычной секунды — даём запас, чтобы тесты не падали случайно.
configure({ asyncUtilTimeout: 3_000 });
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams();
});

describe("CustomersList — список клиентов", () => {
  it("строка: имя, контакты, заказов, сумма покупок, баллы — ведёт в карточку", async () => {
    vi.mocked(customersApi.list).mockResolvedValue({ items: [customerRow()], total: 1 });
    renderWithAdmin(<CustomersList />);
    const row = await screen.findByRole("link", { name: /Анна Смирнова/ });
    expect(row).toHaveAttribute("href", "/admin/customers/c1");
    expect(within(row).getByText(/\+7 900 123-45-67/)).toBeInTheDocument();
    expect(within(row).getByText(/anya@example\.ru/)).toBeInTheDocument();
    expect(within(row).getByText("3 заказа")).toBeInTheDocument();
    expect(within(row).getByText(/12\s600\s₽/)).toBeInTheDocument();
    expect(within(row).getByText("120 баллов")).toBeInTheDocument();
  });

  it("без имени — показываем почту или телефон", async () => {
    vi.mocked(customersApi.list).mockResolvedValue({
      items: [customerRow({ id: "c2", name: null, orders_count: 1, points_balance: 1 })],
      total: 1,
    });
    renderWithAdmin(<CustomersList />);
    const row = await screen.findByRole("link", { name: /anya@example\.ru/ });
    expect(row).toHaveAttribute("href", "/admin/customers/c2");
    expect(within(row).getByText("1 заказ")).toBeInTheDocument();
    expect(within(row).getByText("1 балл")).toBeInTheDocument();
  });

  it("поиск по имени, телефону или почте меняет адрес страницы", async () => {
    vi.mocked(customersApi.list).mockResolvedValue({ items: [customerRow()], total: 1 });
    renderWithAdmin(<CustomersList />);
    await userEvent.type(await screen.findByRole("searchbox", { name: "Поиск клиентов" }), "9001234567{Enter}");
    expect(replace).toHaveBeenCalledWith("/admin/customers?q=9001234567");
  });

  it("поиск из адреса уходит в запрос", async () => {
    search = new URLSearchParams("q=anya");
    vi.mocked(customersApi.list).mockResolvedValue({ items: [customerRow()], total: 1 });
    renderWithAdmin(<CustomersList />);
    expect(await screen.findByRole("link", { name: /Анна Смирнова/ })).toBeInTheDocument();
    expect(customersApi.list).toHaveBeenCalledWith({ q: "anya", page: 1, per_page: 30 });
    expect(screen.getByRole("searchbox", { name: "Поиск клиентов" })).toHaveValue("anya");
  });

  it("пусто — объясняем, откуда появятся клиенты", async () => {
    vi.mocked(customersApi.list).mockResolvedValue({ items: [], total: 0 });
    renderWithAdmin(<CustomersList />);
    expect(await screen.findByText("Пока нет клиентов")).toBeInTheDocument();
  });

  it("ничего не нашлось — подсказываем, как искать", async () => {
    search = new URLSearchParams("q=zzz");
    vi.mocked(customersApi.list).mockResolvedValue({ items: [], total: 0 });
    renderWithAdmin(<CustomersList />);
    expect(await screen.findByText("Никого не нашли")).toBeInTheDocument();
  });

  it("много клиентов — постранично", async () => {
    search = new URLSearchParams("page=2");
    vi.mocked(customersApi.list).mockResolvedValue({ items: [customerRow()], total: 75 });
    renderWithAdmin(<CustomersList />);
    expect(await screen.findByText("Страница 2 из 3")).toBeInTheDocument();
    expect(customersApi.list).toHaveBeenCalledWith({ q: undefined, page: 2, per_page: 30 });
    expect(screen.getByRole("link", { name: "Дальше" })).toHaveAttribute("href", "/admin/customers?page=3");
  });

  it("без права «Клиенты» экран закрыт", () => {
    vi.mocked(customersApi.list).mockResolvedValue({ items: [], total: 0 });
    renderWithAdmin(<CustomersList />, { owner: false, permissions: ["orders"] });
    expect(screen.getByText(/Нет доступа/)).toBeInTheDocument();
    expect(customersApi.list).not.toHaveBeenCalled();
  });
});
