import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { categoriesApi } from "@/lib/admin/categories";
import { productsApi } from "@/lib/admin/products";
import { ApiError } from "@/lib/api/errors";
import { renderWithAdmin } from "@/tests/admin";

import { categoriesTree, listItem } from "./fixtures";
import { ProductsList } from "./ProductsList";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => "/admin/products",
}));
vi.mock("@/lib/admin/products", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/products")>();
  return {
    ...actual,
    productsApi: { list: vi.fn(), patch: vi.fn(), publish: vi.fn(), hide: vi.fn(), restore: vi.fn() },
  };
});
vi.mock("@/lib/admin/categories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/categories")>();
  return { ...actual, categoriesApi: { list: vi.fn() } };
});

const tea = listItem();
const draft = listItem({
  id: "p2",
  name: "Бай Му Дань",
  status: "draft",
  status_label: "Черновик",
  price_label: "Цена не указана",
  price_per_gram_kop: null,
  stock: 0,
  stock_label: "0 г",
  stock_level: "out",
  image_url: null,
});
const cup = listItem({
  id: "p5",
  name: "Гайвань белая",
  type: "unit",
  category_name: "Посуда",
  price_label: "2 500 ₽",
  price_per_gram_kop: null,
  unit_price_kop: 250_000,
  stock: 6,
  stock_label: "6 шт.",
});

function page(items = [tea], counts: Record<string, number> = { published: 1, hidden: 0, draft: 0, archived: 0 }) {
  return { items, total: items.length, page: 1, per_page: 30, counts };
}

async function rowOf(name: string) {
  const link = await screen.findByRole("link", { name: new RegExp(name) });
  return link.closest("li") as HTMLElement;
}

beforeEach(() => {
  search = new URLSearchParams();
  replace.mockReset();
  vi.mocked(categoriesApi.list).mockResolvedValue(categoriesTree);
});

describe("ProductsList — список товаров", () => {
  it("строка: название ведёт в карточку, видны цена, остаток и статус текстом", async () => {
    vi.mocked(productsApi.list).mockResolvedValue(page([tea, draft]));
    renderWithAdmin(<ProductsList />);
    const row = await rowOf("Да Хун Пао");
    expect(within(row).getByRole("link", { name: /Да Хун Пао/ })).toHaveAttribute("href", "/admin/products/p1");
    expect(within(row).getByText("12 ₽/г · 25 г — 300 ₽")).toBeInTheDocument();
    expect(within(row).getByText("Остаток: 600 г")).toBeInTheDocument();
    expect(within(row).getByText("На сайте")).toBeInTheDocument();
    expect(within(await rowOf("Бай Му Дань")).getByText("Черновик")).toBeInTheDocument();
  });

  it("главная кнопка «Добавить товар» и ссылка на категории", async () => {
    vi.mocked(productsApi.list).mockResolvedValue(page());
    renderWithAdmin(<ProductsList />);
    expect(await screen.findByRole("link", { name: "Добавить товар" })).toHaveAttribute("href", "/admin/products/new");
    expect(screen.getByRole("link", { name: /Категории/ })).toHaveAttribute("href", "/admin/products/categories");
  });

  it("вкладки по статусу; архив запрашивается отдельно", async () => {
    vi.mocked(productsApi.list).mockResolvedValue(page());
    const { unmount } = renderWithAdmin(<ProductsList />);
    const tabs = await screen.findByRole("navigation", { name: "Статус товаров" });
    expect(within(tabs).getByRole("link", { name: /^Черновики/ })).toHaveAttribute("href", "/admin/products?status=draft");
    expect(within(tabs).getByRole("link", { name: /^Скрытые/ })).toHaveAttribute("href", "/admin/products?status=hidden");
    expect(within(tabs).getByRole("link", { name: /^Архив/ })).toHaveAttribute("href", "/admin/products?status=archived");
    unmount();

    search = new URLSearchParams("status=draft");
    renderWithAdmin(<ProductsList />);
    await waitFor(() => expect(productsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: "draft" })));
  });

  it("на вкладках — сколько товаров в каждом статусе, как в «Заказах»", async () => {
    vi.mocked(productsApi.list).mockResolvedValue(page([tea], { published: 2, hidden: 1, draft: 3, archived: 4 }));
    renderWithAdmin(<ProductsList />);
    const tabs = await screen.findByRole("navigation", { name: "Статус товаров" });
    // «Все» — всё, кроме архива
    expect(await within(tabs).findByRole("link", { name: /^Все\s*6$/ })).toHaveAttribute("href", "/admin/products");
    expect(within(tabs).getByRole("link", { name: /^На сайте\s*2$/ })).toHaveAttribute("href", "/admin/products?status=published");
    expect(within(tabs).getByRole("link", { name: /^Скрытые\s*1$/ })).toBeInTheDocument();
    expect(within(tabs).getByRole("link", { name: /^Черновики\s*3$/ })).toBeInTheDocument();
    expect(within(tabs).getByRole("link", { name: /^Архив\s*4$/ })).toBeInTheDocument();
  });

  it("в архиве — кнопка «Восстановить» вместо переключателя", async () => {
    search = new URLSearchParams("status=archived");
    vi.mocked(productsApi.list).mockResolvedValue(
      page([listItem({ status: "hidden", status_label: "В архиве", archived_at: "2026-10-06T10:00:00Z" })]),
    );
    vi.mocked(productsApi.restore).mockResolvedValue({} as never);
    renderWithAdmin(<ProductsList />);
    const row = await rowOf("Да Хун Пао");
    expect(productsApi.list).toHaveBeenCalledWith(expect.objectContaining({ archived: true }));
    expect(productsApi.list).not.toHaveBeenCalledWith(expect.objectContaining({ status: "archived" }));
    expect(within(row).queryByRole("switch")).not.toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: "Восстановить: Да Хун Пао" }));
    expect(productsApi.restore).toHaveBeenCalledWith("p1");
  });

  it("поиск и фильтр по категории меняют адрес страницы", async () => {
    vi.mocked(productsApi.list).mockResolvedValue(page());
    renderWithAdmin(<ProductsList />);
    await userEvent.type(await screen.findByRole("searchbox", { name: "Поиск товаров" }), "pao{Enter}");
    expect(replace).toHaveBeenCalledWith("/admin/products?q=pao");
    const select = screen.getByRole("combobox", { name: "Категория" });
    await screen.findByRole("option", { name: /Шу пуэр/ });
    await userEvent.selectOptions(select, "c11");
    expect(replace).toHaveBeenCalledWith("/admin/products?category=c11");
  });

  it("фильтры из адреса уходят в запрос", async () => {
    search = new URLSearchParams("category=c11&q=pao&stock=low");
    vi.mocked(productsApi.list).mockResolvedValue(page([]));
    renderWithAdmin(<ProductsList />);
    await screen.findByText("Ничего не нашлось");
    expect(productsApi.list).toHaveBeenCalledWith(expect.objectContaining({ category_id: "c11", q: "pao", stock: "low" }));
  });

  it("пусто — объясняем, с чего начать", async () => {
    vi.mocked(productsApi.list).mockResolvedValue(page([]));
    renderWithAdmin(<ProductsList />);
    expect(await screen.findByText("Пока нет товаров")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Добавить первый товар" })).toHaveAttribute("href", "/admin/products/new");
  });

  it("быстрая цена чая: вводится за 50 г в рублях, уходит в копейках", async () => {
    vi.mocked(productsApi.list).mockResolvedValue(page());
    vi.mocked(productsApi.patch).mockResolvedValue({} as never);
    renderWithAdmin(<ProductsList />);
    await userEvent.click(within(await rowOf("Да Хун Пао")).getByRole("button", { name: "Изменить цену: Да Хун Пао" }));
    const dialog = await screen.findByRole("dialog");
    const field = within(dialog).getByLabelText("Цена за 50 г");
    expect(field).toHaveValue("600");
    await userEvent.clear(field);
    await userEvent.type(field, "700");
    await userEvent.tab();
    expect(within(dialog).getByText(/14 ₽ за 1 г/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить цену" }));
    expect(productsApi.patch).toHaveBeenCalledWith("p1", { price: { amount_kop: 70_000, per_grams: 50 } });
  });

  it("быстрая цена чая: можно указать за 100 г", async () => {
    vi.mocked(productsApi.list).mockResolvedValue(page());
    vi.mocked(productsApi.patch).mockResolvedValue({} as never);
    renderWithAdmin(<ProductsList />);
    await userEvent.click(within(await rowOf("Да Хун Пао")).getByRole("button", { name: "Изменить цену: Да Хун Пао" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: "100 г" }));
    expect(within(dialog).getByLabelText("Цена за 100 г")).toHaveValue("1200");
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить цену" }));
    expect(productsApi.patch).toHaveBeenCalledWith("p1", { price: { amount_kop: 120_000, per_grams: 100 } });
  });

  it("быстрая цена штучного товара — за штуку", async () => {
    vi.mocked(productsApi.list).mockResolvedValue(page([cup]));
    vi.mocked(productsApi.patch).mockResolvedValue({} as never);
    renderWithAdmin(<ProductsList />);
    await userEvent.click(within(await rowOf("Гайвань белая")).getByRole("button", { name: "Изменить цену: Гайвань белая" }));
    const dialog = await screen.findByRole("dialog");
    const field = within(dialog).getByLabelText("Цена за штуку");
    await userEvent.clear(field);
    await userEvent.type(field, "2700");
    await userEvent.tab();
    await userEvent.click(within(dialog).getByRole("button", { name: "Сохранить цену" }));
    expect(productsApi.patch).toHaveBeenCalledWith("p5", { unit_price_kop: 270_000 });
  });

  it("скрыть с сайта прямо из списка", async () => {
    vi.mocked(productsApi.list).mockResolvedValue(page());
    vi.mocked(productsApi.hide).mockResolvedValue({} as never);
    renderWithAdmin(<ProductsList />);
    const toggle = within(await rowOf("Да Хун Пао")).getByRole("switch", { name: "На сайте: Да Хун Пао" });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(productsApi.hide).toHaveBeenCalledWith("p1");
  });

  it("показать на сайте: если сервер отказал — его текст и ссылка, где заполнить", async () => {
    vi.mocked(productsApi.list).mockResolvedValue(page([draft]));
    vi.mocked(productsApi.publish).mockRejectedValue(
      new ApiError(400, "Чтобы показать товар на сайте, заполните: цену", "domain_error"),
    );
    renderWithAdmin(<ProductsList />);
    const row = await rowOf("Бай Му Дань");
    const toggle = within(row).getByRole("switch", { name: "На сайте: Бай Му Дань" });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(productsApi.publish).toHaveBeenCalledWith("p2");
    const alert = await within(row).findByRole("alert");
    expect(alert).toHaveTextContent("Чтобы показать товар на сайте, заполните: цену");
    expect(within(alert).getByRole("link", { name: "Заполнить" })).toHaveAttribute("href", "/admin/products/p2");
  });
});
