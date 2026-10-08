import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { categoriesApi } from "@/lib/admin/categories";
import { productsApi } from "@/lib/admin/products";
import { ApiError } from "@/lib/api/errors";
import { renderWithAdmin } from "@/tests/admin";

import { categoriesTree, draftTea, unitProduct } from "./fixtures";
import { ProductCreate } from "./ProductCreate";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => "/admin/products/new",
}));
vi.mock("@/lib/admin/products", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/products")>();
  return { ...actual, productsApi: { create: vi.fn() } };
});
vi.mock("@/lib/admin/categories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/categories")>();
  return { ...actual, categoriesApi: { list: vi.fn() } };
});

beforeEach(() => {
  search = new URLSearchParams();
  replace.mockReset();
  vi.mocked(categoriesApi.list).mockResolvedValue(categoriesTree);
});

describe("ProductCreate — новый товар, шаг 1", () => {
  it("тип, категория и название → создаём черновик и переходим к шагу 2 по адресу, который переживёт перезагрузку", async () => {
    vi.mocked(productsApi.create).mockResolvedValue(draftTea());
    renderWithAdmin(<ProductCreate />);
    expect(screen.getByText("Шаг 1 из 7")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Чай на развес/ })).toBeChecked();
    await screen.findByRole("option", { name: "Улун" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Категория" }), "c2");
    await userEvent.type(screen.getByRole("textbox", { name: /^Название/ }), "Да Хун Пао");
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(productsApi.create).toHaveBeenCalledWith({ type: "tea", name: "Да Хун Пао", category_id: "c2" });
    expect(replace).toHaveBeenCalledWith("/admin/products/p1/edit?step=2");
  });

  it("штучный товар — посуда и наборы", async () => {
    vi.mocked(productsApi.create).mockResolvedValue(unitProduct({ status: "draft" }));
    renderWithAdmin(<ProductCreate />);
    await userEvent.click(screen.getByRole("radio", { name: /Штучный товар/ }));
    await userEvent.type(screen.getByRole("textbox", { name: /^Название/ }), "Гайвань белая");
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(productsApi.create).toHaveBeenCalledWith({ type: "unit", name: "Гайвань белая", category_id: null });
    expect(replace).toHaveBeenCalledWith("/admin/products/p5/edit?step=2");
  });

  it("без названия дальше не идём и объясняем почему", async () => {
    renderWithAdmin(<ProductCreate />);
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(screen.getByText("Напишите название")).toBeInTheDocument();
    expect(productsApi.create).not.toHaveBeenCalled();
  });

  it("у поля названия есть подсказка с примером", async () => {
    renderWithAdmin(<ProductCreate />);
    await userEvent.click(screen.getByRole("button", { name: "Подсказка: Название" }));
    expect(await screen.findByText(/например/i)).toBeInTheDocument();
  });

  it("ошибка сервера — его текстом", async () => {
    vi.mocked(productsApi.create).mockRejectedValue(new ApiError(404, "Категория не найдена", "not_found"));
    renderWithAdmin(<ProductCreate />);
    await userEvent.type(screen.getByRole("textbox", { name: /^Название/ }), "Да Хун Пао");
    await userEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Категория не найдена");
    expect(replace).not.toHaveBeenCalled();
  });
});
