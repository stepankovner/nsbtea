import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { inventoryApi } from "@/lib/admin/inventory";
import { lookupProducts } from "@/lib/admin/lookup";
import { renderWithAdmin } from "@/tests/admin";

import { ALL_ROWS, draftOolong, lookupOf, movement, saleMovement } from "./fixtures";
import { ProductStock } from "./ProductStock";

const replace = vi.fn();
const push = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => search,
  usePathname: () => "/admin/inventory/p1",
}));
vi.mock("@/lib/admin/inventory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/inventory")>();
  return { ...actual, inventoryApi: { stock: vi.fn(), movements: vi.fn() } };
});
vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams();
  vi.mocked(inventoryApi.stock).mockResolvedValue({ items: ALL_ROWS });
  vi.mocked(inventoryApi.movements).mockResolvedValue({ items: [saleMovement, movement()], total: 2 });
  vi.mocked(lookupProducts).mockImplementation(async (params) =>
    ALL_ROWS.filter((r) => !params.ids || params.ids.includes(r.product_id)).map(lookupOf),
  );
});

describe("ProductStock — склад: один товар", () => {
  it("остаток, порог, статус и действия именно для этого товара", async () => {
    renderWithAdmin(<ProductStock id="p1" />);
    expect(await screen.findByRole("heading", { level: 1, name: /Да Хун Пао/ })).toBeInTheDocument();
    expect(screen.getByText("В наличии")).toBeInTheDocument();
    expect(screen.getByTestId("stock-now")).toHaveTextContent("150 г");
    expect(screen.getByTestId("stock-threshold")).toHaveTextContent("50 г");
    expect(screen.getByRole("link", { name: /Принять поставку/ })).toHaveAttribute("href", "/admin/inventory/supply?products=p1");
    expect(screen.getByRole("link", { name: /Пересчитать/ })).toHaveAttribute("href", "/admin/inventory/count?products=p1");
    expect(screen.getByRole("link", { name: /Списать/ })).toHaveAttribute("href", "/admin/inventory/writeoff?products=p1");
  });

  it("порог меняется в карточке товара — ссылка туда и подсказка с примером", async () => {
    renderWithAdmin(<ProductStock id="p1" />);
    expect(await screen.findByRole("link", { name: /карточке товара/ })).toHaveAttribute("href", "/admin/products/p1");
    await userEvent.click(screen.getByRole("button", { name: /Подсказка: Порог/ }));
    expect(await screen.findByText(/Например, 50 г/)).toBeInTheDocument();
  });

  it("сотруднику без раздела «Товары» ссылку на карточку не показываем", async () => {
    renderWithAdmin(<ProductStock id="p1" />, { owner: false, permissions: ["inventory"] });
    expect(await screen.findByRole("heading", { level: 1, name: /Да Хун Пао/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /карточке товара/ })).not.toBeInTheDocument();
    expect(screen.getByText(/владел/i)).toBeInTheDocument();
  });

  it("история движения по товару: поставки и продажи со ссылкой на заказ", async () => {
    renderWithAdmin(<ProductStock id="p1" />);
    expect(await screen.findByRole("link", { name: /NSB-10001/ })).toHaveAttribute("href", "/admin/orders/o1");
    expect(screen.getByText("+500 г")).toBeInTheDocument();
    expect(screen.getByText("−50 г")).toBeInTheDocument();
    expect(inventoryApi.movements).toHaveBeenCalledWith(expect.objectContaining({ product_id: "p1", page: 1 }));
  });

  it("черновик (из карточки товара, ещё не на сайте) — остаток и действия тоже есть", async () => {
    vi.mocked(lookupProducts).mockImplementation(async (params) =>
      [draftOolong].filter((p) => !params.ids || params.ids.includes(p.id)),
    );
    vi.mocked(inventoryApi.movements).mockResolvedValue({ items: [], total: 0 });
    renderWithAdmin(<ProductStock id="p9" />);
    expect(await screen.findByRole("heading", { level: 1, name: /Новый улун/ })).toBeInTheDocument();
    expect(screen.getByTestId("stock-now")).toHaveTextContent("40 г");
    expect(screen.getByText(/Черновик/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Принять поставку/ })).toHaveAttribute("href", "/admin/inventory/supply?products=p9");
    expect(lookupProducts).toHaveBeenCalledWith(expect.objectContaining({ ids: ["p9"] }));
  });

  it("товар убран в архив — объясняем и показываем его историю", async () => {
    vi.mocked(lookupProducts).mockResolvedValue([]);
    renderWithAdmin(<ProductStock id="gone" />);
    expect(await screen.findByRole("heading", { level: 1, name: /Товара нет на складе/ })).toBeInTheDocument();
    expect(inventoryApi.movements).toHaveBeenCalledWith(expect.objectContaining({ product_id: "gone" }));
  });

  it("движений нет — объясняем, что здесь появится", async () => {
    vi.mocked(inventoryApi.movements).mockResolvedValue({ items: [], total: 0 });
    renderWithAdmin(<ProductStock id="p1" />);
    expect(await screen.findByText(/Движений пока не было/)).toBeInTheDocument();
  });
});
