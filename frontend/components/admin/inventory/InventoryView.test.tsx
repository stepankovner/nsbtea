import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { inventoryApi } from "@/lib/admin/inventory";
import { lookupProducts } from "@/lib/admin/lookup";
import { renderWithAdmin } from "@/tests/admin";

import { ALL_ROWS, baiMuDan, gaiwan, lookupOf, movement, saleMovement, supplyLines } from "./fixtures";
import { InventoryView } from "./InventoryView";

const replace = vi.fn();
const push = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => search,
  usePathname: () => "/admin/inventory",
}));
vi.mock("@/lib/admin/inventory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/inventory")>();
  return { ...actual, inventoryApi: { stock: vi.fn(), reorder: vi.fn(), supplies: vi.fn(), movements: vi.fn() } };
});
vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams();
  vi.mocked(inventoryApi.stock).mockResolvedValue({ items: ALL_ROWS });
  vi.mocked(inventoryApi.reorder).mockResolvedValue({ items: [gaiwan, baiMuDan] });
  vi.mocked(inventoryApi.supplies).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(inventoryApi.movements).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(lookupProducts).mockImplementation(async (params) =>
    ALL_ROWS.filter((r) => !params.ids || params.ids.includes(r.product_id)).map(lookupOf),
  );
});

describe("InventoryView — склад", () => {
  it("главные действия: принять поставку, инвентаризация, списание", async () => {
    renderWithAdmin(<InventoryView />);
    expect(screen.getByRole("heading", { level: 1, name: "Склад" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Принять поставку/ })).toHaveAttribute("href", "/admin/inventory/supply");
    expect(screen.getByRole("link", { name: /Инвентаризация/ })).toHaveAttribute("href", "/admin/inventory/count");
    expect(screen.getByRole("link", { name: /Списание/ })).toHaveAttribute("href", "/admin/inventory/writeoff");
    await screen.findByRole("link", { name: /Да Хун Пао/ });
  });

  it("вкладки; у «Нужно дозаказать» — сколько товаров", async () => {
    renderWithAdmin(<InventoryView />);
    const tabs = screen.getByRole("navigation", { name: "Разделы склада" });
    expect(within(tabs).getByRole("link", { name: /Остатки/ })).toHaveAttribute("aria-current", "page");
    expect(await within(tabs).findByRole("link", { name: /Нужно дозаказать\s*2/ })).toHaveAttribute("href", "/admin/inventory?tab=reorder");
    expect(within(tabs).getByRole("link", { name: /Поставки/ })).toHaveAttribute("href", "/admin/inventory?tab=supplies");
    expect(within(tabs).getByRole("link", { name: /История/ })).toHaveAttribute("href", "/admin/inventory?tab=history");
  });

  it("остатки: товар, остаток, порог, статус, последняя поставка; строка ведёт в историю товара", async () => {
    renderWithAdmin(<InventoryView />);
    const row = await screen.findByRole("link", { name: /Да Хун Пао/ });
    expect(row).toHaveAttribute("href", "/admin/inventory/p1");
    expect(within(row).getByText("150 г")).toBeInTheDocument();
    expect(within(row).getByText("50 г")).toBeInTheDocument();
    expect(within(row).getByText("В наличии")).toBeInTheDocument();
    expect(within(row).getByText(/5 октября 2026/)).toBeInTheDocument();

    const low = screen.getByRole("link", { name: /Бай Му Дань/ });
    expect(within(low).getByText("Осталось мало")).toBeInTheDocument();
    expect(within(low).getByText(/не было/)).toBeInTheDocument();

    const out = screen.getByRole("link", { name: /Гайвань/ });
    expect(within(out).getByText("Нет в наличии")).toBeInTheDocument();
    expect(within(out).getByText("0 шт.")).toBeInTheDocument();
  });

  it("у порога — подсказка с примером", async () => {
    renderWithAdmin(<InventoryView />);
    await screen.findByRole("link", { name: /Да Хун Пао/ });
    await userEvent.click(screen.getByRole("button", { name: /Подсказка: Порог/ }));
    expect(await screen.findByText(/попадёт в «Нужно дозаказать»/)).toBeInTheDocument();
  });

  it("поиск по названию меняет адрес страницы", async () => {
    renderWithAdmin(<InventoryView />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Поиск по складу" }), "хун{Enter}");
    expect(replace).toHaveBeenCalled();
    expect(decodeURIComponent(replace.mock.calls[0]![0] as string)).toBe("/admin/inventory?q=хун");
  });

  it("текст поиска из адреса уходит в запрос", async () => {
    search = new URLSearchParams("q=хун");
    vi.mocked(inventoryApi.stock).mockResolvedValue({ items: [] });
    renderWithAdmin(<InventoryView />);
    expect(await screen.findByText(/Ничего не нашлось/)).toBeInTheDocument();
    expect(inventoryApi.stock).toHaveBeenCalledWith(expect.objectContaining({ q: "хун" }));
  });

  it("склад пуст — подсказываем, с чего начать", async () => {
    vi.mocked(inventoryApi.stock).mockResolvedValue({ items: [] });
    renderWithAdmin(<InventoryView />);
    expect(await screen.findByText(/На складе пока ничего нет/)).toBeInTheDocument();
  });

  it("?tab=reorder — «Нужно дозаказать»: отметить пришедшие и принять поставку", async () => {
    search = new URLSearchParams("tab=reorder");
    renderWithAdmin(<InventoryView />);
    const tabs = screen.getByRole("navigation", { name: "Разделы склада" });
    expect(within(tabs).getByRole("link", { name: /Нужно дозаказать/ })).toHaveAttribute("aria-current", "page");

    const tea = await screen.findByRole("checkbox", { name: "Выбрать: Бай Му Дань" });
    expect(screen.getByText("Нет в наличии")).toBeInTheDocument();
    const go = screen.getByRole("button", { name: /Принять поставку/ });
    expect(go).toBeDisabled();

    await userEvent.click(tea);
    await userEvent.click(screen.getByRole("checkbox", { name: "Выбрать: Гайвань" }));
    expect(go).toBeEnabled();
    await userEvent.click(go);
    expect(push).toHaveBeenCalledWith("/admin/inventory/supply?products=p3,p2");
  });

  it("«Нужно дозаказать»: выбрать все разом", async () => {
    search = new URLSearchParams("tab=reorder");
    renderWithAdmin(<InventoryView />);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Выбрать все" }));
    expect(screen.getByRole("checkbox", { name: "Выбрать: Гайвань" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: /Принять поставку/ }));
    expect(push).toHaveBeenCalledWith("/admin/inventory/supply?products=p3,p2");
  });

  it("дозаказывать нечего — объясняем, когда товар здесь появится", async () => {
    search = new URLSearchParams("tab=reorder");
    vi.mocked(inventoryApi.reorder).mockResolvedValue({ items: [] });
    renderWithAdmin(<InventoryView />);
    expect(await screen.findByText(/Всего хватает/)).toBeInTheDocument();
  });

  it("поставки — дата, комментарий, сколько товаров и кто провёл", async () => {
    search = new URLSearchParams("tab=supplies");
    vi.mocked(inventoryApi.supplies).mockResolvedValue({
      items: [{ id: "s1", comment: "Поставщик Ли", posted_at: "2026-10-05T09:00:00Z", actor_name: "Никита", lines_count: 3 }],
      total: 1,
    });
    renderWithAdmin(<InventoryView />);
    expect(await screen.findByText("Поставщик Ли")).toBeInTheDocument();
    expect(screen.getByText(/5 октября 2026, 12:00/)).toBeInTheDocument();
    expect(screen.getByText(/3 товара/)).toBeInTheDocument();
    expect(screen.getByText(/Никита/)).toBeInTheDocument();
  });

  it("поставку можно раскрыть: что пришло, сколько и какой стал остаток", async () => {
    search = new URLSearchParams("tab=supplies");
    vi.mocked(inventoryApi.supplies).mockResolvedValue({
      items: [{ id: "s1", comment: "Поставщик Ли", posted_at: "2026-10-05T09:00:00Z", actor_name: "Никита", lines_count: 2 }],
      total: 1,
    });
    vi.mocked(inventoryApi.movements).mockImplementation(async (query) =>
      query.supply_id === "s1" ? { items: supplyLines, total: 2 } : { items: [], total: 0 },
    );
    renderWithAdmin(<InventoryView />);

    const toggle = await screen.findByRole("button", { name: /Поставщик Ли/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(inventoryApi.movements).not.toHaveBeenCalled();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const lines = await screen.findByRole("list", { name: /Что пришло/ });
    expect(inventoryApi.movements).toHaveBeenCalledWith(expect.objectContaining({ supply_id: "s1" }));
    expect(within(lines).getByRole("link", { name: "Да Хун Пао" })).toHaveAttribute("href", "/admin/inventory/p1");
    expect(within(lines).getByText("+500 г")).toBeInTheDocument();
    expect(within(lines).getByText(/остаток стал 650 г/)).toBeInTheDocument();
    expect(within(lines).getByRole("link", { name: "Гайвань" })).toHaveAttribute("href", "/admin/inventory/p3");
    expect(within(lines).getByText("+4 шт.")).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.queryByRole("list", { name: /Что пришло/ })).not.toBeInTheDocument();
  });

  it("поставок не было — подсказка", async () => {
    search = new URLSearchParams("tab=supplies");
    renderWithAdmin(<InventoryView />);
    expect(await screen.findByText(/Поставок пока не было/)).toBeInTheDocument();
  });

  it("история: поставки и продажи, продажа ведёт в заказ", async () => {
    search = new URLSearchParams("tab=history");
    vi.mocked(inventoryApi.movements).mockResolvedValue({ items: [saleMovement, movement()], total: 2 });
    renderWithAdmin(<InventoryView />);
    expect(await screen.findByRole("link", { name: /NSB-10001/ })).toHaveAttribute("href", "/admin/orders/o1");
    expect(screen.getByText("Продажа")).toBeInTheDocument();
    expect(screen.getByText("Поставка")).toBeInTheDocument();
    expect(screen.getByText("−50 г")).toBeInTheDocument();
    expect(screen.getByText("+500 г")).toBeInTheDocument();
    expect(screen.getByText("Поставщик Ли")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Да Хун Пао" })[0]).toHaveAttribute("href", "/admin/inventory/p1");
    expect(inventoryApi.movements).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });

  it("история: фильтр по товару — выбрать и убрать", async () => {
    search = new URLSearchParams("tab=history");
    renderWithAdmin(<InventoryView />);
    await userEvent.click(await screen.findByRole("button", { name: "Добавить товар" }));
    await userEvent.click(await screen.findByRole("option", { name: /Да Хун Пао/ }));
    expect(replace).toHaveBeenCalledWith("/admin/inventory?tab=history&product=p1");
  });

  it("история: товар из адреса уходит в запрос, фильтр можно убрать", async () => {
    search = new URLSearchParams("tab=history&product=p1");
    renderWithAdmin(<InventoryView />);
    await userEvent.click(await screen.findByRole("button", { name: "Убрать: Да Хун Пао" }));
    expect(inventoryApi.movements).toHaveBeenCalledWith(expect.objectContaining({ product_id: "p1" }));
    expect(replace).toHaveBeenCalledWith("/admin/inventory?tab=history");
  });

  it("сотрудник без доступа к заказам видит номер заказа без ссылки", async () => {
    search = new URLSearchParams("tab=history");
    vi.mocked(inventoryApi.movements).mockResolvedValue({ items: [saleMovement], total: 1 });
    renderWithAdmin(<InventoryView />, { owner: false, permissions: ["inventory"] });
    expect(await screen.findByText(/NSB-10001/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /NSB-10001/ })).not.toBeInTheDocument();
  });

  it("истории пока нет — объясняем, что здесь будет", async () => {
    search = new URLSearchParams("tab=history");
    renderWithAdmin(<InventoryView />);
    expect(await screen.findByText(/Движений пока не было/)).toBeInTheDocument();
  });
});
