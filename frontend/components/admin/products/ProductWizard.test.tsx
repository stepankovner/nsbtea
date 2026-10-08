import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { categoriesApi } from "@/lib/admin/categories";
import { lookupProducts } from "@/lib/admin/lookup";
import { productsApi } from "@/lib/admin/products";
import { ApiError } from "@/lib/api/errors";
import { renderWithAdmin } from "@/tests/admin";

import { adminProduct, categoriesTree, draftTea, unitProduct } from "./fixtures";
import { ProductWizard } from "./ProductWizard";

const replace = vi.fn();
const push = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => search,
  usePathname: () => "/admin/products/p1/edit",
}));
vi.mock("@/lib/admin/products", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/products")>();
  return {
    ...actual,
    productsApi: {
      get: vi.fn(),
      patch: vi.fn(),
      publish: vi.fn(),
      setRelations: vi.fn(),
      tags: vi.fn(),
      weightPresets: vi.fn(),
      uploadImages: vi.fn(),
      reorderImages: vi.fn(),
      updateImageAlt: vi.fn(),
      deleteImage: vi.fn(),
    },
  };
});
vi.mock("@/lib/admin/categories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/categories")>();
  return { ...actual, categoriesApi: { list: vi.fn() } };
});
vi.mock("@/lib/admin/lookup", () => ({ lookupProducts: vi.fn() }));

const gaiwan = { id: "p9", slug: "gaivan", name: "Гайвань", type: "unit", status: "published", image_url: null, stock_label: "6 шт." };

function at(step: number) {
  search = new URLSearchParams(`step=${step}`);
}

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
  vi.mocked(categoriesApi.list).mockResolvedValue(categoriesTree);
  vi.mocked(productsApi.tags).mockResolvedValue([]);
  vi.mocked(productsApi.weightPresets).mockResolvedValue([25, 50, 100, 200]);
  vi.mocked(lookupProducts).mockImplementation(async (params) => (params.ids ? [] : [gaiwan]));
});

describe("ProductWizard — пошаговое заполнение черновика", () => {
  it("индикатор «Шаг N из 7»: к пройденным шагам можно вернуться, вперёд не перескочить", async () => {
    at(3);
    vi.mocked(productsApi.get).mockResolvedValue(draftTea());
    renderWithAdmin(<ProductWizard id="p1" />);
    expect(await screen.findByText("Шаг 3 из 7")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Фото" })).toBeInTheDocument();
    const steps = screen.getByRole("navigation", { name: "Шаги" });
    expect(within(steps).getByRole("button", { name: "Шаг 5: Характеристики и заварка" })).toBeDisabled();
    await userEvent.click(within(steps).getByRole("button", { name: "Шаг 1: Тип и категория" }));
    expect(screen.getByText("Шаг 1 из 7")).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/admin/products/p1/edit?step=1");
    // вернулись — и снова можно вперёд до шага 3
    expect(within(steps).getByRole("button", { name: "Шаг 3: Фото" })).toBeEnabled();
  });

  it("«Далее» сохраняет изменения и открывает следующий шаг; «Назад» — предыдущий", async () => {
    at(2);
    vi.mocked(productsApi.get).mockResolvedValue(draftTea());
    vi.mocked(productsApi.patch).mockResolvedValue(draftTea({ short_description: "Тёмный улун" }));
    renderWithAdmin(<ProductWizard id="p1" />);
    await userEvent.type(await screen.findByRole("textbox", { name: "Коротко о товаре" }), "Тёмный улун");
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(productsApi.patch).toHaveBeenCalledWith("p1", { short_description: "Тёмный улун" });
    expect(await screen.findByText("Шаг 3 из 7")).toBeInTheDocument();
    expect(replace).toHaveBeenLastCalledWith("/admin/products/p1/edit?step=3");
    await userEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(screen.getByText("Шаг 2 из 7")).toBeInTheDocument();
  });

  it("черновик сохраняется сам, без кнопки", async () => {
    at(2);
    vi.mocked(productsApi.get).mockResolvedValue(draftTea());
    vi.mocked(productsApi.patch).mockResolvedValue(draftTea({ short_description: "Тёмный улун" }));
    renderWithAdmin(<ProductWizard id="p1" autosaveDelay={20} />);
    await userEvent.type(await screen.findByRole("textbox", { name: "Коротко о товаре" }), "Тёмный улун");
    await waitFor(() => expect(productsApi.patch).toHaveBeenLastCalledWith("p1", { short_description: "Тёмный улун" }));
    expect(await screen.findByText("Черновик сохранён")).toBeInTheDocument();
  });

  it("шаг 4 у чая: цена за 50 г и граммовки — сразу видно, сколько стоит каждая", async () => {
    at(4);
    vi.mocked(productsApi.get).mockResolvedValue(draftTea());
    vi.mocked(productsApi.patch).mockResolvedValue(draftTea());
    renderWithAdmin(<ProductWizard id="p1" />);
    expect(await screen.findByRole("heading", { name: "Цена и граммовки" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Цена за 50 г"), "600");
    await userEvent.tab();
    expect(screen.getByText(/12 ₽ за 1 г/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /^25\s*г\s*—\s*300\s*₽/ })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: /^200\s*г/ }));
    await userEvent.click(screen.getByRole("button", { name: "Подсказка: Граммовки" }));
    expect(await screen.findByText(/например 25, 50, 100 г/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(productsApi.patch).toHaveBeenCalledWith("p1", {
      price: { amount_kop: 60_000, per_grams: 50 },
      weight_presets: [25, 50, 100],
    });
  });

  it("шаг 4: свой вес — минимум должен делиться на шаг, подсказываем до отправки", async () => {
    at(4);
    vi.mocked(productsApi.get).mockResolvedValue(draftTea({ price_per_gram_kop: 1200 }));
    renderWithAdmin(<ProductWizard id="p1" />);
    await userEvent.click(await screen.findByRole("switch", { name: "Покупатель может ввести свой вес" }));
    const min = screen.getByRole("textbox", { name: "Минимум, г" });
    expect(min).toHaveValue("10");
    await userEvent.clear(min);
    await userEvent.type(min, "12");
    expect(screen.getByText(/делиться на шаг/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(productsApi.patch).not.toHaveBeenCalled();
    expect(screen.getByText("Шаг 4 из 7")).toBeInTheDocument();
  });

  it("шаг 4 у штучного товара — цена за штуку, остаток — через склад", async () => {
    at(4);
    vi.mocked(productsApi.get).mockResolvedValue(unitProduct({ status: "draft", unit_price_kop: null }));
    vi.mocked(productsApi.patch).mockResolvedValue(unitProduct({ status: "draft" }));
    renderWithAdmin(<ProductWizard id="p5" />);
    expect(await screen.findByRole("heading", { name: "Цена" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Склад/ })).toHaveAttribute("href", expect.stringContaining("/admin/inventory"));
    await userEvent.type(screen.getByLabelText("Цена за штуку"), "2500");
    await userEvent.tab();
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(productsApi.patch).toHaveBeenCalledWith("p5", { unit_price_kop: 250_000 });
  });

  it("шаг 5: характеристики и заварка по способам", async () => {
    at(5);
    vi.mocked(productsApi.get).mockResolvedValue(draftTea({ price_per_gram_kop: 1200 }));
    vi.mocked(productsApi.patch).mockResolvedValue(draftTea());
    renderWithAdmin(<ProductWizard id="p1" />);
    await userEvent.type(await screen.findByRole("textbox", { name: "Регион" }), "Уишань");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Форма" }), "cake");
    await userEvent.click(screen.getByRole("checkbox", { name: "Пролив (гунфу)" }));
    const gongfu = screen.getByRole("group", { name: "Пролив (гунфу)" });
    await userEvent.type(within(gongfu).getByRole("textbox", { name: "Температура воды, °C" }), "95");
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(productsApi.patch).toHaveBeenCalledWith("p1", {
      attributes: { region: "Уишань", shape: "cake" },
      brewing: { methods: [{ method: "gongfu", temp_c: 95 }], master_note: null },
    });
  });

  it("шаг 6: связанные товары сохраняются сразу", async () => {
    at(6);
    vi.mocked(productsApi.get).mockResolvedValue(draftTea());
    vi.mocked(productsApi.setRelations).mockResolvedValue(
      draftTea({ relations: { similar_pinned: [], goes_with: [{ id: "p9", name: "Гайвань", type: "unit", status: "published", image_url: null }], set_contains: [] } }),
    );
    renderWithAdmin(<ProductWizard id="p1" />);
    const goesWith = await screen.findByRole("group", { name: "Подойдёт к этому чаю" });
    await userEvent.click(within(goesWith).getByRole("button", { name: "Добавить товар" }));
    await userEvent.type(screen.getByPlaceholderText("Название товара"), "гайв");
    await userEvent.click(await screen.findByRole("option", { name: /Гайвань/ }));
    expect(productsApi.setRelations).toHaveBeenCalledWith("p1", "goes_with", ["p9"]);
    expect(await within(goesWith).findByText("Гайвань")).toBeInTheDocument();
  });

  it("шаг 7: предпросмотр; сервер не дал опубликовать — его текст и шаг, где поправить", async () => {
    at(7);
    vi.mocked(productsApi.get).mockResolvedValue(draftTea());
    vi.mocked(productsApi.publish).mockRejectedValue(
      new ApiError(400, "Чтобы показать товар на сайте, заполните: цену", "domain_error"),
    );
    renderWithAdmin(<ProductWizard id="p1" />);
    const preview = await screen.findByRole("region", { name: "Как это увидит покупатель" });
    expect(within(preview).getByRole("heading", { name: "Да Хун Пао" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Адрес страницы" })).toHaveValue("da-hun-pao");
    await userEvent.click(screen.getByRole("button", { name: "Показать на сайте" }));
    expect(productsApi.publish).toHaveBeenCalledWith("p1");
    expect(await screen.findByRole("alert")).toHaveTextContent("Чтобы показать товар на сайте, заполните: цену");
    await userEvent.click(screen.getByRole("button", { name: "Перейти к шагу 4: Цена и граммовки" }));
    expect(screen.getByText("Шаг 4 из 7")).toBeInTheDocument();
  });

  it("шаг 7: предпросмотр показывает цены фасовок и вкус", async () => {
    at(7);
    vi.mocked(productsApi.get).mockResolvedValue(
      draftTea({ price_per_gram_kop: 1200, weight_presets: [25, 50], flavor_tags: [{ id: "t1", name: "шоколад", slug: "shokolad" }], publish_problems: [] }),
    );
    renderWithAdmin(<ProductWizard id="p1" />);
    const preview = await screen.findByRole("region", { name: "Как это увидит покупатель" });
    expect(within(preview).getAllByText(/300\s*₽/).length).toBeGreaterThan(0);
    expect(within(preview).getAllByText(/12\s*₽\/г/).length).toBeGreaterThan(0);
    expect(within(preview).getAllByText(/шоколад/).length).toBeGreaterThan(0);
    // остатка ещё нет — честно предупреждаем
    expect(within(preview).getAllByText(/Нет в наличии/).length).toBeGreaterThan(0);
  });

  it("публикация удалась — переходим в карточку товара", async () => {
    at(7);
    vi.mocked(productsApi.get).mockResolvedValue(draftTea({ price_per_gram_kop: 1200, publish_problems: [] }));
    vi.mocked(productsApi.publish).mockResolvedValue(adminProduct());
    renderWithAdmin(<ProductWizard id="p1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Показать на сайте" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/products/p1"));
  });
});
